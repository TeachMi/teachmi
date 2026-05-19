// cancel-flow.test.ts — Area 1 / Story 4.4 (2026-05-19). FakeDb-backed
// unit tests for `runCancelBooking`. Covers happy path (student + tutor),
// idempotent re-cancel, past-start guard, already-completed guard, mock-
// payment refund flip, audit-row-last write order, info-leak avoidance
// for forbidden/missing bookings, and the auth predicate.

import { describe, expect, it } from "vitest";
import {
  FakeTutorDb,
  silentLogger,
} from "../../../app/tutor/onboarding/profile/__tests__/fake-tutor-db";
import { auditEvents, bookings, payments } from "../../db/schema";
import {
  CANCEL_REASON_MAX_CHARS,
  runCancelBooking,
} from "../cancel-flow";

const TUTOR_ID = "11111111-2222-3333-4444-555555555555";
const STUDENT_ID = "22222222-3333-4444-5555-666666666666";
const OTHER_USER_ID = "99999999-0000-0000-0000-000000000000";
const BOOKING_ID = "bb11bb22-bb33-bb44-bb55-bb66bb77bb88";
const PAYMENT_ID = "cc11cc22-cc33-cc44-cc55-cc66cc77cc88";
const NOW = new Date("2026-05-19T10:00:00.000Z");
const FUTURE_SLOT = new Date("2026-05-20T11:00:00.000Z");

function makeDeps(currentUserId: string) {
  const db = new FakeTutorDb();
  return {
    db,
    deps: {
      db,
      currentUserId,
      now: () => NOW,
      logger: silentLogger,
    },
  };
}

function makeBookingRow(
  overrides: Partial<{
    status: string;
    startsAt: Date;
    studentUserId: string;
    tutorUserId: string;
    cancelledByUserId: string | null;
  }> = {},
) {
  return {
    id: BOOKING_ID,
    status: overrides.status ?? "confirmed",
    studentUserId: overrides.studentUserId ?? STUDENT_ID,
    tutorUserId: overrides.tutorUserId ?? TUTOR_ID,
    startsAt: overrides.startsAt ?? FUTURE_SLOT,
    // Review patch 2: surfaced from the booking SELECT so the
    // already-cancelled idempotent path can derive the ORIGINAL
    // canceller's role rather than the current caller's.
    cancelledByUserId: overrides.cancelledByUserId ?? null,
  };
}

function queueBooking(db: FakeTutorDb, overrides = {}) {
  db.queueSelect([makeBookingRow(overrides)]);
}

/**
 * Most success-path tests need to queue the booking SELECT + the
 * `.returning()` from the bookings UPDATE so the race-detect logic
 * (review patch 1) sees a non-empty result and proceeds. This helper
 * batches both.
 */
function queueBookingAndUpdate(db: FakeTutorDb, overrides = {}) {
  queueBooking(db, overrides);
  db.queueReturning([{ id: BOOKING_ID }]);
}

function queuePayments(db: FakeTutorDb, rows: Array<Partial<{ status: string; mockPayment: boolean }>>) {
  db.queueSelect(
    rows.map((r, i) => ({
      id: `${PAYMENT_ID.slice(0, -1)}${i}`,
      status: r.status ?? "settled",
      mockPayment: r.mockPayment ?? true,
    })),
  );
}

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

describe("runCancelBooking — input validation", () => {
  it("rejects a non-UUID bookingId", async () => {
    const { deps } = makeDeps(STUDENT_ID);
    const result = await runCancelBooking({ bookingId: "not-a-uuid" }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_input");
  });
});

// ---------------------------------------------------------------------------
// Auth / not-found
// ---------------------------------------------------------------------------

describe("runCancelBooking — auth + not-found", () => {
  it("returns not_found when the booking SELECT comes back empty", async () => {
    const { db, deps } = makeDeps(OTHER_USER_ID);
    db.queueSelect([]); // booking lookup
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_found");
  });

  it("does not distinguish forbidden from missing (info-leak avoidance)", async () => {
    // The auth claim is enforced in the WHERE clause; if the caller isn't
    // either party, the DB returns zero rows. The orchestrator sees the
    // same empty result as for a genuinely missing id.
    const { db, deps } = makeDeps(OTHER_USER_ID);
    db.queueSelect([]); // booking lookup returns nothing (filtered out)
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// State gate
// ---------------------------------------------------------------------------

describe("runCancelBooking — state gate", () => {
  it("already-cancelled returns idempotent ok with alreadyCancelled=true (no writes)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db, { status: "cancelled" });
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyCancelled).toBe(true);
    expect(result.cancelledByRole).toBe("student");
    // No UPDATE / INSERT issued.
    expect(db.operations.filter((op) => op.kind !== "insert" || op.table !== auditEvents))
      .toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
    expect(db.updatedAt(bookings)).toHaveLength(0);
  });

  it("completed returns already_completed", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db, { status: "completed" });
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("already_completed");
  });

  it("no_show returns already_completed", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db, { status: "no_show" });
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("already_completed");
  });
});

