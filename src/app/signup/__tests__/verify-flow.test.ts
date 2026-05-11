import { describe, expect, it } from "vitest";
import {
  auditEvents,
  sessions,
  users,
  verificationTokens,
} from "../../../lib/db/schema";
import { runVerify } from "../verify-flow";
import type { DbForVerify } from "../verify-flow";
import { FakeDb, TrackRecorder, silentLogger } from "./fake-db";

function makeDeps(now: Date = new Date("2026-05-18T10:00:00.000Z")) {
  const db = new FakeDb();
  const recorder = new TrackRecorder();
  return {
    db,
    recorder,
    deps: {
      db: db as unknown as DbForVerify,
      generateSessionToken: () => "fixed-session-token",
      now: () => now,
      track: recorder.capture,
      logger: silentLogger,
    },
  };
}

describe("runVerify — happy path", () => {
  it("atomically consumes the token, marks email verified, writes audit, inserts session, returns session info", async () => {
    const { db, recorder, deps } = makeDeps();
    const expires = new Date("2026-05-18T10:14:00.000Z"); // 14 min from now

    // DELETE verification_tokens ... RETURNING — single-statement consume.
    db.queueReturning([{ identifier: "user@example.com", expires }]);
    // UPDATE users ... RETURNING.
    db.queueReturning([{ id: "user-1", role: "student" }]);

    const result = await runVerify("good-token", deps);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.userId).toBe("user-1");
    expect(result.role).toBe("student");
    expect(result.sessionToken).toBe("fixed-session-token");

    // Single atomic DELETE — no separate SELECT to race against.
    expect(db.deletes).toHaveLength(1);
    expect(db.deletes[0]?.table).toBe(verificationTokens);

    // Users row updated.
    expect(db.updatedAt(users)).toHaveLength(1);
    const updated = db.updatedAt(users)[0]?.set as Record<string, unknown>;
    expect(updated.updatedByKind).toBe("system");
    expect(updated.updatedByActor).toBe("email-verification");

    // auth.email_verified audit row.
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const audit = db.insertedInto(auditEvents)[0]?.value as Record<string, unknown>;
    expect(audit.eventType).toBe("auth.email_verified");
    expect(audit.actorId).toBe("user-1");

    // Session row.
    expect(db.insertedInto(sessions)).toHaveLength(1);
    const sessionInsert = db.insertedInto(sessions)[0]?.value as Record<string, unknown>;
    expect(sessionInsert.sessionToken).toBe("fixed-session-token");
    expect(sessionInsert.userId).toBe("user-1");

    // PostHog email_verified fires.
    expect(recorder.events).toEqual([
      { event: "email_verified", userId: "user-1", role: "student" },
    ]);
  });
});

describe("runVerify — missing token", () => {
  it("returns missing when token is null", async () => {
    const { db, recorder, deps } = makeDeps();
    const result = await runVerify(null, deps);
    expect(result).toEqual({ kind: "error", reason: "missing" });
    expect(db.inserts).toHaveLength(0);
    expect(db.deletes).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });

  it("returns missing when token is whitespace only", async () => {
    const { db, deps } = makeDeps();
    const result = await runVerify("   ", deps);
    expect(result).toEqual({ kind: "error", reason: "missing" });
    expect(db.inserts).toHaveLength(0);
  });

  it("returns missing when token has illegal characters (non-base64url)", async () => {
    const { db, deps } = makeDeps();
    const result = await runVerify("contains spaces and @!#", deps);
    expect(result).toEqual({ kind: "error", reason: "missing" });
    expect(db.deletes).toHaveLength(0);
  });
});

