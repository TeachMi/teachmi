import { describe, expect, it } from "vitest";
import {
  auditEvents,
  consentReceipts,
} from "../../../../../lib/db/schema";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../../../../../lib/legal/privacy-consent";
import {
  FakeDb,
  TrackRecorder,
  silentLogger,
} from "../../../../signup/__tests__/fake-db";
import { runAcceptPrivacyPolicy, type DbForAcceptFlow } from "../accept-flow";

function makeDeps() {
  const db = new FakeDb();
  const recorder = new TrackRecorder();
  return {
    db,
    recorder,
    deps: {
      db: db as unknown as DbForAcceptFlow,
      track: recorder.capture,
      logger: silentLogger,
    },
  };
}

function baseInput() {
  return {
    userId: "user-abc",
    role: "student" as const,
    ip: "10.0.0.42",
    userAgent: "Mozilla/5.0 (Test)",
    next: "/dashboard",
  };
}

describe("runAcceptPrivacyPolicy — happy path", () => {
  it("writes consent_receipts + audit + analytics, then redirects to next", async () => {
    const { db, recorder, deps } = makeDeps();
    // SELECT for existing receipt returns [] (no prior consent).
    db.queueSelect<{ documentVersion: string }>([]);
    // Story 1.21 round-2: consent insert now uses ON CONFLICT DO NOTHING +
    // RETURNING. A non-empty returning array = "this request wrote the row"
    // and the audit + analytics writes proceed. An empty returning array =
    // "race-loser; another concurrent request already wrote the row".
    db.queueReturning<{ id: string }>([{ id: "receipt-1" }]);

    const result = await runAcceptPrivacyPolicy(baseInput(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");

    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
    const receipt = db.insertedInto(consentReceipts)[0]?.value as Record<
      string,
      unknown
    >;
    expect(receipt.userId).toBe("user-abc");
    expect(receipt.documentType).toBe("privacy_policy");
    expect(receipt.documentVersion).toBe(CURRENT_PRIVACY_POLICY_VERSION);
    expect(receipt.ipAddress).toBe("10.0.0.42");
    expect(receipt.userAgent).toBe("Mozilla/5.0 (Test)");
    expect(receipt.signature).toBeNull();
    expect(receipt.acceptedAt).toBeInstanceOf(Date);

    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const audit = db.insertedInto(auditEvents)[0]?.value as Record<
      string,
      unknown
    >;
    expect(audit.eventType).toBe("auth.privacy_policy_accepted");
    expect(audit.actorId).toBe("user-abc");
    expect(audit.actorMeta).toBe("10.0.0.42");
    const payload = audit.payload as Record<string, unknown>;
    expect(payload.documentVersion).toBe(CURRENT_PRIVACY_POLICY_VERSION);
    expect(payload.source).toBe("re_acceptance");

    expect(recorder.events).toEqual([
      {
        event: "privacy_policy_accepted",
        userId: "user-abc",
        role: "student",
        documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
        source: "re_acceptance",
      },
    ]);
  });
});

describe("runAcceptPrivacyPolicy — idempotency", () => {
  it("skips writes and redirects to next when the user already has a receipt at the current version", async () => {
    const { db, recorder, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([
      { documentVersion: CURRENT_PRIVACY_POLICY_VERSION },
    ]);

    const result = await runAcceptPrivacyPolicy(baseInput(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
    expect(db.insertedInto(consentReceipts)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });

  it("re-runs writes when the most recent receipt is from an older version", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([
      { documentVersion: "older-version" },
    ]);
    db.queueReturning<{ id: string }>([{ id: "receipt-2" }]);

    const result = await runAcceptPrivacyPolicy(baseInput(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
  });
});

// Story 1.21 round-2: the unique constraint on (userId, documentType,
// documentVersion) makes concurrent submits race-tolerant via ON CONFLICT
// DO NOTHING + RETURNING. The race-loser sees an empty returning() result
// and should skip the audit + analytics writes (avoiding double-counting)
// while still redirecting the user onward (the receipt exists at the
// target version — invariant holds).
describe("runAcceptPrivacyPolicy — race-loser on unique constraint", () => {
  it("redirects without audit/analytics writes when a concurrent request already wrote the receipt", async () => {
    const { db, recorder, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);
    // Empty returning = ON CONFLICT DO NOTHING swallowed our insert.
    db.queueReturning<{ id: string }>([]);

    const result = await runAcceptPrivacyPolicy(baseInput(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");

    // The insert WAS attempted (FakeDb captures the call regardless of
    // ON CONFLICT behavior) but the audit + analytics writes were gated on
    // the returning array being non-empty, so they're skipped.
    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });
});

describe("runAcceptPrivacyPolicy — next sanitization (open-redirect defense)", () => {
  it("preserves a normal app-relative path", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), next: "/tutor/onboarding/profile" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/tutor/onboarding/profile");
  });

  it("preserves query strings on safe paths", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), next: "/dashboard?tab=upcoming" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard?tab=upcoming");
  });

  it("falls back to /dashboard on protocol-relative URLs", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), next: "//evil.com/path" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
  });

  it("falls back to /dashboard on absolute URLs", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), next: "https://evil.com/path" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
  });

  it("falls back to /dashboard on javascript: URLs", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), next: "javascript:alert(1)" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
  });

  it("falls back to /dashboard on empty next", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), next: "" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
  });

  // Story 1.21 review [M5]: reject `next` values that loop back into the
  // accept flow itself. A stale link / clickjack should not trigger an
  // infinite redirect chain.
  it("falls back to /dashboard when next is /legal/privacy/accept (self-loop)", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), next: "/legal/privacy/accept" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
  });

  it("falls back to /dashboard when next is /legal/privacy/accept with a query string", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), next: "/legal/privacy/accept?foo=bar" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/dashboard");
  });
});

// Story 1.21 review [L1]: "unknown" IP sentinel from `readIp` should land as
// null in the immutable consent_receipts row, not as a misleading literal.
describe("runAcceptPrivacyPolicy — IP / metadata sanitization", () => {
  it("converts ip='unknown' to null in both the receipt and the audit row", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);
    db.queueReturning<{ id: string }>([{ id: "receipt-ip-1" }]);

    const result = await runAcceptPrivacyPolicy(
      { ...baseInput(), ip: "unknown" },
      deps,
    );

    expect(result.ok).toBe(true);
    const receipt = db.insertedInto(consentReceipts)[0]?.value as Record<
      string,
      unknown
    >;
    expect(receipt.ipAddress).toBeNull();
    const audit = db.insertedInto(auditEvents)[0]?.value as Record<
      string,
      unknown
    >;
    expect(audit.actorMeta).toBeNull();
  });

  it("preserves a real IP unchanged", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);
    db.queueReturning<{ id: string }>([{ id: "receipt-ip-2" }]);

    await runAcceptPrivacyPolicy({ ...baseInput(), ip: "203.0.113.99" }, deps);

    const receipt = db.insertedInto(consentReceipts)[0]?.value as Record<
      string,
      unknown
    >;
    expect(receipt.ipAddress).toBe("203.0.113.99");
  });
});

describe("runAcceptPrivacyPolicy — write failure", () => {
  it("returns formError when the consent_receipts insert throws and skips analytics", async () => {
    const { db, recorder, deps } = makeDeps();
    db.queueSelect<{ documentVersion: string }>([]);
    db.failingTables.add(consentReceipts);

    const result = await runAcceptPrivacyPolicy(baseInput(), deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toBe("אירעה שגיאה. נסו שוב.");
    expect(db.insertedInto(consentReceipts)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });
});
