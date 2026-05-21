"use server";

// Server Action wrapper for Story 4.3's booking-submission flow.
// Thin Next.js binding around `runCreateBooking` + `upsertBillingAddress`
// in `booking-flow.ts` + `billing-address-flow.ts`. Builds the real deps
// (getDb + requireAuth + price/subject resolvers) and converts the
// orchestrator's result into a redirect (success) or a return-value
// rendered by the checkout client (failure).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";
import { tutorProfiles, tutorSubjects } from "@/lib/db/schema";
import { runCreateBooking } from "./booking-flow";
import {
  upsertBillingAddress,
  type BillingAddressInput,
} from "./billing-address-flow";
import type { TutorDb } from "@/app/tutor/onboarding/profile/profile-flow";

interface CheckoutSubmitInput {
  /** Carried from the gate URL — same shape as `CreateBookingInput`. */
  tutorUserId: string;
  slotIso: string;
  duration: 45 | 60 | 75 | 90;
  sig: string;
  /** Billing-address form fields. */
  billing: BillingAddressInput;
}

export type CheckoutSubmitFailure =
  | { kind: "form"; formError: string }
  | { kind: "fields"; fieldErrors: Partial<Record<keyof BillingAddressInput, string>> };

export type CheckoutSubmitResult = { ok: false; failure: CheckoutSubmitFailure };

/**
 * Single Server Action that backs the checkout form's submit. Saves the
 * billing address (UPSERT) and creates the booking + lesson session +
 * mock payment + audit row in one sequential pass. Redirects to
 * `/booking/[id]/confirmed` on success; returns a form-state error otherwise.
 *
 * NOTE: the success path is a `redirect()` throw (Next-native control
 * flow) — the caller never observes a success object. That keeps the
 * return shape narrow to failures only.
 */
export async function submitCheckoutAction(
  input: CheckoutSubmitInput,
): Promise<CheckoutSubmitResult> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/checkout");
  }
  // Only students book lessons — single-role model (CLAUDE.md). A tutor or
  // admin account is never a booking actor. `checkoutHandoffAction`
  // bounces non-students before /checkout, but a hand-crafted POST
  // straight to this action must be rejected here too — the load-bearing
  // gate on the write path.
  if (session.user.role === "tutor") {
    redirect("/tutor/me");
  }
  if (session.user.role === "admin") {
    redirect("/admin");
  }
  const userId = session.user.id;
  const realDb = getDb();
  const db = realDb as unknown as TutorDb;

  // 1. Upsert billing address first — its validation is cheap and we want
  //    to surface field errors before doing any booking work.
  const billingResult = await upsertBillingAddress(input.billing, {
    db,
    userId,
  });
  if (!billingResult.ok) {
    return {
      ok: false,
      failure: { kind: "fields", fieldErrors: billingResult.fieldErrors },
    };
  }

  // 2. Resolve tutor price for the requested duration. The tutor's
  //    price-per-length lives on `tutor_profiles`; we also grab the
  //    tutor's primary subject (best-effort — booking.subject_id is nullable).
  //    Uses `realDb` (full Drizzle surface) because `.limit()` is not on
  //    the structural TutorDb interface.
  const priceRows = await realDb
    .select({
      hourlyPriceIls: tutorProfiles.hourlyPriceIls,
      lesson45PriceIls: tutorProfiles.lesson45PriceIls,
      lesson75PriceIls: tutorProfiles.lesson75PriceIls,
      lesson90PriceIls: tutorProfiles.lesson90PriceIls,
    })
    .from(tutorProfiles)
    .where(eq(tutorProfiles.userId, input.tutorUserId))
    .limit(1);

  const priceRow = priceRows[0] ?? null;

  // 3. Find the tutor's first subject (best-effort — booking.subject_id is nullable).
  const subjectRows = await realDb
    .select({ subjectId: tutorSubjects.subjectId })
    .from(tutorSubjects)
    .where(eq(tutorSubjects.tutorUserId, input.tutorUserId))
    .limit(1);
  const subjectId = subjectRows[0]?.subjectId ?? null;

  const bookingResult = await runCreateBooking(
    {
      tutorUserId: input.tutorUserId,
      slotIso: input.slotIso,
      duration: input.duration,
      sig: input.sig,
    },
    {
      db,
      studentUserId: userId,
      now: () => new Date(),
      getTutorPriceForDuration: async (_tutorUserId, duration) => {
        if (!priceRow) return null;
        const priceMap = {
          45: priceRow.lesson45PriceIls,
          60: priceRow.hourlyPriceIls,
          75: priceRow.lesson75PriceIls,
          90: priceRow.lesson90PriceIls,
        } as const;
        return {
          priceIls: priceMap[duration],
          subjectId,
        };
      },
    },
  );

  if (!bookingResult.ok) {
    return {
      ok: false,
      failure: { kind: "form", formError: bookingResult.formError },
    };
  }

  // 4. Invalidate the surfaces that read from bookings.
  revalidatePath(`/tutor/${input.tutorUserId}`);
  revalidatePath("/dashboard");
  revalidatePath("/tutor/me");

  // 5. Redirect to confirmation. `redirect` throws — control flow never
  //    falls through to a return statement.
  redirect(`/booking/${bookingResult.bookingId}/confirmed`);
}
