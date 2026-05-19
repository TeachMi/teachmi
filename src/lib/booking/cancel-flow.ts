// Pure orchestrator for the booking-cancel Server Action.
// Founder + party-mode (Sally / John / Winston) 2026-05-19.
// FakeDb-tested via cancel-flow.test.ts. `cancel-actions.ts` ("use server")
// is the thin Next.js wrapper that builds the real dependencies (getDb +
// requireAuth + revalidatePath).
//
// MVP1 CANCELLATION POLICY (locked):
//   - Free cancellation up to lesson start. No penalty windows, no refund
//     math — flip the booking to `cancelled` and the (mock) payment to
//     `refunded`. Phase 2 will add penalty windows (deferred).
//   - Both student AND tutor can cancel. Auth predicate is composed in
//     the booking SELECT — DB filters out rows the caller has no claim on.
//
// MOCK PAYMENT BRANCH (Story 4.3 carryover):
//   - Closed-beta payments rows have `mock_payment=true, status='settled'`.
//     On cancel, flip the payment status to `refunded`. No external call.
//   - Real PayMe-Marketplace rows (`mock_payment=false`) require a
//     `refundPayment()` call — wired in a future story. Today we surface
//     the branch via `// TODO(payments-v2)` so the swap is one function body,
//     not a refactor.
//
// SEQUENTIAL WRITES — Neon-HTTP has no transactions. The orchestrator does
// its writes one at a time, with the audit row LAST so a partial-failure
// leaves an inconsistent audit trail rather than dropping user-visible
// state. Same precedent as booking-flow + schedule-flow + profile-flow.
//
// IDEMPOTENCY — cancelling an already-cancelled booking is NOT an error.
// The user clicked the button twice; their intent is already satisfied.
// We return ok without re-writing anything. Already-completed / no-show
// bookings ARE errors (the state has moved on; cancel is meaningless).

import { and, eq, inArray, or } from "drizzle-orm";
import { auditEvents, bookings, payments } from "../db/schema";
import { toAuditEventValues } from "../db/audit";
import type { TutorDb } from "@/app/tutor/onboarding/profile/profile-flow";

// --- Constants ------------------------------------------------------------

/** Max length of the free-text cancellation reason persisted to bookings.cancellation_reason. */
export const CANCEL_REASON_MAX_CHARS = 280;

// --- Result type ----------------------------------------------------------

export type CancelBookingFlowResult =
  | {
      ok: true;
      /** Which side of the booking initiated the cancel. */
      cancelledByRole: "student" | "tutor";
      /** True when the request was a no-op (booking was already cancelled). */
      alreadyCancelled: boolean;
    }
  | {
      ok: false;
      reason:
        | "invalid_input"
        | "not_found"
        | "already_completed"
        | "past_start"
        | "unknown";
      formError: string;
    };

// --- Input shape ----------------------------------------------------------

export interface CancelBookingInput {
  bookingId: string;
  /** Free-text reason; trimmed + truncated to CANCEL_REASON_MAX_CHARS. */
  reason?: string | null;
}

// --- Deps -----------------------------------------------------------------

export interface CancelBookingDeps {
  db: TutorDb;
  /** The signed-in user issuing the cancel. */
  currentUserId: string;
  now: () => Date;
  logger?: { error: (message: string, err?: unknown) => void };
}

// --- Helpers --------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function normalizeReason(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, CANCEL_REASON_MAX_CHARS);
}

interface BookingLookupRow {
  id: string;
  status: string;
  studentUserId: string;
  tutorUserId: string;
  startsAt: Date;
  // Surfaced so the idempotent-cancelled path can derive the ORIGINAL
  // canceller's role rather than the current caller's (review patch 2).
  cancelledByUserId: string | null;
}

interface PaymentLookupRow {
  id: string;
  status: string;
  mockPayment: boolean;
}

// --- Orchestrator ---------------------------------------------------------

