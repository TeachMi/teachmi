// booking-flow.test.ts — Story 4.3 (2026-05-18). FakeDb-backed unit
// tests for `runCreateBooking`. Covers happy path, idempotent double-
// click, race-loser, sig tamper, past-slot, price-unavailable, and the
// audit-row-last write order.

import { describe, expect, it } from "vitest";
import {
  FakeTutorDb,
  silentLogger,
} from "../../../app/tutor/onboarding/profile/__tests__/fake-tutor-db";
import {
  auditEvents,
  bookings,
  lessonSessions,
  payments,
} from "../../db/schema";
import { signSlotPayload } from "../../auth/slot-signing";
import {
  computeCommissionSplit,
  getBookingByIdForUser,
  runCreateBooking,
} from "../booking-flow";

const TUTOR_ID = "11111111-2222-3333-4444-555555555555";
const STUDENT_ID = "22222222-3333-4444-5555-666666666666";
const SLOT_ISO = "2026-05-20T11:00:00.000Z";
const BOOKING_ID = "bb11bb22-bb33-bb44-bb55-bb66bb77bb88";
const SUBJECT_ID = "55555555-6666-7777-8888-999999999999";

function makeDeps(opts: { priceIls?: number | null; subjectId?: string | null } = {}) {
  const db = new FakeTutorDb();
  return {
    db,
    deps: {
      db,
      studentUserId: STUDENT_ID,
      now: () => new Date("2026-05-19T10:00:00.000Z"), // day before the slot
      logger: silentLogger,
      getTutorPriceForDuration: async () => ({
        priceIls: opts.priceIls === undefined ? 180 : opts.priceIls,
        subjectId: opts.subjectId === undefined ? SUBJECT_ID : opts.subjectId,
      }),
    },
  };
}

function makeValidInput(overrides: Partial<{ duration: 45 | 60 | 75 | 90 }> = {}) {
  const duration = overrides.duration ?? 60;
  const sig = signSlotPayload({
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration,
  });
  return { tutorUserId: TUTOR_ID, slotIso: SLOT_ISO, duration, sig };
}

describe("computeCommissionSplit", () => {
  it("rounds commission to whole shekel; payout fills the remainder", () => {
    const { platformCommissionIls, tutorPayoutIls } = computeCommissionSplit(180);
    expect(platformCommissionIls).toBe(27);
    expect(tutorPayoutIls).toBe(153);
    expect(platformCommissionIls + tutorPayoutIls).toBe(180);
  });

  it("never drifts: 100 → 15 + 85", () => {
    const r = computeCommissionSplit(100);
    expect(r.platformCommissionIls + r.tutorPayoutIls).toBe(100);
  });

  it("odd prices round half-up: 175 → 26 + 149", () => {
    const r = computeCommissionSplit(175);
    // 175 * 0.15 = 26.25 → rounds to 26
    expect(r.platformCommissionIls).toBe(26);
    expect(r.tutorPayoutIls).toBe(149);
  });
});

