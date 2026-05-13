import { describe, expect, it } from "vitest";
import {
  auditEvents,
  passwordResetTokens,
} from "../../../lib/db/schema";
import { runForgotPassword } from "../forgot-flow";
import type { DbForForgot } from "../forgot-flow";
import {
  FakeDb,
  FakeEmailProvider,
  TrackRecorder,
  makeFormData,
  silentLogger,
} from "../../signup/__tests__/fake-db";

function makeDeps() {
  const db = new FakeDb();
  const email = new FakeEmailProvider();
  const recorder = new TrackRecorder();
  return {
    db,
    email,
    recorder,
    deps: {
      db: db as unknown as DbForForgot,
      emailProvider: email,
      ip: "10.0.0.1",
      origin: "https://teachme.test",
      track: recorder.capture,
      logger: silentLogger,
    },
  };
}

const FORM = makeFormData({ email: "user@example.com" });

describe("runForgotPassword — user exists with passwordHash", () => {
  it("invalidates old tokens, issues a new one, sends the email, fires the analytics event, redirects", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0 attempts
    db.queueSelect([
      { id: "user-1", name: "אופר", passwordHash: "$argon2id$...", deletedAt: null },
    ]);

    const result = await runForgotPassword(FORM, deps);

    expect(result).toEqual({
      kind: "redirect",
      url: "/signin/forgot/sent?email=user%40example.com",
    });

    // Pre-issue token cleanup (one DELETE on password_reset_tokens) + new token INSERT.
    expect(db.deletes).toHaveLength(1);
    expect(db.deletes[0]?.table).toBe(passwordResetTokens);
    expect(db.insertedInto(passwordResetTokens)).toHaveLength(1);

    // Audit rows: attempt (always written) + auth.password_reset_requested (on send path).
    expect(db.insertedInto(auditEvents)).toHaveLength(2);

    // Email sent with the auth-password-reset template + resetUrl in payload.
    expect(email.sends).toHaveLength(1);
    const sent = email.sends[0]!;
    expect(sent.toAddress).toBe("user@example.com");
    expect(sent.templateId).toBe("auth-password-reset");
    expect(sent.payload.resetUrl).toMatch(/^https:\/\/teachme\.test\/signin\/reset\?token=/);
    expect(sent.payload.expiresInMinutes).toBe(15);
    expect(sent.payload.displayName).toBe("אופר");

    // Analytics fired exactly once.
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      event: "password_reset_requested",
    });
  });
});

describe("runForgotPassword — anti-enumeration", () => {
  it("redirects to the same success URL when no user is found, sends NO email, fires NO analytics", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0
    db.queueSelect([]); // user lookup: empty

    const result = await runForgotPassword(FORM, deps);

    expect(result).toEqual({
      kind: "redirect",
      url: "/signin/forgot/sent?email=user%40example.com",
    });
    expect(db.insertedInto(passwordResetTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
    expect(recorder.events).toEqual([]);
    // Attempt-audit + no_user-outcome audit = 2 rows.
    expect(db.insertedInto(auditEvents)).toHaveLength(2);
  });

  it("redirects to the same success URL for an OAuth-only user (no passwordHash), sends NO email", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0
    db.queueSelect([
      { id: "user-2", name: null, passwordHash: null, deletedAt: null },
    ]);

    const result = await runForgotPassword(FORM, deps);

    expect(result).toEqual({
      kind: "redirect",
      url: "/signin/forgot/sent?email=user%40example.com",
    });
    expect(db.insertedInto(passwordResetTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });

  it("treats a soft-deleted user as no-user", async () => {
    const { db, email, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    db.queueSelect([
      {
        id: "user-3",
        name: "deleted",
        passwordHash: "$argon2id$...",
        deletedAt: new Date("2026-04-01T00:00:00Z"),
      },
    ]);

    const result = await runForgotPassword(FORM, deps);

    expect(result).toEqual({
      kind: "redirect",
      url: "/signin/forgot/sent?email=user%40example.com",
    });
    expect(db.insertedInto(passwordResetTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
  });
});

describe("runForgotPassword — rate-limited", () => {
  it("tracks password_reset_rate_limited, redirects to the same success URL, does NOT send email", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>(
      Array.from({ length: 5 }, (_, i) => ({ id: `r-${i}` })),
    );

    const result = await runForgotPassword(FORM, deps);

    expect(result).toEqual({
      kind: "redirect",
      url: "/signin/forgot/sent?email=user%40example.com",
    });
    expect(db.insertedInto(passwordResetTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      event: "password_reset_rate_limited",
      action: "password_reset_request",
    });
  });
});

describe("runForgotPassword — invalid email", () => {
  it("returns invalid_email with the raw email, does NOT touch the DB", async () => {
    const { db, email, deps } = makeDeps();
    const form = makeFormData({ email: "not-an-email" });

    const result = await runForgotPassword(form, deps);

    expect(result).toEqual({ kind: "invalid_email", email: "not-an-email" });
    expect(db.inserts).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
  });

  it("returns invalid_email for an empty email field", async () => {
    const { db, deps } = makeDeps();
    const form = makeFormData({ email: "" });

    const result = await runForgotPassword(form, deps);

    expect(result.kind).toBe("invalid_email");
    expect(db.inserts).toHaveLength(0);
  });
});

describe("runForgotPassword — DB failure", () => {
  it("still redirects to the success screen if the DB write fails (anti-enumeration on failure path)", async () => {
    const { db, email, deps } = makeDeps();
    db.failNext = new Error("Neon HTTP 503");

    const result = await runForgotPassword(FORM, deps);

    expect(result).toEqual({
      kind: "redirect",
      url: "/signin/forgot/sent?email=user%40example.com",
    });
    expect(email.sends).toHaveLength(0);
  });
});