export async function runCancelBooking(
  input: CancelBookingInput,
  deps: CancelBookingDeps,
): Promise<CancelBookingFlowResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };

  // 1. Shape validation.
  if (!isValidUuid(input.bookingId)) {
    return {
      ok: false,
      reason: "invalid_input",
      formError: "ההזמנה לא תקינה.",
    };
  }
  const reason = normalizeReason(input.reason);

  // 2. Lookup + authorization in the same query (Winston's order:
  //    auth → state → time). The DB filters by (studentUserId === caller
  //    OR tutorUserId === caller); a nonexistent booking and a forbidden
  //    one both return zero rows. Don't distinguish — info-leak avoidance.
  let booking: BookingLookupRow | null;
  try {
    const rows = (await deps.db
      .select({
        id: bookings.id,
        status: bookings.status,
        studentUserId: bookings.studentUserId,
        tutorUserId: bookings.tutorUserId,
        startsAt: bookings.startsAt,
        cancelledByUserId: bookings.cancelledByUserId,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.id, input.bookingId),
          or(
            eq(bookings.studentUserId, deps.currentUserId),
            eq(bookings.tutorUserId, deps.currentUserId),
          ),
        ),
      )) as BookingLookupRow[];
    booking = rows[0] ?? null;
  } catch (err) {
    log.error("[runCancelBooking] booking SELECT failed", err);
    return {
      ok: false,
      reason: "unknown",
      formError: "אירעה שגיאה. נסו שוב.",
    };
  }
  if (booking === null) {
    return {
      ok: false,
      reason: "not_found",
      formError: "ההזמנה לא נמצאה.",
    };
  }

  const cancelledByRole: "student" | "tutor" =
    booking.studentUserId === deps.currentUserId ? "student" : "tutor";

  // 3. State gate.
  if (booking.status === "cancelled") {
    // Idempotent — the user clicked twice OR the other party already
    // cancelled. Either way their intent is satisfied. No re-writes, no
    // audit row, no error.
    //
    // Review patch 2: derive role from `cancelledByUserId` on the row,
    // not from the current caller, so a student opening a
    // tutor-cancelled booking and re-clicking cancel gets the correct
    // `cancelledByRole: "tutor"` attribution rather than "student".
    const originalCancellerId =
      booking.cancelledByUserId ?? deps.currentUserId;
    const originalRole: "student" | "tutor" =
      booking.studentUserId === originalCancellerId ? "student" : "tutor";
    return {
      ok: true,
      cancelledByRole: originalRole,
      alreadyCancelled: true,
    };
  }
  if (booking.status === "completed" || booking.status === "no_show") {
    return {
      ok: false,
      reason: "already_completed",
      formError: "השיעור כבר התקיים, לא ניתן לבטלו.",
    };
  }
  if (booking.status !== "confirmed" && booking.status !== "pending_payment") {
    // Defensive — unknown status (schema drift). Surface as unknown error
    // rather than silently treating as cancellable.
    log.error(
      `[runCancelBooking] unexpected booking.status="${booking.status}"`,
    );
    return {
      ok: false,
      reason: "unknown",
      formError: "אירעה שגיאה. נסו שוב.",
    };
  }

  // Review patch 4: enforce "tutor must supply a reason" server-side.
  // The CancelLessonModal's `buildReasonPayload` already blocks the form
  // submit, but a curl/tampered client could submit a tutor cancel with
  // no reason. The required-reason rule is part of the MVP1 policy (see
  // mocks/cancel-modal.html + party-mode 2026-05-19); keep the trust
  // boundary at the server, not in client JS.
  if (cancelledByRole === "tutor" && reason === null) {
    return {
      ok: false,
      reason: "invalid_input",
      formError: "יש לבחור סיבה לביטול.",
    };
  }

  // 4. Time gate. Past-start cancellations are rejected even when the UI
  //    hides the button — the UI lies, the server doesn't.
  const now = deps.now();
  if (now.getTime() >= booking.startsAt.getTime()) {
    return {
      ok: false,
      reason: "past_start",
      formError: "השיעור כבר התחיל, לא ניתן לבטלו.",
    };
  }

  // 5. UPDATE the booking row.
  //
  // Review patch 1: the WHERE clause now predicates on status IN
  // ('confirmed','pending_payment') so two simultaneous cancels can't
  // both flip the row (which would overwrite `cancelled_by_user_id`
  // and double-write the audit). The .returning() check turns the
  // race-loser into an idempotent success ("already cancelled by the
  // other party in the gap between our SELECT and UPDATE") rather than
  // a stomp.
  let updatedBookingRows: Array<{ id: string }>;
  try {
    updatedBookingRows = (await deps.db
      .update(bookings)
      .set({
        status: "cancelled",
        cancellationReason: reason,
        cancelledAt: now,
        cancelledByUserId: deps.currentUserId,
        updatedAt: now,
        updatedByKind: "user",
        updatedByActor: deps.currentUserId,
      })
      .where(
        and(
          eq(bookings.id, booking.id),
          inArray(bookings.status, ["confirmed", "pending_payment"]),
        ),
      )
      .returning({ id: bookings.id })) as Array<{ id: string }>;
  } catch (err) {
    log.error("[runCancelBooking] bookings UPDATE failed", err);
    return {
      ok: false,
      reason: "unknown",
      formError: "אירעה שגיאה בעדכון ההזמנה. נסו שוב.",
    };
  }
  if (updatedBookingRows.length === 0) {
    // Lost the race — between our SELECT (booking.status === 'confirmed')
    // and this UPDATE, another actor (counterparty, admin, scheduled job)
    // already cancelled or completed the booking. The user's intent is
    // satisfied either way; surface as idempotent ok with alreadyCancelled.
    return { ok: true, cancelledByRole, alreadyCancelled: true };
  }

  // 6. Payment branch. Today everything is mock_payment=true; the future
  //    real-PayMe path is stubbed out with a TODO marker so the swap is a
  //    one-function change rather than a refactor.
  let paymentsForBooking: PaymentLookupRow[] = [];
  try {
    paymentsForBooking = (await deps.db
      .select({
        id: payments.id,
        status: payments.status,
        mockPayment: payments.mockPayment,
      })
      .from(payments)
      .where(eq(payments.bookingId, booking.id))) as PaymentLookupRow[];
  } catch (err) {
    log.error("[runCancelBooking] payments SELECT failed (non-fatal)", err);
    // Continue — the booking is already cancelled. A stranded settled
    // payment is recoverable via the reconciliation job (Phase 2).
  }
  // Review patch 7: count ACTUALLY-refunded rows in a separate counter so
  // the audit payload doesn't claim refunds that silently failed in the
  // try/catch below. Previously the audit re-filtered `paymentsForBooking`
  // (the pre-update read), which lied when a mock UPDATE rejected.
  let paymentRowsRefunded = 0;
  for (const payment of paymentsForBooking) {
    if (payment.status !== "settled") continue;
    if (payment.mockPayment) {
      try {
        await deps.db
          .update(payments)
          .set({
            status: "refunded",
            updatedAt: now,
            updatedByKind: "user",
            updatedByActor: deps.currentUserId,
          })
          .where(eq(payments.id, payment.id));
        paymentRowsRefunded++;
      } catch (err) {
        // Non-fatal: the booking row carries the cancel state-of-truth.
        // Logged for the reconciliation job to catch. The counter is NOT
        // incremented — the audit row reflects what actually moved.
        log.error("[runCancelBooking] payments UPDATE (mock) failed", err);
      }
      continue;
    }
    // TODO(payments-v2): real PayMe-Marketplace refund. Will call
    // `refundPayment(payment.id)` → external API → on success UPDATE
    // status='refunded' + populate refund_transaction_id. Today no
    // real-payment rows exist (Story 4.3 ships mock only), so this branch
    // never fires in closed beta.
    log.error(
      `[runCancelBooking] real-payment cancel hit unimplemented refund branch (payment ${payment.id})`,
    );
  }

  // 7. Audit row LAST. Non-fatal if it fails — the user-visible state is
  //    already correct. Same precedent as runCreateBooking step 8.
  try {
    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "booking.cancelled",
        actorKind: "user",
        actorId: deps.currentUserId,
        targetType: "booking",
        targetId: booking.id,
        payload: {
          cancelled_by_role: cancelledByRole,
          counterparty_user_id:
            cancelledByRole === "student"
              ? booking.tutorUserId
              : booking.studentUserId,
          starts_at: booking.startsAt.toISOString(),
          status_before: booking.status,
          reason: reason ?? null,
          payment_rows_refunded: paymentRowsRefunded,
        },
      }),
    );
  } catch (err) {
    log.error("[runCancelBooking] audit INSERT failed (non-fatal)", err);
  }

  return { ok: true, cancelledByRole, alreadyCancelled: false };
}