// ---------------------------------------------------------------------------
// Time gate
// ---------------------------------------------------------------------------

describe("runCancelBooking — time gate", () => {
  it("rejects past-start cancel with reason=past_start", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db, { startsAt: new Date("2026-05-19T09:00:00.000Z") }); // 1h ago
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("past_start");
  });

  it("rejects cancel at exact start moment (now >= startsAt is past)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db, { startsAt: NOW });
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("past_start");
  });
});

// ---------------------------------------------------------------------------
// Happy path — student-initiated
// ---------------------------------------------------------------------------

describe("runCancelBooking — happy path (student)", () => {
  it("flips booking to cancelled + flips mock payment to refunded + writes audit", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, [{ status: "settled", mockPayment: true }]);

    const result = await runCancelBooking(
      { bookingId: BOOKING_ID, reason: "אירוע משפחתי" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cancelledByRole).toBe("student");
    expect(result.alreadyCancelled).toBe(false);

    // bookings UPDATE
    const bookingUpdates = db.updatedAt(bookings);
    expect(bookingUpdates).toHaveLength(1);
    expect(bookingUpdates[0]!.set).toMatchObject({
      status: "cancelled",
      cancellationReason: "אירוע משפחתי",
      cancelledByUserId: STUDENT_ID,
      updatedByActor: STUDENT_ID,
    });

    // payments UPDATE (mock → refunded)
    const paymentUpdates = db.updatedAt(payments);
    expect(paymentUpdates).toHaveLength(1);
    expect(paymentUpdates[0]!.set).toMatchObject({
      status: "refunded",
      updatedByActor: STUDENT_ID,
    });

    // audit row LAST
    const auditInserts = db.insertedInto(auditEvents);
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]!.value).toMatchObject({
      eventType: "booking.cancelled",
      actorKind: "user",
      actorId: STUDENT_ID,
      targetId: BOOKING_ID,
    });
    const payload = (auditInserts[0]!.value as { payload: Record<string, unknown> }).payload;
    expect(payload).toMatchObject({
      cancelled_by_role: "student",
      counterparty_user_id: TUTOR_ID,
      status_before: "confirmed",
      reason: "אירוע משפחתי",
      payment_rows_refunded: 1,
    });
  });

  it("writes booking UPDATE → payment UPDATE → audit INSERT in order", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, [{ status: "settled", mockPayment: true }]);

    await runCancelBooking({ bookingId: BOOKING_ID }, deps);

    const opTables = db.operations.map((op) => ({
      kind: op.kind,
      table: op.table,
    }));
    expect(opTables).toEqual([
      { kind: "update", table: bookings },
      { kind: "update", table: payments },
      { kind: "insert", table: auditEvents },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Happy path — tutor-initiated
// ---------------------------------------------------------------------------

describe("runCancelBooking — happy path (tutor)", () => {
  it("derives cancelledByRole='tutor' when caller is the tutor", async () => {
    const { db, deps } = makeDeps(TUTOR_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, [{ status: "settled", mockPayment: true }]);

    const result = await runCancelBooking(
      { bookingId: BOOKING_ID, reason: "חולה" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cancelledByRole).toBe("tutor");

    const auditInserts = db.insertedInto(auditEvents);
    const payload = (auditInserts[0]!.value as { payload: Record<string, unknown> }).payload;
    expect(payload).toMatchObject({
      cancelled_by_role: "tutor",
      counterparty_user_id: STUDENT_ID,
    });

    const bookingUpdates = db.updatedAt(bookings);
    expect(bookingUpdates[0]!.set).toMatchObject({
      cancelledByUserId: TUTOR_ID,
    });
  });
});

// ---------------------------------------------------------------------------
// Payment branches
// ---------------------------------------------------------------------------

describe("runCancelBooking — payment branches", () => {
  it("does NOT update non-settled payment rows (pending stays pending)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, [{ status: "pending", mockPayment: true }]);

    await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(db.updatedAt(payments)).toHaveLength(0);
  });

  it("does NOT issue refund for real-payment rows today (TODO branch logs only)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, [{ status: "settled", mockPayment: false }]);

    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
    // Real-payment refund is wired in Phase 2; today's orchestrator MUST NOT
    // silently mark a real payment as refunded without external confirmation.
    expect(db.updatedAt(payments)).toHaveLength(0);
  });

  it("succeeds with zero payment rows (defensive — should never happen post-Story-4.3)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, []);

    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
    expect(db.updatedAt(payments)).toHaveLength(0);
    const auditInserts = db.insertedInto(auditEvents);
    const payload = (auditInserts[0]!.value as { payload: Record<string, unknown> }).payload;
    expect(payload.payment_rows_refunded).toBe(0);
  });

  it("audit's payment_rows_refunded counts ACTUAL UPDATE successes, not pre-update reads (review patch 7)", async () => {
    // Two settled mock-payment rows. First UPDATE fails; second succeeds.
    // The audit must reflect 1 actual refund, not 2 — even though the
    // pre-update read showed 2 candidates.
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, [
      { status: "settled", mockPayment: true },
      { status: "settled", mockPayment: true },
    ]);
    // Override the FakeDb to throw on the FIRST payment UPDATE, succeed on
    // the second. Simplest approach with FakeTutorDb: monkey-patch update
    // for one call so it rejects, then restore.
    const originalUpdate = db.update.bind(db);
    let updateCallCount = 0;
    db.update = (table: unknown) => {
      updateCallCount++;
      if (updateCallCount === 2) {
        // The second .update() call is the first payment UPDATE (1st = booking).
        return {
          set: () => ({
            where: () => {
              const rejected = Promise.reject(new Error("simulated payment UPDATE failure"));
              return Object.assign(rejected, {
                returning: () => Promise.reject(new Error("simulated payment UPDATE failure")) as Promise<unknown[]>,
              });
            },
          }),
        };
      }
      return originalUpdate(table);
    };

    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);

    const auditInserts = db.insertedInto(auditEvents);
    const payload = (auditInserts[0]!.value as { payload: Record<string, unknown> }).payload;
    // Only ONE payment actually refunded; the other failed silently.
    expect(payload.payment_rows_refunded).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reason normalization
// ---------------------------------------------------------------------------

describe("runCancelBooking — reason normalization", () => {
  it("trims whitespace + treats blank as null", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, []);

    await runCancelBooking({ bookingId: BOOKING_ID, reason: "   " }, deps);
    expect(db.updatedAt(bookings)[0]!.set).toMatchObject({
      cancellationReason: null,
    });
  });

  it(`truncates reason to ${CANCEL_REASON_MAX_CHARS} chars`, async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, []);

    const longReason = "א".repeat(CANCEL_REASON_MAX_CHARS + 50);
    await runCancelBooking(
      { bookingId: BOOKING_ID, reason: longReason },
      deps,
    );
    const setValue = db.updatedAt(bookings)[0]!.set as { cancellationReason: string };
    expect(setValue.cancellationReason).toHaveLength(CANCEL_REASON_MAX_CHARS);
  });

  it("undefined reason → null in DB (student-side: no reason required)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, []);

    await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(db.updatedAt(bookings)[0]!.set).toMatchObject({
      cancellationReason: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Server-side tutor-reason enforcement (review patch 4)
// ---------------------------------------------------------------------------

describe("runCancelBooking — tutor must supply a reason (server-side)", () => {
  it("tutor cancel with NO reason → invalid_input, no writes", async () => {
    const { db, deps } = makeDeps(TUTOR_ID);
    queueBooking(db);
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_input");
    // No bookings UPDATE attempted — the gate fires before the write
    // path. The orchestrator's only DB call so far is the booking SELECT.
    expect(db.updatedAt(bookings)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
  });

  it("tutor cancel with blank-whitespace reason → invalid_input (matches normalizeReason)", async () => {
    const { db, deps } = makeDeps(TUTOR_ID);
    queueBooking(db);
    const result = await runCancelBooking(
      { bookingId: BOOKING_ID, reason: "   \n  " },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_input");
    expect(db.updatedAt(bookings)).toHaveLength(0);
  });

  it("student cancel with NO reason → ok (student reason is optional)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBookingAndUpdate(db);
    queuePayments(db, []);
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Race-loser handling (review patch 1)
// ---------------------------------------------------------------------------

describe("runCancelBooking — race-loser handling", () => {
  it("UPDATE returns no rows → idempotent alreadyCancelled ok (counterparty beat us in the gap)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db);
    // UPDATE returns []  — the status guard in the WHERE clause matched
    // zero rows because another actor cancelled between our SELECT and
    // UPDATE. The orchestrator must NOT treat this as a hard failure;
    // the user's intent is satisfied either way.
    db.queueReturning([]);

    const result = await runCancelBooking(
      { bookingId: BOOKING_ID, reason: "אירוע משפחתי" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyCancelled).toBe(true);
    expect(result.cancelledByRole).toBe("student");
    // No subsequent operations — no payment refund, no audit row.
    expect(db.updatedAt(payments)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Already-cancelled role attribution (review patch 2)
// ---------------------------------------------------------------------------

describe("runCancelBooking — already-cancelled role attribution", () => {
  it("student re-clicks on a tutor-cancelled booking → returns cancelledByRole='tutor' (from row)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db, {
      status: "cancelled",
      // Original cancel came from the tutor side.
      cancelledByUserId: TUTOR_ID,
    });
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyCancelled).toBe(true);
    expect(result.cancelledByRole).toBe("tutor");
  });

  it("tutor re-clicks on a student-cancelled booking → returns cancelledByRole='student'", async () => {
    const { db, deps } = makeDeps(TUTOR_ID);
    queueBooking(db, {
      status: "cancelled",
      cancelledByUserId: STUDENT_ID,
    });
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cancelledByRole).toBe("student");
  });

  it("falls back to caller when cancelledByUserId is null (corrupt/legacy row)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db, { status: "cancelled", cancelledByUserId: null });
    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cancelledByRole).toBe("student");
  });
});
