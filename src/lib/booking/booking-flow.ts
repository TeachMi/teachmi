// Pure orchestrators for the booking-submission Server Action.
// Story 4.3 (2026-05-18). FakeDb-tested via booking-flow.test.ts.
// `booking-actions.ts` ("use server") is the thin Next.js wrapper that
// builds the real dependencies (getDb + requireAuth + getTutorProfileForOwner).
//
// NO PAYMENT MVP — the checkout flow inserts a `payments` row with
// `mock_payment=true` and `status='settled'` so the full audit + invoicing +
// payout pipeline can exercise itself end-to-end against mock rows. The
// future PayMe-Marketplace integration will set `mock_payment=false` and
// transition the status through `pending → authorized → settled` via real
// webhook events; the `payments_real` view filters mock rows out of all
// downstream reporting.
//
// SEQUENTIAL WRITES — Neon-HTTP has no transactions. The orchestrator does
// its writes one at a time, with the audit row LAST so a partial-failure
// leaves an inconsistent audit trail rather than dropping user-visible
// state. Same precedent as the schedule-flow + profile-flow orchestrators.
//
// IDEMPOTENCY — each INSERT is SELECT-then-INSERT against a unique key
// (bookings: partial UNIQUE on (tutor, startsAt) WHERE status active;
// lesson_sessions: UNIQUE on booking_id; payments: partial UNIQUE on
// booking_id WHERE status='pending' AND payme_transaction_id IS NULL).
// A double-clicking student lands on the SAME bookingId — the second click
// becomes a no-op.

import { and, eq, inArray, or } from "drizzle-orm";
import {
  auditEvents,
  bookings,
  lessonSessions,
  payments,
  type Booking,
} from "../db/schema";
import { toAuditEventValues } from "../db/audit";
import type { TutorDb } from "@/app/tutor/onboarding/profile/profile-flow";
import { verifySlotSignature } from "../auth/slot-signing";

// --- Constants ------------------------------------------------------------

/** Platform commission rate as a fraction. 15% per FR48 / Story 2.5 pricing. */
const PLATFORM_COMMISSION_RATE = 0.15;

/** Active booking statuses — block slot reservation. */
const ACTIVE_BOOKING_STATUSES = ["pending_payment", "confirmed"] as const;

// --- Result type ----------------------------------------------------------

export type BookingFlowResult =
  | { ok: true; bookingId: string }
  | {
      ok: false;
      reason:
        | "invalid_input"
        | "sig_invalid"
        | "slot_in_past"
        | "tutor_not_found"
        | "slot_taken"
        | "price_unavailable"
        | "self_booking_blocked"
        | "unknown";
      formError: string;
    };

// --- Input shape ----------------------------------------------------------

export interface CreateBookingInput {
  tutorUserId: string;
  slotIso: string;
  duration: 45 | 60 | 75 | 90;
  /** HMAC sig over (tutor, slot, duration) — same as the gate URL. */
  sig: string;
}

// --- Deps -----------------------------------------------------------------

interface ExistingBookingLookup {
  id: string;
  status: string;
  studentUserId: string;
}

interface PriceLookup {
  /** ILS for the requested duration; null if the tutor doesn't offer it. */
  priceIls: number | null;
  /** Subject_id to attach to the booking. May be null if tutor has no subjects. */
  subjectId: string | null;
}

export interface CreateBookingDeps {
  db: TutorDb;
  studentUserId: string;
  /** Returns the price (ILS) the tutor charges for `duration`. Null = not offered. */
  getTutorPriceForDuration: (
    tutorUserId: string,
    duration: 45 | 60 | 75 | 90,
  ) => Promise<PriceLookup | null>;
  now: () => Date;
  logger?: { error: (message: string, err?: unknown) => void };
}

