// Server Action that resolves the data needed to mount `<BookingModal>`
// for an arbitrary tutor. Extracts the data-gathering logic that lives
// inline in `app/tutor/[slug]/page.tsx` so it can be reused from `/browse`
// (where the row's "קביעת שיעור" button summons the same modal without
// navigating to the profile page).
//
// Why a Server Action and not a Server Component prop:
//   - Lazy-load on click. The listing query returns card data only; this
//     action fires the per-tutor `tutor_availability` + price + R2 presign
//     work ONLY when the student actually wants to book. Pre-fetching for
//     every visible row would JOIN-explode at scale (Winston's call).
//   - Same modal contract as the profile page — `BookingModal` is already
//     prop-driven (audit 2026-05-19); zero refactor needed.
//
// Empty-state escape hatch: when `hasAnyAvailability=false`, the caller
// renders the modal's "אין זמינות" body with a "ראו פרופיל מלא" CTA in
// the footer instead of the usual "המשך". The Server Action itself
// doesn't know which CTA to render — that's purely a client decision.

"use server";

import { isUuid } from "@/lib/auth/slug-validation";
import { auth } from "@/lib/auth/auth";
import {
  computeSlotStates,
  startOfTodayJerusalem,
} from "@/lib/availability/compute-slots";
import {
  getActiveBookingsForTutor,
  getDiscoverableTutorByUserId,
  getTutorAvailabilityRows,
} from "@/lib/db/queries/tutor-queries";
import { getFilesProvider } from "@/lib/providers/files";
import type {
  LessonDurationMinutes,
  SerializedSlot,
  TutorBookingContext,
} from "./tutor-booking-context-types";

const PRESIGNED_URL_TTL_SEC = 3600;
const CALENDAR_DAYS_AHEAD = 14;

/**
 * Resolve the booking-context for a tutor by user_id. Returns `null` when
 * the tutor doesn't exist or isn't discoverable — the caller renders the
 * modal's empty state in that case (don't 404; the listing got stale and
 * recovery should be in-place, not a page navigation).
 *
 * Inputs validated:
 *   - `tutorUserId` must be a UUID (regex). A tampered hidden field hits
 *     this gate first; subsequent DB calls are skipped.
 *   - `initialDuration` defaults to 60 when unset / unknown. Same coercion
 *     contract as the profile page's `parseDuration`.
 */
export async function getTutorBookingContext(
  tutorUserId: string,
  initialDurationRaw?: number,
): Promise<TutorBookingContext | null> {
  if (!isUuid(tutorUserId)) return null;

  const initialDuration = coerceDuration(initialDurationRaw);

  const tutor = await getDiscoverableTutorByUserId(tutorUserId);
  if (!tutor) return null;

  const weekStart = startOfTodayJerusalem(new Date());
  const weekEnd = new Date(weekStart.getTime() + CALENDAR_DAYS_AHEAD * 24 * 60 * 60 * 1000);

  // Fetch availability + bookings + presigned photo in parallel — same
  // shape as `resolveCalendarData` on the profile page.
  const [availability, bookings, profilePhotoUrl, session] = await Promise.all([
    safeAvailability(tutorUserId, weekStart, weekEnd),
    safeBookings(tutorUserId, weekStart, weekEnd),
    safePresign("tutor-profile-photos", tutor.profilePhotoR2Key),
    safeAuth(),
  ]);

  const slotStates = computeSlotStates({
    availability,
    bookings,
    from: weekStart,
    daysAhead: CALENDAR_DAYS_AHEAD,
    durationMinutes: initialDuration,
  });

  const hasAnyAvailability = Array.from(slotStates.values()).some((slots) =>
    slots.some((s) => s.status === "available"),
  );

  const viewerIsOwner =
    session?.user?.id !== undefined && session.user.id === tutorUserId;

  // Serialize the Map for transport. The plain array of [key, value]
  // pairs survives JSON.stringify; new Map(...) reverses it client-side.
  const serializedSlots: Array<[string, SerializedSlot[]]> = [];
  for (const [dateKey, slots] of slotStates.entries()) {
    serializedSlots.push([
      dateKey,
      slots.map((s) => ({
        startIsoUtc: s.startIsoUtc,
        localTime: s.localTime,
        status: s.status,
      })),
    ]);
  }

  return {
    tutorUserId,
    displayName: tutor.displayName,
    profilePhotoUrl,
    prices: {
      45: tutor.lesson45PriceIls,
      60: tutor.hourlyPriceIls,
      75: tutor.lesson75PriceIls,
      90: tutor.lesson90PriceIls,
    },
    slotStates: serializedSlots,
    weekStartUtcIso: weekStart.toISOString(),
    isSignedIn: !!session?.user?.id,
    initialDuration,
    hasAnyAvailability,
    viewerIsOwner,
  };
}

// ---------------------------------------------------------------------------
// Helpers — all return safe-degraded sentinels on error so the action never
// 500s. The modal renders the empty-state body in those cases.
// ---------------------------------------------------------------------------

async function safeAvailability(
  userId: string,
  from: Date,
  to: Date,
): Promise<Awaited<ReturnType<typeof getTutorAvailabilityRows>>> {
  try {
    return await getTutorAvailabilityRows(userId, { from, to });
  } catch (err) {
    console.error("[getTutorBookingContext] availability lookup failed", err);
    return [];
  }
}

async function safeBookings(
  userId: string,
  from: Date,
  to: Date,
): Promise<Awaited<ReturnType<typeof getActiveBookingsForTutor>>> {
  try {
    return await getActiveBookingsForTutor(userId, { from, to });
  } catch (err) {
    console.error("[getTutorBookingContext] bookings lookup failed", err);
    return [];
  }
}

async function safePresign(
  bucket: "tutor-intro-videos" | "tutor-profile-photos",
  key: string | null,
): Promise<string | null> {
  if (!key) return null;
  try {
    return await getFilesProvider().generatePresignedGetUrl({
      bucket,
      key,
      expiresInSec: PRESIGNED_URL_TTL_SEC,
    });
  } catch (err) {
    console.error(`[getTutorBookingContext] presign failed (${bucket})`, err);
    return null;
  }
}

async function safeAuth() {
  try {
    return await auth();
  } catch (err) {
    console.error("[getTutorBookingContext] auth() failed", err);
    return null;
  }
}

function coerceDuration(raw: number | undefined): LessonDurationMinutes {
  switch (raw) {
    case 45:
    case 60:
    case 75:
    case 90:
      return raw;
    default:
      return 60;
  }
}
