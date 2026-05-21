import { describe, expect, it } from "vitest";
import { auditEvents, sessions } from "../../../lib/db/schema";
import { runSignin, type DbForSignin } from "../signin-flow";
import {
  FakeDb,
  TrackRecorder,
  makeFormData,
  silentLogger,
} from "../../signup/__tests__/fake-db";

function makeDeps(opts: {
  verifyResult?: boolean;
  ip?: string;
  callbackUrl?: string | null;
} = {}) {
  const db = new FakeDb();
  const recorder = new TrackRecorder();
  const verifyCalls: Array<[string, string]> = [];
  const verifyPassword = async (plain: string, encoded: string) => {
    verifyCalls.push([plain, encoded]);
    return opts.verifyResult ?? true;
  };

  return {
    db,
    recorder,
    verifyCalls,
    deps: {
      db: db as unknown as DbForSignin,
      verifyPassword,
      generateSessionToken: () => "fixed-session-token",
      now: () => new Date("2026-05-12T10:00:00.000Z"),
      ip: opts.ip ?? "10.0.0.42",
      callbackUrl: opts.callbackUrl ?? null,
      track: recorder.capture,
      logger: silentLogger,
    },
  };
}

function validForm(overrides: Record<string, string> = {}): FormData {
  return makeFormData({
    email: "verified@example.com",
    password: "hello12345",
    ...overrides,
  });
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "verified@example.com",
    name: "Verified",
    role: "student",
    emailVerified: new Date("2026-05-10T00:00:00Z"),
    image: null,
    passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
    deletedAt: null,
    ...overrides,
  };
}

describe("runSignin — validation", () => {
  it("returns field errors for invalid email and empty password without DB write", async () => {
    const { db, deps } = makeDeps();
    const result = await runSignin(
      makeFormData({ email: "not-an-email", password: "" }),
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.fieldErrors?.email).toBeDefined();
    expect(result.state.fieldErrors?.password).toBeDefined();
    expect(db.inserts).toHaveLength(0);
  });
});