describe("runVerify — not_found", () => {
  it("returns not_found when DELETE … RETURNING produces no row", async () => {
    const { db, recorder, deps } = makeDeps();
    db.queueReturning([]); // no matching row consumed

    const result = await runVerify("ghost-token", deps);

    expect(result).toEqual({ kind: "error", reason: "not_found" });
    // The DELETE statement still ran (returning empty is the no-match signal).
    expect(db.deletes).toHaveLength(1);
    expect(db.insertedInto(sessions)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });
});

describe("runVerify — expired", () => {
  it("returns expired and writes no user-verification side effects", async () => {
    const { db, recorder, deps } = makeDeps(new Date("2026-05-18T10:30:00.000Z"));
    // Row exists (was atomically consumed by DELETE) but expired 30 minutes ago.
    const expires = new Date("2026-05-18T10:00:00.000Z");
    db.queueReturning([{ identifier: "user@example.com", expires }]);

    const result = await runVerify("expired-token", deps);

    expect(result).toEqual({ kind: "error", reason: "expired" });
    // The atomic DELETE consumed the expired row (cleanup-on-attempt).
    expect(db.deletes).toHaveLength(1);
    // No further side effects.
    expect(db.updatedAt(users)).toHaveLength(0);
    expect(db.insertedInto(sessions)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });
});

describe("runVerify — token trim", () => {
  it("trims surrounding whitespace before lookup", async () => {
    const { db, deps } = makeDeps();
    const expires = new Date("2026-05-18T10:14:00.000Z");
    db.queueReturning([{ identifier: "user@example.com", expires }]);
    db.queueReturning([{ id: "user-1", role: "tutor" }]);

    const result = await runVerify("  good-token  ", deps);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.role).toBe("tutor");
  });
});

describe("runVerify — user row missing for matched token identifier", () => {
  it("returns internal when the users UPDATE returns no rows", async () => {
    const { db, recorder, deps } = makeDeps();
    const expires = new Date("2026-05-18T10:14:00.000Z");
    db.queueReturning([{ identifier: "orphan@example.com", expires }]);
    db.queueReturning([]); // UPDATE returns nothing

    const result = await runVerify("orphan-token", deps);

    expect(result).toEqual({ kind: "error", reason: "internal" });
    // Token was already atomically consumed — single-use preserved.
    expect(db.deletes).toHaveLength(1);
    // No session, no audit, no track.
    expect(db.insertedInto(sessions)).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });
});

describe("runVerify — session creation fails post-verify", () => {
  it("returns verified_no_session so the route can redirect to /signin?verified=1", async () => {
    const { db, recorder, deps } = makeDeps();
    const expires = new Date("2026-05-18T10:14:00.000Z");
    db.queueReturning([{ identifier: "user@example.com", expires }]);
    db.queueReturning([{ id: "user-1", role: "student" }]);
    // The audit insert succeeds; the session insert fails.
    // Trigger failure on the next insert (the third insert after the audit row).
    // FakeDb's failNext fires on the next insert call, so set it after the audit.
    // Simplest: track inserts and make the session-table insert throw.
    // Use a custom one-shot fail flag by triggering after the audit is written.
    // Capture original insert; on the session-table insert, throw.
    // Easier: hook directly into the FakeDb's failNext at the right moment.
    // For this test we just expect the orchestrator to flip to verified_no_session
    // when the session insert throws.
    const originalInsert = db.insert.bind(db);
    let auditWritten = false;
    db.insert = ((table: unknown) => {
      // After the audit insert, fail on the next (session) insert.
      if (table === sessions) {
        return {
          values: (value: unknown) => {
            void value;
            return Promise.reject(new Error("connection pool exhausted")) as Promise<unknown>;
          },
        };
      }
      if (table === auditEvents) {
        auditWritten = true;
      }
      return originalInsert(table);
    }) as typeof db.insert;

    const result = await runVerify("good-token", deps);

    expect(auditWritten).toBe(true);
    expect(result.kind).toBe("verified_no_session");
    if (result.kind !== "verified_no_session") return;
    expect(result.userId).toBe("user-1");
    expect(result.role).toBe("student");
    // email_verified still fires (the user IS verified).
    expect(recorder.events).toEqual([
      { event: "email_verified", userId: "user-1", role: "student" },
    ]);
  });
});
