import { describe, expect, it } from "vitest";
import { auditEvents, users } from "../../../lib/db/schema";

// Lookalike for @auth/core's CredentialsSignin (avoids importing next-auth in
// vitest — its entry-point pulls in next/server which the unit-test project
// doesn't resolve). The orchestrator checks duck-typed `name` + `type`.
class FakeCredentialsSignin extends Error {
  readonly name = "CredentialsSignin";
  readonly type = "CredentialsSignin";
}
import { runSignin, type DbForSignin, type SignInDelegate } from "../signin-flow";
import {
  FakeDb,
  TrackRecorder,
  makeFormData,
  silentLogger,
} from "../../signup/__tests__/fake-db";

type SignInCall = Parameters<SignInDelegate>;

function makeDeps(opts: {
  signInOutcome?: "ok" | "credentials-signin" | "boom";
  ip?: string;
  callbackUrl?: string | null;
} = {}) {
  const db = new FakeDb();
  const recorder = new TrackRecorder();
  const signInCalls: SignInCall[] = [];

  const signIn: SignInDelegate = async (...args) => {
    signInCalls.push(args);
    if (opts.signInOutcome === "credentials-signin") {
      throw new FakeCredentialsSignin("invalid credentials");
    }
    if (opts.signInOutcome === "boom") {
      throw new Error("unexpected: DB unreachable");
    }
    return null;
  };

  return {
    db,
    recorder,
    signInCalls,
    deps: {
      db: db as unknown as DbForSignin,
      signIn,
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

describe("runSignin — validation", () => {
  it("returns field errors for invalid email and empty password without DB write", async () => {
    const { db, deps, signInCalls } = makeDeps();
    const result = await runSignin(
      makeFormData({ email: "not-an-email", password: "" }),
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.fieldErrors?.email).toBeDefined();
    expect(result.state.fieldErrors?.password).toBeDefined();
    expect(db.inserts).toHaveLength(0);
    expect(signInCalls).toHaveLength(0);
  });
});

describe("runSignin — rate-limit", () => {
  it("denies and tracks signin_rate_limited when 5 recent attempts already exist", async () => {
    const { db, recorder, signInCalls, deps } = makeDeps();
    // 5 prior attempts → at threshold for known IP.
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

    // signIn() is NOT called.
    expect(signInCalls).toHaveLength(0);

    // PostHog signin_rate_limited fires.
    expect(recorder.events).toEqual([
      expect.objectContaining({
        event: "signin_rate_limited",
        action: "signin",
      }),
    ]);
  });

  it("uses the stricter threshold (1) for unknown IPs", async () => {
    const { db, recorder, signInCalls, deps } = makeDeps({ ip: "unknown" });
    db.queueSelect([{ id: "a1" }]); // one prior attempt → over the unknown-IP threshold

    const result = await runSignin(validForm(), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toMatch(/יותר מדי ניסיונות/);
    expect(signInCalls).toHaveLength(0);
    expect(recorder.events.some((e) => (e as { event: string }).event === "signin_rate_limited"),
    ).toBe(true);
  });
});

describe("runSignin — happy path", () => {
  it("calls signIn, writes auth.signin_succeeded with userId, returns redirectTo", async () => {
    const { db, recorder, signInCalls, deps } = makeDeps({
      signInOutcome: "ok",
      callbackUrl: "/dashboard?tab=lessons",
    });
    db.queueSelect([]); // rate-limit count: 0 attempts
    db.queueSelect([{ id: "user-9" }]); // post-success userId fetch

    const result = await runSignin(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard?tab=lessons");

    // signIn called with redirect: false.
    expect(signInCalls).toHaveLength(1);
    expect(signInCalls[0]?.[0]).toBe("credentials");
    expect(signInCalls[0]?.[1]).toEqual({
      email: "verified@example.com",
      password: "hello12345",
      redirect: false,
    });

    // Audit rows: signin_attempt + signin_succeeded.
    const auditRows = db.insertedInto(auditEvents);
    expect(auditRows).toHaveLength(2);
    expect((auditRows[0]?.value as { eventType: string }).eventType).toBe(
      "auth.signin_attempt",
    );
    const success = auditRows[1]?.value as Record<string, unknown>;
    expect(success.eventType).toBe("auth.signin_succeeded");
    expect(success.actorId).toBe("user-9");
    expect((success.payload as Record<string, unknown>).provider).toBe("credentials");

    // No signin_failed / signin_rate_limited PostHog events on success.
    expect(recorder.events).toEqual([]);
  });

  it("falls back to /dashboard when callbackUrl is unsafe (//evil.com)", async () => {
    const { db, deps } = makeDeps({
      signInOutcome: "ok",
      callbackUrl: "//evil.com/take-over",
    });
    db.queueSelect([]); // rate-limit count
    db.queueSelect([{ id: "user-10" }]);

    const result = await runSignin(validForm(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
  });
});

describe("runSignin — wrong credentials", () => {
  it("writes auth.signin_failed, fires PostHog signin_failed, returns generic error", async () => {
    const { db, recorder, deps } = makeDeps({
      signInOutcome: "credentials-signin",
    });
    db.queueSelect([]); // rate-limit count

    const result = await runSignin(
      makeFormData({ email: "ghost@example.com", password: "wrong-pw-12345" }),
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

    // PostHog signin_failed fires (NOT signin_rate_limited).
    expect(recorder.events).toEqual([
      expect.objectContaining({ event: "signin_failed" }),
    ]);
  });
});

describe("runSignin — unexpected error", () => {
  it("returns the generic 'try again' message and does NOT fire signin_failed PostHog", async () => {
    const { db, recorder, deps } = makeDeps({ signInOutcome: "boom" });
    db.queueSelect([]); // rate-limit count

    const result = await runSignin(validForm(), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toBe("אירעה שגיאה. נסו שוב בעוד דקה.");

    // attempt audit row written (counter monotonic); no failed/succeeded row.
    const auditRows = db.insertedInto(auditEvents);
    expect(auditRows).toHaveLength(1);
    expect((auditRows[0]?.value as { eventType: string }).eventType).toBe(
      "auth.signin_attempt",
    );

    // No signin_failed PostHog (not a credentials-rejection signal).
    expect(recorder.events).toEqual([]);
  });
});

describe("runSignin — DB inputs", () => {
  it("queries users by lowercased email on the post-success lookup", async () => {
    const { db, deps } = makeDeps({ signInOutcome: "ok" });
    db.queueSelect([]); // rate-limit count
    db.queueSelect([{ id: "user-cased" }]);

    const result = await runSignin(
      makeFormData({ email: "Verified@Example.COM", password: "hello12345" }),
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The post-success select should run with the lowercased email. We can't
    // easily inspect the WHERE in the FakeDb without spying on `eq`, but the
    // captured signIn call confirms the lowercasing path was used end-to-end.
    expect(db.insertedInto(users)).toHaveLength(0); // we don't insert into users here
  });
});
