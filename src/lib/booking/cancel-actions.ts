"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { requireAuth } from "../auth/guards";
import type { TutorDb } from "@/app/tutor/onboarding/profile/profile-flow";
import {
  runCancelBooking,
  type CancelBookingFlowResult,
} from "./cancel-flow";

// "use server" wrapper for the cancel-booking flow. Both student- and
// tutor-initiated cancels route through here — the orchestrator derives
// the actor's role from the booking row, so the client doesn't need to
// declare it.
//
// Revalidates the routes that surface upcoming bookings so the UI
// reflects the new state on the next render. We don't `redirect()` here —
// the caller (cancel modal) decides where to send the user (back to the
// dashboard, or stay on the confirmed page which will now show the
// cancelled state).

export async function cancelBookingAction(input: {
  bookingId: string;
  reason?: string | null;
}): Promise<CancelBookingFlowResult> {
  const user = await requireAuth();
  const db = getDb() as unknown as TutorDb;

  const result = await runCancelBooking(input, {
    db,
    currentUserId: user.id,
    now: () => new Date(),
  });

  if (result.ok) {
    // Three surfaces render bookings off the cancel target; revalidate all
    // of them so the cancel reflects everywhere on the next render.
    //
    // Review patch 3: `/tutor/me/schedule` is the 4-week-calendar surface
    // that overlays bookings via `getActiveBookingsWithDetailsForTutor`.
    // Without an explicit revalidate, a cancel from the BookingPeekModal
    // (or from /booking/[id]/confirmed) left the booked cell stuck on the
    // calendar until the next hard nav — directly contradicting the
    // rule/reality split this PR repairs.
    revalidatePath("/dashboard");
    revalidatePath("/tutor/me");
    revalidatePath("/tutor/me/schedule");
    revalidatePath(`/booking/${input.bookingId}/confirmed`);
  }

  return result;
}