describe("runCreateBooking — happy path", () => {
  it("inserts bookings + lesson_sessions + payments + audit in order", async () => {
    const { db, deps } = makeDeps();
    // No existing booking, no existing session, no existing payment.
    db.queueSelect([]); // bookings SELECT
    db.queueReturning([{ id: BOOKING_ID }]); // bookings INSERT
    db.queueSelect([]); // lesson_sessions SELECT
    db.queueSelect([]); // payments SELECT

    const result = await runCreateBooking(makeValidInput(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bookingId).toBe(BOOKING_ID);

    // Operations in correct order: bookings → lesson_sessions → payments → audit.
    const insertTables = db.operations
      .filter((op) => op.kind === "insert")
      .map((op) => op.table);
    expect(insertTables).toEqual([
      bookings,
      lessonSessions,
      payments,
      auditEvents,
    ]);
  });

  it("mock_payment=true on the inserted payments row", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]);
    db.queueReturning([{ id: BOOKING_ID }]);
    db.queueSelect([]);
    db.queueSelect([]);

    await runCreateBooking(makeValidInput(), deps);

    const paymentInsert = db.operations.find(
      (op) => op.kind === "insert" && op.table === payments,
    );
    expect(paymentInsert).toBeDefined();
    const value = (paymentInsert as { kind: "insert"; value: Record<string, unknown> }).value;
    expect(value.mockPayment).toBe(true);
    expect(value.status).toBe("settled");
    expect(value.paymeTransactionId).toBeNull();
    expect(value.amountIls).toBe(180);
  });

  it("booking status='confirmed' (skips pending_payment)", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]);
    db.queueReturning([{ id: BOOKING_ID }]);
    db.queueSelect([]);
    db.queueSelect([]);

    await runCreateBooking(makeValidInput(), deps);

    const bookingInsert = db.operations.find(
      (op) => op.kind === "insert" && op.table === bookings,
    );
    const value = (bookingInsert as { kind: "insert"; value: Record<string, unknown> }).value;
    expect(value.status).toBe("confirmed");
  });

  it("commission split is captured in the booking row", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]);
    db.queueReturning([{ id: BOOKING_ID }]);
    db.queueSelect([]);
    db.queueSelect([]);

    await runCreateBooking(makeValidInput(), deps);

    const bookingInsert = db.operations.find(
      (op) => op.kind === "insert" && op.table === bookings,
    );
    const value = (bookingInsert as { kind: "insert"; value: Record<string, unknown> }).value;
    expect(value.priceIls).toBe(180);
    expect(value.platformCommissionIls).toBe(27);
    expect(value.tutorPayoutIls).toBe(153);
  });
});

