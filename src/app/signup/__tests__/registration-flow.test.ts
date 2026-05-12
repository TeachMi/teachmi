import { describe, expect, it } from "vitest";
import {
  auditEvents,
  users,
  verificationTokens,
} from "../../../lib/db/schema";
import { runRegister } from "../registration-flow";
import type { DbForRegister } from "../registration-flow";
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
      db: db as unknown as DbForRegister,
      emailProvider: email,
      ip: "10.0.0.1",
      origin: "https://teachme.test",
      track: recorder.capture,
      logger: silentLogger,
    },
  };
}

function validForm(): FormData {
  return makeFormData({
    name: "Test Student",
    email: "Test@Example.com",
    password: "hello12345",
    role: "student",
    tos: "on",
  });
}

describe("runRegister — happy path", () => {
  it("writes attempt audit + lowercase user + token + user_registered audit, sends email, tracks signup_completed, redirects", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit count (0 attempts)
    db.queueReturning<{ id: string }>([{ id: "user-1" }]); // user insert ON CONFLICT … RETURNING

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );

    // 3 inserts into audit_events (attempt + user_registered), 1 into users, 1 into verificationTokens
    expect(db.insertedInto(auditEvents)).toHaveLength(2);
    expect(db.insertedInto(users)).toHaveLength(1);
    expect(db.insertedInto(verificationTokens)).toHaveLength(1);

    const attempt = db.insertedInto(auditEvents)[0]?.value as Record<string, unknown>;
    expect(attempt.eventType).toBe("auth.signup_attempt");
    expect(attempt.actorMeta).toBe("10.0.0.1");

    const userInsert = db.insertedInto(users)[0]?.value as Record<string, unknown>;
    expect(userInsert.email).toBe("test@example.com"); // lowercased
    expect(userInsert.role).toBe("student");
    expect(userInsert.createdByKind).toBe("user");
    expect(userInsert.createdByActor).toBe("self-signup");
    expect(typeof userInsert.passwordHash).toBe("string");
    expect((userInsert.passwordHash as string).startsWith("$argon2id$")).toBe(true);

    const tokenInsert = db.insertedInto(verificationTokens)[0]?.value as Record<string, unknown>;
    expect(tokenInsert.identifier).toBe("test@example.com");
    expect(typeof tokenInsert.token).toBe("string");
    expect((tokenInsert.token as string).length).toBeGreaterThanOrEqual(43);

    const userRegistered = db.insertedInto(auditEvents)[1]?.value as Record<string, unknown>;
    expect(userRegistered.eventType).toBe("auth.user_registered");
    expect(userRegistered.actorId).toBe("user-1");

    expect(email.sends).toHaveLength(1);
    expect(email.sends[0]?.toAddress).toBe("test@example.com");
    expect(email.sends[0]?.templateId).toBe("auth-verify-email");
    expect(email.sends[0]?.payload.verifyUrl).toMatch(
      /^https:\/\/teachme\.test\/signup\/verify\?token=/,
    );

    expect(recorder.events).toEqual([
      { event: "signup_completed", userId: "user-1", role: "student" },
    ]);
  }, 30_000);
});

describe("runRegister — validation", () => {
  it("returns fieldErrors when password is too short", async () => {
    const { deps } = makeDeps();
    const form = validForm();
    form.set("password", "short");

    const result = await runRegister(form, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.fieldErrors?.password).toContain("10 תווים");
  });

  it("returns fieldErrors when ToS is unchecked", async () => {
    const { deps } = makeDeps();
    const form = validForm();
    form.delete("tos");

    const result = await runRegister(form, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.fieldErrors?.tos).toBeDefined();
  });

  it("returns fieldErrors when email is malformed", async () => {
    const { deps } = makeDeps();
    const form = validForm();
    form.set("email", "not-an-email");

    const result = await runRegister(form, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.fieldErrors?.email).toBeDefined();
  });

  it("does NOT touch the database when validation fails", async () => {
    const { db, deps } = makeDeps();
    const form = validForm();
    form.set("password", "short");

    await runRegister(form, deps);

    expect(db.inserts).toHaveLength(0);
    expect(db.selectResponses).toHaveLength(0); // nothing was consumed
  });
});

