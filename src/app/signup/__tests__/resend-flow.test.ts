import { describe, expect, it } from "vitest";
import {
  auditEvents,
  verificationTokens,
} from "../../../lib/db/schema";
import { runResend } from "../resend-flow";
import type { DbForResend } from "../resend-flow";
import {
  FakeDb,
  FakeEmailProvider,
  TrackRecorder,
  makeFormData,
  silentLogger,
} from "./fake-db";

function makeDeps() {
  const db = new FakeDb();
  const email = new FakeEmailProvider();
  const recorder = new TrackRecorder();
  return {
    db,
    email,
    recorder,
    deps: {
      db: db as unknown as DbForResend,
      emailProvider: email,
      ip: "10.0.0.1",
      origin: "https://teachme.test",
      track: recorder.capture,
      logger: silentLogger,
    },
  };
}

const FORM = makeFormData({ email: "user@example.com" });

describe("runResend — user exists and unverified", () => {
  it("issues a new token, sends the email, and redirects to verify-email-sent", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0
    db.queueSelect([{ id: "user-1", emailVerified: null }]); // user lookup

    const result = await runResend(FORM, deps);

    expect(result.kind).toBe("redirect");
    expect(result.url).toBe(
      "/signup/verify-email-sent?email=user%40example.com",
    );

    // Always writes an attempt audit row.
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    expect(db.insertedInto(verificationTokens)).toHaveLength(1);
    expect(email.sends).toHaveLength(1);
    expect(email.sends[0]?.toAddress).toBe("user@example.com");
    expect(recorder.events).toEqual([]); // no signup_rate_limited
  });
});

describe("runResend — no enumeration", () => {
  it("redirects to verify-email-sent even when no user exists, without sending email", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0
    db.queueSelect([]); // user lookup: not found

    const result = await runResend(FORM, deps);

    expect(result.kind).toBe("redirect");
    expect(result.url).toBe(
      "/signup/verify-email-sent?email=user%40example.com",
    );
    // No token, no email, no track — but the attempt audit IS written.
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    expect(email.sends).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });

  it("redirects to verify-email-sent even when the user is already verified", async () => {
    const { db, email, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0
    db.queueSelect([
      { id: "user-2", emailVerified: new Date("2026-05-01T00:00:00Z") },
    ]);

    const result = await runResend(FORM, deps);

    expect(result.kind).toBe("redirect");
    expect(result.url).toBe(
      "/signup/verify-email-sent?email=user%40example.com",
    );
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
  });
});

describe("runResend — rate-limited", () => {
  it("tracks signup_rate_limited, skips the email + token, still redirects to verify-email-sent", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>(
      Array.from({ length: 5 }, (_, i) => ({ id: `r-${i}` })),
    );

    const result = await runResend(FORM, deps);

    expect(result.kind).toBe("redirect");
    expect(result.url).toBe(
      "/signup/verify-email-sent?email=user%40example.com",
    );
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      event: "signup_rate_limited",
      action: "signup_resend",
    });
  });
});

describe("runResend — invalid email", () => {
  it("redirects to verify-error?reason=missing without touching the DB", async () => {
    const { db, email, deps } = makeDeps();
    const form = makeFormData({ email: "not-an-email" });

    const result = await runResend(form, deps);

    expect(result.kind).toBe("invalid_email");
    expect(result.url).toBe("/signup/verify-error?reason=missing");
    expect(db.inserts).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
  });
});
