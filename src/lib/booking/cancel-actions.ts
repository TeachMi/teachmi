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
    // Both surfaces render upcoming bookings off the same queries; revalidate
    // both so a tutor-cancel reflects on the student's dashboard (and vice
    // versa) the next time either party visits.
    revalidatePath("/dashboard");
    revalidatePath("/tutor/me");
    revalidatePath(`/booking/${input.bookingId}/confirmed`);
  }

  return result;
}