// --- Pure helpers ---------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidIsoUtc(value: string): boolean {
  if (!ISO_UTC_REGEX.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/**
 * True when `err` is a Postgres 23505 unique-violation specifically on the
 * `constraintName` index. Used to map race-loser errors from
 * `runCreateBooking` to a typed `slot_taken` result (F5, 2026-05-19).
 *
 * The neon-http driver surfaces Postgres errors with `.code` and
 * `.constraint_name` properties — we look at both because some Drizzle
 * wrapping paths re-wrap the error and only preserve the message text.
 */
function isUniqueViolationOn(err: unknown, constraintName: string): boolean {
  if (err === null || typeof err !== "object") return false;
  const e = err as {
    code?: string;
    constraint_name?: string;
    constraint?: string;
    message?: string;
    cause?: unknown;
  };
  const code = e.code;
  const constraint = e.constraint_name ?? e.constraint;
  if (code === "23505") {
    if (!constraint) return e.message?.includes(constraintName) ?? false;
    return constraint === constraintName;
  }
  // Some driver wrappers nest the original error under `.cause`.
  if (e.cause) return isUniqueViolationOn(e.cause, constraintName);
  return e.message?.includes(constraintName) ?? false;
}

export function computeCommissionSplit(priceIls: number): {
  platformCommissionIls: number;
  tutorPayoutIls: number;
} {
  // Round commission to the nearest whole shekel; tutor payout = remainder
  // so the two always sum to priceIls exactly (no rounding drift in
  // downstream payout reconciliation).
  const platformCommissionIls = Math.round(priceIls * PLATFORM_COMMISSION_RATE);
  const tutorPayoutIls = priceIls - platformCommissionIls;
  return { platformCommissionIls, tutorPayoutIls };
}

// --- Orchestrator ---------------------------------------------------------

export async function runCreateBooking(
  input: CreateBookingInput,
  deps: CreateBookingDeps,
): Promise<BookingFlowResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };

  // 1. Shape validation.
  if (!isValidUuid(input.tutorUserId)) {
    return { ok: false, reason: "invalid_input", formError: "מורה לא תקין." };
  }
  if (!isValidIsoUtc(input.slotIso)) {
    return { ok: false, reason: "invalid_input", formError: "זמן שיעור לא תקין." };
  }
  if (![45, 60, 75, 90].includes(input.duration)) {
    return {
      ok: false,
      reason: "invalid_input",
      formError: "משך שיעור לא תקין.",
    };
  }

  // 1b. Self-booking guard (Story 4.3 / PM round 2026-05-18). A tutor
  //     viewing their own public profile must not be able to book
  //     themselves — caught both here (server) and in the BookingSidebar
  //     (UI). Server guard is load-bearing; UI guard is courtesy.
  if (input.tutorUserId === deps.studentUserId) {
    return {
      ok: false,
      reason: "self_booking_blocked",
      formError: "לא ניתן להזמין שיעור אצל עצמך.",
    };
  }

  // 2. HMAC sig — fail fast before DB access.
  const sigValid = verifySlotSignature(
    {
      tutorUserId: input.tutorUserId,
      slotIso: input.slotIso,
      duration: input.duration,
    },
    input.sig,
  );
  if (!sigValid) {
    return {
      ok: false,
      reason: "sig_invalid",
      formError: "הקישור לא תקין. חזרו לפרופיל המורה ובחרו שעה מחדש.",
    };
  }

  // 3. Past-slot guard.
  const slotStartMs = Date.parse(input.slotIso);
  if (slotStartMs <= deps.now().getTime()) {
    return {
      ok: false,
      reason: "slot_in_past",
      formError: "השעה שבחרתם כבר עברה. בחרו שעה חדשה.",
    };
  }

  // 4. Resolve tutor price for this duration. Bails if the tutor doesn't
  //    offer the requested length (defense-in-depth — the URL was signed
  //    when the duration was offered, but a tutor could remove the price
  //    in between calendar render and submit).
  let priceLookup: PriceLookup | null;
  try {
    priceLookup = await deps.getTutorPriceForDuration(
      input.tutorUserId,
      input.duration,
    );
  } catch (err) {
    log.error("[runCreateBooking] tutor-price lookup failed", err);
    return {
      ok: false,
      reason: "unknown",
      formError: "אירעה שגיאה. נסו שוב.",
    };
  }
  if (priceLookup === null) {
    return {
      ok: false,
      reason: "tutor_not_found",
      formError: "המורה לא נמצא או הפסיק/ה ללמד.",
    };
  }
  if (priceLookup.priceIls === null) {
    return {
      ok: false,
      reason: "price_unavailable",
      formError: "המורה כבר לא מציע/ה את משך השיעור הזה.",
    };
  }
  const priceIls = priceLookup.priceIls;

  const startsAt = new Date(slotStartMs);
  const { platformCommissionIls, tutorPayoutIls } =
    computeCommissionSplit(priceIls);

  // 5. SELECT-then-INSERT bookings. Partial UNIQUE on (tutor, startsAt)
  //    WHERE status IN (pending_payment, confirmed) prevents double-booking.
  //    For idempotency: if a row already exists for THIS student + slot,
  //    return its id instead of erroring.
  let bookingId: string;
  try {
    const existing = (await deps.db
      .select({
        id: bookings.id,
        status: bookings.status,
        studentUserId: bookings.studentUserId,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.tutorUserId, input.tutorUserId),
          eq(bookings.startsAt, startsAt),
          inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
        ),
      )) as ExistingBookingLookup[];

    if (existing.length > 0) {
      const row = existing[0]!;
      if (row.studentUserId === deps.studentUserId) {
        // Same student double-submitting — idempotent: surface the existing booking.
        bookingId = row.id;
      } else {
        // Race lost to another student.
        return {
          ok: false,
          reason: "slot_taken",
          formError:
            "השעה זה עתה נתפסה על-ידי תלמיד אחר. רעננו את הזמנים ובחרו שעה חדשה.",
        };
      }
    } else {
      const inserted = (await deps.db
        .insert(bookings)
        .values({
          studentUserId: deps.studentUserId,
          payerUserId: deps.studentUserId,
          tutorUserId: input.tutorUserId,
          subjectId: priceLookup.subjectId,
          startsAt,
          durationMinutes: input.duration,
          status: "confirmed", // mock-payment MVP — skip pending_payment
          priceIls,
          platformCommissionIls,
          tutorPayoutIls,
          createdByKind: "user",
          createdByActor: deps.studentUserId,
        })
        .returning({ id: bookings.id })) as Array<{ id: string }>;
      const firstRow = inserted[0];
      if (!firstRow) {
        log.error("[runCreateBooking] bookings INSERT returned no rows");
        return {
          ok: false,
          reason: "unknown",
          formError: "אירעה שגיאה בשמירת ההזמנה. נסו שוב.",
        };
      }
      bookingId = firstRow.id;
    }
  } catch (err) {
    // Code review 2026-05-19 (F5): the SELECT-then-INSERT pattern is not
    // atomic against concurrent writers. When two students race for the
    // same slot, both SELECTs return empty, both attempt the INSERT, and
    // the loser hits `uq_bookings_active_slot` (the partial UNIQUE on
    // (tutor_user_id, starts_at) WHERE status IN (pending_payment,
    // confirmed)). Previously this was misclassified as `reason:
    // "unknown"` with a generic retry message. Now we inspect the
    // Postgres error code (23505 = unique_violation) and the constraint
    // name and return `slot_taken` with the correct recovery copy.
    if (isUniqueViolationOn(err, "uq_bookings_active_slot")) {
      log.error(
        "[runCreateBooking] bookings INSERT lost to a concurrent booking (race)",
        err,
      );
      return {
        ok: false,
        reason: "slot_taken",
        formError:
          "השעה זה עתה נתפסה על-ידי תלמיד אחר. רעננו את הזמנים ובחרו שעה חדשה.",
      };
    }
    log.error("[runCreateBooking] bookings INSERT failed", err);
    return {
      ok: false,
      reason: "unknown",
      formError: "אירעה שגיאה בשמירת ההזמנה. נסו שוב.",
    };
  }

  // 6. SELECT-then-INSERT lesson_sessions. UNIQUE(booking_id) makes this idempotent.
  try {
    const existingSession = (await deps.db
      .select({ id: lessonSessions.id })
      .from(lessonSessions)
      .where(eq(lessonSessions.bookingId, bookingId))) as Array<{ id: string }>;

    if (existingSession.length === 0) {
      await deps.db.insert(lessonSessions).values({
        bookingId,
        roomProvider: "stub",
        status: "scheduled",
        createdByKind: "user",
        createdByActor: deps.studentUserId,
      });
    }
  } catch (err) {
    log.error("[runCreateBooking] lesson_sessions INSERT failed", err);
    return {
      ok: false,
      reason: "unknown",
      formError: "אירעה שגיאה בשמירת השיעור. נסו שוב.",
    };
  }

  // 7. SELECT-then-INSERT payments (mock). One settled mock-payment row per
  //    booking — closed-beta substitute for the future PayMe-driven flow.
  try {
    const existingPayment = (await deps.db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.bookingId, bookingId))) as Array<{ id: string }>;

    if (existingPayment.length === 0) {
      await deps.db.insert(payments).values({
        bookingId,
        paymeTransactionId: null,
        amountIls: priceIls,
        platformCommissionIls,
        tutorPayoutIls,
        status: "settled",
        settledAt: deps.now(),
        mockPayment: true,
        createdByKind: "user",
        createdByActor: deps.studentUserId,
      });
    }
  } catch (err) {
    log.error("[runCreateBooking] payments INSERT failed", err);
    return {
      ok: false,
      reason: "unknown",
      formError: "אירעה שגיאה ברישום התשלום. נסו שוב.",
    };
  }

  // 8. Audit row LAST.
  try {
    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "booking.created",
        actorKind: "user",
        actorId: deps.studentUserId,
        targetType: "booking",
        targetId: bookingId,
        payload: {
          tutor_user_id: input.tutorUserId,
          starts_at: startsAt.toISOString(),
          duration_minutes: input.duration,
          price_ils: priceIls,
          platform_commission_ils: platformCommissionIls,
          tutor_payout_ils: tutorPayoutIls,
          mock_payment: true,
        },
      }),
    );
  } catch (err) {
    // Audit failure is non-fatal — the booking itself is committed. Log it
    // so it surfaces in monitoring; the user still sees success.
    log.error("[runCreateBooking] audit INSERT failed (non-fatal)", err);
  }

  return { ok: true, bookingId };
}