describe("runSignin — rate-limit", () => {
  it("denies and tracks signin_rate_limited when 5 recent attempts already exist", async () => {
    const { db, recorder, deps } = makeDeps();
    db.queueSelect([
      { id: "a1" },
      { id: "a2" },
      { id: "a3" },
      { id: "a4" },
      { id: "a5" },
    ]);

    const result = await runSignin(validForm(), deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toBe("יותר מדי ניסיונות. נסו שוב בעוד דקה.");

    // The attempt row is STILL written so the counter is monotonic.
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const attempt = db.insertedInto(auditEvents)[0]?.value as Record<string, unknown>;
    expect(attempt.eventType).toBe("auth.signin_attempt");
    expect(attempt.actorMeta).toBe("10.0.0.42");

    // No verify, no users lookup, no session.
    expect(db.insertedInto(sessions)).toHaveLength(0);

    expect(recorder.events).toEqual([
      expect.objectContaining({
        event: "signin_rate_limited",
        action: "signin",
      }),
    ]);
  });

  it("uses the stricter threshold (1) for unknown IPs", async () => {
    const { db, recorder, deps } = makeDeps({ ip: "unknown" });
    db.queueSelect([{ id: "a1" }]);

    const result = await runSignin(validForm(), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toMatch(/יותר מדי ניסיונות/);
    expect(db.insertedInto(sessions)).toHaveLength(0);
    expect(
      recorder.events.some(
        (e) => (e as { event: string }).event === "signin_rate_limited",
      ),
    ).toBe(true);
  });
});

describe("runSignin — happy path", () => {
  it("authorizes the user, inserts a sessions row, writes signin_succeeded audit, returns cookie material", async () => {
    const { db, recorder, deps } = makeDeps({
      verifyResult: true,
      callbackUrl: "/dashboard?tab=lessons",
    });
    db.queueSelect([]); // rate-limit count: 0 attempts
    db.queueSelect([userRow()]); // authorize → users SELECT

    const result = await runSignin(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard?tab=lessons");
    expect(result.sessionToken).toBe("fixed-session-token");

    // Audit rows: signin_attempt + signin_succeeded.
    const auditRows = db.insertedInto(auditEvents);
    expect(auditRows).toHaveLength(2);
    expect((auditRows[0]?.value as { eventType: string }).eventType).toBe(
      "auth.signin_attempt",
    );
    const success = auditRows[1]?.value as Record<string, unknown>;
    expect(success.eventType).toBe("auth.signin_succeeded");
    expect(success.actorId).toBe("user-1");
    expect((success.payload as Record<string, unknown>).provider).toBe("credentials");

    // Sessions row.
    const sessionInserts = db.insertedInto(sessions);
    expect(sessionInserts).toHaveLength(1);
    const sessionInsert = sessionInserts[0]?.value as Record<string, unknown>;
    expect(sessionInsert.sessionToken).toBe("fixed-session-token");
    expect(sessionInsert.userId).toBe("user-1");

    // No PostHog events on the happy path.
    expect(recorder.events).toEqual([]);
  });

  it("falls back to /dashboard when callbackUrl is unsafe (//evil.com)", async () => {
    const { db, deps } = makeDeps({
      verifyResult: true,
      callbackUrl: "//evil.com/take-over",
    });
    db.queueSelect([]); // rate-limit count
    db.queueSelect([userRow()]); // authorize

    const result = await runSignin(validForm(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
  });
});

describe("runSignin — wrong credentials", () => {
  it("redirects an unverified user with a correct password to the verification-code prompt", async () => {
    const { db, recorder, verifyCalls, deps } = makeDeps({
      verifyResult: true,
      callbackUrl: "/dashboard?tab=lessons",
    });
    db.queueSelect([]); // rate-limit count
    db.queueSelect([userRow({ emailVerified: null })]); // user lookup happens, then verify succeeds

    const result = await runSignin(validForm(), deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=verified%40example.com&next=%2Fdashboard%3Ftab%3Dlessons",
    );
    expect(result.state.formError).toBeUndefined();
    expect(verifyCalls).toEqual([["hello12345", "$argon2id$v=19$m=19456,t=2,p=1$abc$def"]]);

    // This is not a wrong-password failure: no failed audit, no session, no PostHog failure event.
    const auditRows = db.insertedInto(auditEvents);
    expect(auditRows).toHaveLength(1);
    expect((auditRows[0]?.value as { eventType: string }).eventType).toBe(
      "auth.signin_attempt",
    );
    expect(db.insertedInto(sessions)).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });

  it("returns generic error + writes auth.signin_failed + fires signin_failed PostHog when verifyPassword returns false", async () => {
    const { db, recorder, deps } = makeDeps({ verifyResult: false });
    db.queueSelect([]); // rate-limit count
    db.queueSelect([userRow()]); // user lookup happens, then verify fails

    const result = await runSignin(
      makeFormData({ email: "verified@example.com", password: "wrong-pw-12345" }),
      deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toBe("אימייל או סיסמה לא נכונים.");

    const auditRows = db.insertedInto(auditEvents);
    expect(auditRows).toHaveLength(2); // attempt + failed
    const failed = auditRows[1]?.value as Record<string, unknown>;
    expect(failed.eventType).toBe("auth.signin_failed");
    expect(failed.actorMeta).toBe("10.0.0.42");
    expect(failed.actorId).toBeNull();
    expect((failed.payload as Record<string, unknown>).reason).toBe(
      "invalid_credentials",
    );
    expect((failed.payload as Record<string, unknown>).emailHash).toBeDefined();

    // No sessions row.
    expect(db.insertedInto(sessions)).toHaveLength(0);

    // PostHog signin_failed fires.
    expect(recorder.events).toEqual([
      expect.objectContaining({ event: "signin_failed" }),
    ]);
  });

  it("returns generic error when no user matches the email (authorize returns null without calling verify)", async () => {
    const { db, recorder, verifyCalls, deps } = makeDeps();
    db.queueSelect([]); // rate-limit count
    db.queueSelect([]); // authorize: no user found

    const result = await runSignin(
      makeFormData({ email: "ghost@example.com", password: "hello12345" }),
      deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toBe("אימייל או סיסמה לא נכונים.");

    // Verify NOT called (short-circuit confirms the timing trade-off).
    expect(verifyCalls).toHaveLength(0);

    // auth.signin_failed still written.
    const auditRows = db.insertedInto(auditEvents);
    expect(auditRows).toHaveLength(2);
    expect((auditRows[1]?.value as { eventType: string }).eventType).toBe(
      "auth.signin_failed",
    );

    // PostHog signin_failed fires.
    expect(recorder.events).toEqual([
      expect.objectContaining({ event: "signin_failed" }),
    ]);
  });

  it("returns generic error for soft-deleted users without calling verify", async () => {
    const { db, verifyCalls, deps } = makeDeps();
    db.queueSelect([]); // rate-limit count
    db.queueSelect([userRow({ deletedAt: new Date("2026-04-01T00:00:00Z") })]);

    const result = await runSignin(validForm(), deps);
    expect(result.ok).toBe(false);
    expect(verifyCalls).toHaveLength(0);
    if (result.ok) return;
    expect(result.state.formError).toBe("אימייל או סיסמה לא נכונים.");
  });
});

describe("runSignin — unexpected error", () => {
  it("returns the generic 'try again' message when the rate-limit SELECT fails", async () => {
    const { db, recorder, deps } = makeDeps();
    db.failNext = new Error("Neon fetch failed");

    const result = await runSignin(validForm(), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toBe("אירעה שגיאה. נסו שוב בעוד דקה.");

    // No audit rows, no sessions, no PostHog.
    expect(db.inserts).toHaveLength(0);
    expect(db.insertedInto(sessions)).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });

  it("returns the generic 'try again' message when the sessions INSERT fails", async () => {
    const db = new FakeDb();
    const recorder = new TrackRecorder();
    db.queueSelect([]); // rate-limit count
    db.queueSelect([userRow()]); // authorize: user found
    // Now queue a fail for the NEXT insert. The first insert (signin_attempt
    // audit) goes through; we want the SESSIONS insert to fail. Set failNext
    // after consuming the first insert by chaining a custom mock here.
    // Simpler approach: queue this test by failing on the second insert via
    // patching the FakeDb's insert method.
    let insertCount = 0;
    const realInsert = db.insert;
    db.insert = ((table: unknown) => {
      insertCount += 1;
      if (insertCount === 2) {
        // Second insert is the sessions row — fail it.
        db.failNext = new Error("sessions INSERT failed");
      }
      return realInsert.call(db, table);
    }) as typeof db.insert;

    const result = await runSignin(validForm(), {
      db: db as unknown as DbForSignin,
      verifyPassword: async () => true,
      generateSessionToken: () => "tok",
      now: () => new Date("2026-05-12T10:00:00.000Z"),
      ip: "10.0.0.42",
      callbackUrl: null,
      track: recorder.capture,
      logger: silentLogger,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toBe("אירעה שגיאה. נסו שוב בעוד דקה.");
  });
});