describe("runRegister — email collision", () => {
  it("returns a generic formError (no enumeration) when the email already exists", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0 attempts
    // ON CONFLICT … DO NOTHING … RETURNING produces an empty array when a
    // collision occurs. The fake's `insert(...).values(...).returning(...)`
    // shifts the next `returningResponses` entry — empty means collision.
    db.queueReturning<{ id: string }>([]);

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toBe(
      "אימייל זה כבר רשום במערכת. נסו להיכנס.",
    );
    // The attempted INSERT into users is captured by the fake (the FakeDb
    // records all inserts regardless of whether RETURNING returned rows).
    // No verificationTokens insert and no user_registered audit row.
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    // Only attempt-audit + the (conflicted) user insert.
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    expect(db.insertedInto(users)).toHaveLength(1);
    // No email sent and signup_completed NOT fired.
    expect(email.sends).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });
});

describe("runRegister — rate-limited", () => {
  it("returns the rate-limit message and tracks signup_rate_limited", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>(Array.from({ length: 5 }, (_, i) => ({ id: `attempt-${i}` })));

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toContain("יותר מדי ניסיונות");

    // The throttled attempt still writes its own audit row (counted toward future windows).
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    // No user created, no token issued, no email sent.
    expect(db.insertedInto(users)).toHaveLength(0);
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
    // signup_rate_limited fires; signup_completed does NOT.
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      event: "signup_rate_limited",
      action: "signup",
    });
    expect((recorder.events[0] as { anonymizedIp: string }).anonymizedIp).toMatch(
      /^ip:[0-9a-f]{8}$/,
    );
  });
});

describe("runRegister — email-send failure is non-fatal", () => {
  it("still redirects to verify-email-sent when the email provider throws", async () => {
    const { db, email, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0
    db.queueReturning<{ id: string }>([{ id: "user-2" }]); // user RETURNING (no conflict)
    email.failNext = new Error("SMTP down");

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );
    // User row + token + audit rows are still committed
    expect(db.insertedInto(users)).toHaveLength(1);
    expect(db.insertedInto(verificationTokens)).toHaveLength(1);
  }, 30_000);
});

describe("runRegister — dev-only skip-email-verification", () => {
  it("stamps emailVerified=now() on insert, skips token + email, redirects to /signin?verified=1", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit count
    db.queueReturning<{ id: string }>([{ id: "user-dev-1" }]);

    const result = await runRegister(validForm(), {
      ...deps,
      skipEmailVerification: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/signin?verified=1");

    // User row inserted with emailVerified set (a Date instance, value =
    // approximately now). No verification-token row, no email send.
    const userInsert = db.insertedInto(users)[0]?.value as Record<string, unknown>;
    expect(userInsert.email).toBe("test@example.com");
    expect(userInsert.emailVerified).toBeInstanceOf(Date);
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);

    // Audit row records the bypass via the devEmailVerificationSkipped flag.
    const userRegistered = db.insertedInto(auditEvents)[1]?.value as Record<string, unknown>;
    expect(userRegistered.eventType).toBe("auth.user_registered");
    const payload = userRegistered.payload as Record<string, unknown>;
    expect(payload.requiresVerification).toBe(false);
    expect(payload.devEmailVerificationSkipped).toBe(true);

    // signup_completed analytics still fires on this path — the user is fully
    // registered, just verification-skipped. Loop-gate counts this run.
    expect(recorder.events).toEqual([
      { event: "signup_completed", userId: "user-dev-1", role: "student" },
    ]);
  }, 30_000);

  it("default (no skipEmailVerification) preserves the email-loop branch", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    db.queueReturning<{ id: string }>([{ id: "user-default-1" }]);

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );
    // Email loop intact: token + email send both happen.
    expect(db.insertedInto(verificationTokens)).toHaveLength(1);
    expect(email.sends).toHaveLength(1);
    expect(recorder.events).toHaveLength(1);
  }, 30_000);
});