describe("runCreateBooking — failure paths", () => {
  it("rejects an invalid UUID", async () => {
    const { deps } = makeDeps();
    const result = await runCreateBooking(
      { tutorUserId: "not-a-uuid", slotIso: SLOT_ISO, duration: 60, sig: "x" },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_input");
  });

  it("rejects a tampered sig", async () => {
    const { deps } = makeDeps();
    const result = await runCreateBooking(
      {
        tutorUserId: TUTOR_ID,
        slotIso: SLOT_ISO,
        duration: 60,
        sig: "AAAAAAAAAAAAAAAAAAAAAA",
      },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("sig_invalid");
  });

  it("rejects a slot in the past", async () => {
    const { deps } = makeDeps();
    // Move `now` to AFTER the slot.
    deps.now = () => new Date("2026-05-21T00:00:00.000Z");
    const result = await runCreateBooking(makeValidInput(), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("slot_in_past");
  });

  it("returns 'tutor_not_found' when price lookup returns null", async () => {
    const db = new FakeTutorDb();
    const result = await runCreateBooking(makeValidInput(), {
      db,
      studentUserId: STUDENT_ID,
      now: () => new Date("2026-05-19T10:00:00.000Z"),
      logger: silentLogger,
      getTutorPriceForDuration: async () => null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("tutor_not_found");
  });

  it("returns 'price_unavailable' when the tutor doesn't offer this duration", async () => {
    const { deps } = makeDeps({ priceIls: null });
    const result = await runCreateBooking(makeValidInput(), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("price_unavailable");
  });

  it("returns 'self_booking_blocked' when the tutor is the same user as the student (own profile)", async () => {
    const { deps } = makeDeps();
    const result = await runCreateBooking(
      {
        ...makeValidInput(),
        // Force-build a sig as if the tutor IS the student.
        tutorUserId: STUDENT_ID,
        sig: (await import("../../auth/slot-signing")).signSlotPayload({
          tutorUserId: STUDENT_ID,
          slotIso: SLOT_ISO,
          duration: 60,
        }),
      },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("self_booking_blocked");
  });

  it("returns 'slot_taken' when another student already booked the slot", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([
      {
        id: "other-booking",
        status: "confirmed",
        studentUserId: "00000000-0000-0000-0000-000000000099",
      },
    ]);
    const result = await runCreateBooking(makeValidInput(), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("slot_taken");
  });

  it("returns 'slot_taken' when the bookings INSERT race-loses against a concurrent writer (F5, 2026-05-19)", async () => {
    const { db, deps } = makeDeps();
    // SELECT before INSERT shows empty (so we attempt the INSERT path).
    db.queueSelect([]);
    // Inject a Postgres 23505 unique_violation on the active-slot index.
    const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint_name: "uq_bookings_active_slot",
    });
    db.failNext = pgError;

    const result = await runCreateBooking(makeValidInput(), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("slot_taken");
    expect(result.formError).toContain("השעה זה עתה נתפסה");
  });
});

describe("runCreateBooking — idempotency", () => {
  it("returns the existing bookingId on double-click (same student, same slot)", async () => {
    const { db, deps } = makeDeps();
    // Existing booking is the SAME student — idempotent path.
    db.queueSelect([
      {
        id: BOOKING_ID,
        status: "confirmed",
        studentUserId: STUDENT_ID,
      },
    ]);
    // Existing session for the booking → no INSERT.
    db.queueSelect([{ id: "ls-existing" }]);
    // Existing payment for the booking → no INSERT.
    db.queueSelect([{ id: "p-existing" }]);

    const result = await runCreateBooking(makeValidInput(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bookingId).toBe(BOOKING_ID);

    // No bookings/lesson_sessions/payments INSERTs — only the audit row.
    const insertTables = db.operations
      .filter((op) => op.kind === "insert")
      .map((op) => op.table);
    expect(insertTables).toEqual([auditEvents]);
  });
});

describe("getBookingByIdForUser", () => {
  it("returns the row when the user is the student", async () => {
    const db = new FakeTutorDb();
    db.queueSelect([
      {
        id: BOOKING_ID,
        studentUserId: STUDENT_ID,
        tutorUserId: TUTOR_ID,
        startsAt: new Date(SLOT_ISO),
        durationMinutes: 60,
        status: "confirmed",
        priceIls: 180,
      },
    ]);
    const result = await getBookingByIdForUser(BOOKING_ID, {
      db,
      userId: STUDENT_ID,
      logger: silentLogger,
    });
    expect(result).not.toBeNull();
    expect(result?.id).toBe(BOOKING_ID);
  });

  it("returns the row when the user is the tutor", async () => {
    const db = new FakeTutorDb();
    db.queueSelect([
      {
        id: BOOKING_ID,
        studentUserId: STUDENT_ID,
        tutorUserId: TUTOR_ID,
        startsAt: new Date(SLOT_ISO),
        durationMinutes: 60,
        status: "confirmed",
        priceIls: 180,
      },
    ]);
    const result = await getBookingByIdForUser(BOOKING_ID, {
      db,
      userId: TUTOR_ID,
      logger: silentLogger,
    });
    expect(result).not.toBeNull();
  });

  it("returns null when the user is neither student nor tutor (info-leak guard)", async () => {
    // Code review 2026-05-19 (F6): the auth claim is now part of the
    // WHERE clause — `(student_user_id = $me OR tutor_user_id = $me)` —
    // so an unauthorized caller's query returns ZERO rows from the DB,
    // not a row that the helper then filters out. The FakeDb returns
    // whatever's queued; an empty queue models the DB's "no rows match"
    // response to the unauthorized predicate.
    const db = new FakeTutorDb();
    db.queueSelect([]);
    const result = await getBookingByIdForUser(BOOKING_ID, {
      db,
      userId: "99999999-9999-9999-9999-999999999999",
      logger: silentLogger,
    });
    expect(result).toBeNull();
  });

  it("returns null when bookingId is not a UUID (no DB query)", async () => {
    const db = new FakeTutorDb();
    const result = await getBookingByIdForUser("not-a-uuid", {
      db,
      userId: STUDENT_ID,
      logger: silentLogger,
    });
    expect(result).toBeNull();
    expect(db.operations).toEqual([]);
  });
});
