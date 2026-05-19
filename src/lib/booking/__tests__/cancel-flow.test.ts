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
  }> = {},
) {
  return {
    id: BOOKING_ID,
    status: overrides.status ?? "confirmed",
    studentUserId: overrides.studentUserId ?? STUDENT_ID,
    tutorUserId: overrides.tutorUserId ?? TUTOR_ID,
    startsAt: overrides.startsAt ?? FUTURE_SLOT,
  };
}

function queueBooking(db: FakeTutorDb, overrides = {}) {
  db.queueSelect([makeBookingRow(overrides)]);
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
    queueBooking(db);
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
    queueBooking(db);
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
    queueBooking(db);
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
    queueBooking(db);
    queuePayments(db, [{ status: "pending", mockPayment: true }]);

    await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(db.updatedAt(payments)).toHaveLength(0);
  });

  it("does NOT issue refund for real-payment rows today (TODO branch logs only)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db);
    queuePayments(db, [{ status: "settled", mockPayment: false }]);

    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
    // Real-payment refund is wired in Phase 2; today's orchestrator MUST NOT
    // silently mark a real payment as refunded without external confirmation.
    expect(db.updatedAt(payments)).toHaveLength(0);
  });

  it("succeeds with zero payment rows (defensive — should never happen post-Story-4.3)", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db);
    queuePayments(db, []);

    const result = await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(result.ok).toBe(true);
    expect(db.updatedAt(payments)).toHaveLength(0);
    const auditInserts = db.insertedInto(auditEvents);
    const payload = (auditInserts[0]!.value as { payload: Record<string, unknown> }).payload;
    expect(payload.payment_rows_refunded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reason normalization
// ---------------------------------------------------------------------------

describe("runCancelBooking — reason normalization", () => {
  it("trims whitespace + treats blank as null", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db);
    queuePayments(db, []);

    await runCancelBooking({ bookingId: BOOKING_ID, reason: "   " }, deps);
    expect(db.updatedAt(bookings)[0]!.set).toMatchObject({
      cancellationReason: null,
    });
  });

  it(`truncates reason to ${CANCEL_REASON_MAX_CHARS} chars`, async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db);
    queuePayments(db, []);

    const longReason = "א".repeat(CANCEL_REASON_MAX_CHARS + 50);
    await runCancelBooking(
      { bookingId: BOOKING_ID, reason: longReason },
      deps,
    );
    const setValue = db.updatedAt(bookings)[0]!.set as { cancellationReason: string };
    expect(setValue.cancellationReason).toHaveLength(CANCEL_REASON_MAX_CHARS);
  });

  it("undefined reason → null in DB", async () => {
    const { db, deps } = makeDeps(STUDENT_ID);
    queueBooking(db);
    queuePayments(db, []);

    await runCancelBooking({ bookingId: BOOKING_ID }, deps);
    expect(db.updatedAt(bookings)[0]!.set).toMatchObject({
      cancellationReason: null,
    });
  });
});