// --- Read helper ----------------------------------------------------------

/**
 * Returns the booking row IF the requesting user is the student OR the tutor
 * on that booking. The auth claim is part of the WHERE predicate, so the
 * DB never returns rows the caller can't see — no JS-side fetch-then-check.
 * Returns null when the booking doesn't exist OR the user has no claim on
 * it (info-leak prevention; callers 404).
 */
export interface GetBookingByIdDeps {
  db: TutorDb;
  userId: string;
  logger?: { error: (message: string, err?: unknown) => void };
}

export async function getBookingByIdForUser(
  bookingId: string,
  deps: GetBookingByIdDeps,
): Promise<Booking | null> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };
  if (!isValidUuid(bookingId)) return null;
  try {
    // Select the full Booking row — pass an explicit column map so the
    // shape lines up with the TutorDb interface (which requires a `cols`
    // arg on `.select()`).
    const rows = (await deps.db
      .select({
        id: bookings.id,
        studentUserId: bookings.studentUserId,
        payerUserId: bookings.payerUserId,
        tutorUserId: bookings.tutorUserId,
        subjectId: bookings.subjectId,
        startsAt: bookings.startsAt,
        durationMinutes: bookings.durationMinutes,
        status: bookings.status,
        priceIls: bookings.priceIls,
        platformCommissionIls: bookings.platformCommissionIls,
        tutorPayoutIls: bookings.tutorPayoutIls,
        cancellationReason: bookings.cancellationReason,
        cancelledAt: bookings.cancelledAt,
        cancelledByUserId: bookings.cancelledByUserId,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        createdByKind: bookings.createdByKind,
        createdByActor: bookings.createdByActor,
        updatedByKind: bookings.updatedByKind,
        updatedByActor: bookings.updatedByActor,
      })
      .from(bookings)
      // Code review 2026-05-19 (F6): push the (student OR tutor) auth claim
      // INTO the WHERE clause so the DB filters rows the caller has no
      // right to see. Previously this was a JS-side post-fetch comparison,
      // which was the right result but mismatched the doc.
      .where(
        and(
          eq(bookings.id, bookingId),
          or(
            eq(bookings.studentUserId, deps.userId),
            eq(bookings.tutorUserId, deps.userId),
          ),
        ),
      )) as Booking[];
    return rows[0] ?? null;
  } catch (err) {
    log.error("[getBookingByIdForUser] lookup failed", err);
    return null;
  }
}
