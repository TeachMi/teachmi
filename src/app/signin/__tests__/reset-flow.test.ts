import { describe, expect, it } from "vitest";
import {
  auditEvents,
  passwordResetTokens,
  sessions,
  users,
} from "../../../lib/db/schema";
import { runResetPassword } from "../reset-flow";
import type { DbForReset } from "../reset-flow";
import {
  FakeDb,
  TrackRecorder,
  makeFormData,
  silentLogger,
} from "../../signup/__tests__/fake-db";

const VALID_TOKEN = "abcdef0123456789abcdef0123456789abcdef0123";
const VALID_PASSWORD = "newhello12345";
const FUTURE = new Date(Date.now() + 10 * 60 * 1000); // +10 min
const PAST = new Date(Date.now() - 30 * 60 * 1000); // -30 min

function makeDeps(overrides: Partial<Parameters<typeof runResetPassword>[1]> = {}) {
  const db = new FakeDb();
  const recorder = new TrackRecorder();
  return {
    db,
    recorder,
    deps: {
      db: db as unknown as DbForReset,
      ip: "10.0.0.1",
      track: recorder.capture,
      logger: silentLogger,
      // Tests substitute a synchronous hasher to keep them fast + deterministic.
      hashPassword: async (plain: string) => `hashed:${plain}`,
      ...overrides,
    },
  };
}

const FORM_VALID = makeFormData({
  token: VALID_TOKEN,
  password: VALID_PASSWORD,
  passwordConfirm: VALID_PASSWORD,
});

describe("runResetPassword — happy path", () => {
  it("updates passwordHash, deletes the consumed token and other tokens, wipes all sessions, audits, fires analytics, redirects", async () => {
    const { db, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0 attempts
    db.queueSelect([{ identifier: "user@example.com", expires: FUTURE }]); // token lookup
    db.queueSelect([{ id: "user-1", role: "student", deletedAt: null }]); // user lookup

    const result = await runResetPassword(FORM_VALID, deps);

    expect(result).toEqual({ ok: true, redirectTo: "/signin?reset=1" });

    // users UPDATE with the new hash.
    expect(db.updatedAt(users)).toHaveLength(1);
    const userUpdate = db.updatedAt(users)[0]!;
    expect(userUpdate.set).toMatchObject({
      passwordHash: `hashed:${VALID_PASSWORD}`,
      updatedByKind: "user",
      updatedByActor: "user-1",
    });

    // Token DELETEs: one by token (consumed), one by identifier (best-effort cleanup).
    const tokenDeletes = db.deletes.filter((d) => d.table === passwordResetTokens);
    expect(tokenDeletes).toHaveLength(2);

    // sessions DELETE for this user (force re-sign-in everywhere).
    const sessionDeletes = db.deletes.filter((d) => d.table === sessions);
    expect(sessionDeletes).toHaveLength(1);

    // Audit rows: attempt + completed_attempt + completed = 3.
    expect(db.insertedInto(auditEvents)).toHaveLength(3);

    // Analytics: one password_reset_completed.
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      event: "password_reset_completed",
      userId: "user-1",
      role: "student",
    });
  });
});

describe("runResetPassword — rate-limited", () => {
  it("returns the throttle formError, fires analytics, does NOT touch users or sessions", async () => {
    const { db, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>(
      Array.from({ length: 5 }, (_, i) => ({ id: `r-${i}` })),
    );

    const result = await runResetPassword(FORM_VALID, deps);

    expect(result).toEqual({
      ok: false,
      state: { ok: false, formError: "יותר מדי ניסיונות. נסו שוב בעוד דקה." },
    });
    expect(db.updatedAt(users)).toHaveLength(0);
    expect(db.deletes.filter((d) => d.table === sessions)).toHaveLength(0);
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      event: "password_reset_rate_limited",
      action: "password_reset_confirm",
    });
  });
});

describe("runResetPassword — field validation", () => {
  it("rejects an empty token", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0
    const form = makeFormData({
      token: "",
      password: VALID_PASSWORD,
      passwordConfirm: VALID_PASSWORD,
    });

    const result = await runResetPassword(form, deps);

    expect(result).toMatchObject({ ok: false });
    if ("state" in result) {
      expect(result.state.fieldErrors?.token).toBeTruthy();
    }
    expect(db.updatedAt(users)).toHaveLength(0);
  });

  it("rejects a weak password", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    const form = makeFormData({
      token: VALID_TOKEN,
      password: "short",
      passwordConfirm: "short",
    });

    const result = await runResetPassword(form, deps);

    expect(result).toMatchObject({ ok: false });
    if ("state" in result) {
      expect(result.state.fieldErrors?.password).toBeTruthy();
    }
    expect(db.updatedAt(users)).toHaveLength(0);
  });

  it("rejects mismatched password + confirm", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    const form = makeFormData({
      token: VALID_TOKEN,
      password: VALID_PASSWORD,
      passwordConfirm: VALID_PASSWORD + "x",
    });

    const result = await runResetPassword(form, deps);

    expect(result).toMatchObject({ ok: false });
    if ("state" in result) {
      expect(result.state.fieldErrors?.passwordConfirm).toBeTruthy();
    }
  });
});

describe("runResetPassword — token branches", () => {
  it("redirects to error?reason=not_found when token has no row", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    db.queueSelect([]); // token lookup: empty

    const result = await runResetPassword(FORM_VALID, deps);

    expect(result).toMatchObject({
      ok: false,
      redirectTo: "/signin/reset/error?reason=not_found",
    });
    expect(db.updatedAt(users)).toHaveLength(0);
  });

  it("redirects to error?reason=expired when token row is past its expires", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    db.queueSelect([{ identifier: "user@example.com", expires: PAST }]);

    const result = await runResetPassword(FORM_VALID, deps);

    expect(result).toMatchObject({
      ok: false,
      redirectTo: "/signin/reset/error?reason=expired",
    });
    expect(db.updatedAt(users)).toHaveLength(0);
  });

  it("redirects to error?reason=user_gone when token row exists but user has been deleted", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    db.queueSelect([{ identifier: "user@example.com", expires: FUTURE }]);
    db.queueSelect([]); // user lookup: empty

    const result = await runResetPassword(FORM_VALID, deps);

    expect(result).toMatchObject({
      ok: false,
      redirectTo: "/signin/reset/error?reason=user_gone",
    });
    expect(db.updatedAt(users)).toHaveLength(0);
  });

  it("treats a soft-deleted user as user_gone", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    db.queueSelect([{ identifier: "user@example.com", expires: FUTURE }]);
    db.queueSelect([
      { id: "user-9", role: "student", deletedAt: new Date("2026-04-01T00:00:00Z") },
    ]);

    const result = await runResetPassword(FORM_VALID, deps);

    expect(result).toMatchObject({
      ok: false,
      redirectTo: "/signin/reset/error?reason=user_gone",
    });
  });
});

describe("runResetPassword — coerces unknown role to student", () => {
  it("falls back to role: student when users.role is an unexpected value", async () => {
    const { db, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    db.queueSelect([{ identifier: "user@example.com", expires: FUTURE }]);
    db.queueSelect([{ id: "user-1", role: "weird-role", deletedAt: null }]);

    await runResetPassword(FORM_VALID, deps);

    expect(recorder.events[0]).toMatchObject({
      event: "password_reset_completed",
      role: "student",
    });
  });
});
