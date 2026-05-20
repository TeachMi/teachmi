import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { auth } from "@/lib/auth/auth";
import { isUuid } from "@/lib/auth/slug-validation";
import {
  computeSlotStates,
  startOfTodayJerusalem,
} from "@/lib/availability/compute-slots";
import {
  type DiscoverableTutorPublic,
  type PublicReviewRow,
  type RatingHistogram,
  type TutorAvailabilityRow,
  type TutorSubjectPublic,
  type ActiveBookingRow,
  getActiveBookingsForTutor,
  getDiscoverableTutorByUserId,
  getTutorAvailabilityRows,
  getTutorRatingHistogram,
  getTutorRecentReviews,
  getTutorSubjects,
} from "@/lib/db/queries/tutor-queries";
import { getFilesProvider } from "@/lib/providers/files";
import { BookingSidebar } from "./_components/BookingSidebar";
import { Hero } from "./_components/Hero";
import { RatingWidget } from "./_components/RatingWidget";
import { ReviewsList } from "./_components/ReviewsList";
import { SubjectChips } from "./_components/SubjectChips";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ duration?: string }>;
}

const PRESIGNED_URL_TTL_SEC = 3600; // 1 hour
// Two-week public-calendar horizon (Sally 2026-05-18). Students rarely
// plan more than 2 weeks ahead; the tutor's exception-overrides further
// out still apply when the visitor navigates there.
const CALENDAR_DAYS_AHEAD = 14;

// Wrap in `cache()` so `generateMetadata` and the page body share the same
// per-request lookup. Without this, Next 16 issues two DB round-trips per
// page render. React's `cache` is request-scoped automatically in server
// components.
//
// At MVP 1 the `[slug]` route param contents are the tutor's `user_id` UUID.
// Story 3.2 (this story) chose not to add a real human-readable slug column;
// Story 3.5 or later may revisit for SEO if research justifies it.
const resolveDiscoverableTutor = cache(
  async (slug: string): Promise<DiscoverableTutorPublic | null> => {
    if (!isUuid(slug)) return null;
    try {
      return await getDiscoverableTutorByUserId(slug);
    } catch (err) {
      console.error("[tutor/[slug]/page] discoverable lookup failed", err);
      return null;
    }
  },
);

const resolveTutorSubjects = cache(
  async (userId: string): Promise<TutorSubjectPublic[]> => {
    try {
      return await getTutorSubjects(userId);
    } catch (err) {
      console.error("[tutor/[slug]/page] subjects lookup failed", err);
      return [];
    }
  },
);

// Calendar data must be fetched atomically — if EITHER availability or
// bookings fails independently, the calendar would render real bookings
// as clickable (advertising taken slots) or block all slots erroneously.
// Returning `null` here signals "treat as empty-state" so the calendar
// renders the "no availability yet" card instead of partial data.
const resolveCalendarData = cache(
  async (
    userId: string,
    from: Date,
    to: Date,
  ): Promise<{
    availability: TutorAvailabilityRow[];
    bookings: ActiveBookingRow[];
  } | null> => {
    try {
      const [availability, bookings] = await Promise.all([
        getTutorAvailabilityRows(userId, { from, to }),
        getActiveBookingsForTutor(userId, { from, to }),
      ]);
      return { availability, bookings };
    } catch (err) {
      console.error("[tutor/[slug]/page] calendar lookup failed", err);
      return null;
    }
  },
);

const resolveRatingHistogram = cache(
  async (userId: string): Promise<RatingHistogram | null> => {
    try {
      return await getTutorRatingHistogram(userId);
    } catch (err) {
      console.error("[tutor/[slug]/page] rating histogram lookup failed", err);
      return null;
    }
  },
);

const resolveRecentReviews = cache(
  async (userId: string): Promise<PublicReviewRow[]> => {
    try {
      return await getTutorRecentReviews(userId, { limit: 10 });
    } catch (err) {
      console.error("[tutor/[slug]/page] recent reviews lookup failed", err);
      return [];
    }
  },
);

async function presignFromR2(
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
    console.error(`[tutor/[slug]/page] presign failed (${bucket}, ${key})`, err);
    return null;
  }
}

function parseDuration(raw: string | undefined): 45 | 60 | 75 | 90 {
  switch (raw) {
    case "45":
      return 45;
    case "75":
      return 75;
    case "90":
      return 90;
    default:
      return 60;
  }
}

function truncateForDescription(text: string, maxLen = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}

// Strip Unicode bidirectional override characters (LRE/RLE/PDF/LRO/RLO and
// isolates LRI/RLI/FSI/PDI) from tutor-controlled text. React escapes HTML
// but does NOT strip these control codes — without this guard, a malicious
// or accidental code in a tutor's bio could visually flip surrounding UI
// in this RTL/Hebrew marketplace.
const BIDI_OVERRIDE_RE = /[‪-‮⁦-⁩]/g;
function stripBidiOverrides(text: string): string {
  return text.replace(BIDI_OVERRIDE_RE, "");
}

// `auth()` is not in a try/catch elsewhere because Story 2.3's gate page
// never called it. With Story 3.2's signed-in calendar-link branch, an
// uncaught NextAuth decode failure (rotated AUTH_SECRET, malformed
// cookie) would 500 the public profile page. Public routes must degrade
// to "anon visitor" rather than crash.
async function safeAuth(): Promise<{ user?: { id?: string } | null } | null> {
  try {
    return (await auth()) as { user?: { id?: string } | null } | null;
  } catch (err) {
    console.error("[tutor/[slug]/page] auth() lookup failed; degrading to anon", err);
    return null;
  }
}

// Closed-beta indexing guard. The page is publicly viewable to anyone
// (FR18) but we only want search engines to index when (a) running in
// production AND (b) the founder has explicitly opted in via env var.
// Until then, preview/dev/closed-beta deployments are noindex.
function buildRobotsDirective(): { index: boolean; follow: boolean } {
  const allowed =
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PUBLIC_INDEX === "true";
  return { index: allowed, follow: allowed };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tutor = await resolveDiscoverableTutor(slug);
  if (!tutor) {
    return { title: "TeachMe" };
  }

  // OG description prefers the short bio (1-2 sentence summary). Falls back
  // to a generic line so closed-beta tutors who haven't filled the form yet
  // still get sharable metadata.
  const description = tutor.shortBio
    ? stripBidiOverrides(truncateForDescription(tutor.shortBio))
    : `${tutor.displayName} — מורה ב-TeachMe`;
  // OG image is served via a stable proxy route that re-signs the R2 URL
  // per request. Social-media scrapers (Slack/FB/Twitter) cache the
  // STABLE proxy URL; the signed R2 URL never escapes server-side. When
  // the tutor has no profile photo, we serve the PNG placeholder
  // directly. Story 3.2 review decision D2.
  const photoUrl = tutor.profilePhotoR2Key
    ? `/api/og/tutor/${tutor.userId}/photo`
    : "/og-default-tutor.png";

  return {
    title: `${tutor.displayName} · TeachMe`,
    description,
    robots: buildRobotsDirective(),
    openGraph: {
      title: `${tutor.displayName} · TeachMe`,
      description,
      type: "profile",
      locale: "he_IL",
      images: [
        {
          url: photoUrl,
          width: 1200,
          height: 630,
          alt: tutor.displayName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${tutor.displayName} · TeachMe`,
      description,
    },
  };
}

export default async function PublicTutorProfilePage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const tutor = await resolveDiscoverableTutor(slug);

  if (!tutor) {
    // Intentional 404 (not a friendly "pending approval" page) — leaking tutor
    // existence to anonymous visitors is the info-leak we're avoiding. Story
    // 2.3 spec AC1.
    notFound();
  }

  const search = (await searchParams) ?? {};
  const selectedDuration = parseDuration(search.duration);

  // Compute the 7-day window starting at midnight in Asia/Jerusalem.
  const weekStart = startOfTodayJerusalem(new Date());
  const weekEnd = new Date(
    weekStart.getTime() + CALENDAR_DAYS_AHEAD * 24 * 60 * 60 * 1000,
  );

  // Fetch everything in parallel (each is cache()-wrapped + dep-injected).
  // `safeAuth` and `resolveCalendarData` swallow errors and return null
  // sentinels — public profile must not 500 on auth/DB blips. If
  // calendar data is null, downstream renders the empty-state card.
  const [session, subjects, calendarData, rating, recentReviews, introVideoUrl, profilePhotoUrl] =
    await Promise.all([
      safeAuth(),
      resolveTutorSubjects(tutor.userId),
      resolveCalendarData(tutor.userId, weekStart, weekEnd),
      resolveRatingHistogram(tutor.userId),
      resolveRecentReviews(tutor.userId),
      presignFromR2("tutor-intro-videos", tutor.introVideoR2Key),
      presignFromR2("tutor-profile-photos", tutor.profilePhotoR2Key),
    ]);

  const slotStates = computeSlotStates({
    availability: calendarData?.availability ?? [],
    bookings: calendarData?.bookings ?? [],
    from: weekStart,
    daysAhead: CALENDAR_DAYS_AHEAD,
    durationMinutes: selectedDuration,
  });

  const isSignedIn = !!session?.user?.id;
  // Story 4.3 (PM round 2026-05-18): tutors viewing their own public
  // profile see an "owner" sidebar with a back-link to /tutor/me, no
  // CTA. The server's `runCreateBooking` enforces the same guard, so a
  // tampered request still 404-ish bounces back.
  const viewerIsOwner =
    session?.user?.id !== undefined && session.user.id === tutor.userId;

  const prices = {
    45: tutor.lesson45PriceIls,
    60: tutor.hourlyPriceIls,
    75: tutor.lesson75PriceIls,
    90: tutor.lesson90PriceIls,
  } as const;

  // Closed-beta UX rule (founder 2026-05-18): show the rating widget on
  // the public profile only once the tutor has at least one real review.
  // Until then, the histogram is misleading (a 0-of-0 average looks bad).
  const showRatingWidget = rating !== null && rating.total > 0;

  // "Has anything bookable" — toggles the sidebar CTA between active and
  // disabled. Cheaper than recomputing inside the BookingSidebar.
  const hasAnyAvailability = Array.from(slotStates.values()).some((slots) =>
    slots.some((s) => s.status === "available"),
  );

  return (
    <AppShell mainClassName="flex-1 bg-linen">
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        {/* Two-column layout: profile content (main) + sticky booking
            sidebar. On lg+ the sidebar is fixed via lg:sticky, so it
            stays in view as the student scrolls the bio and reviews. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 min-w-0">
            <Hero
              tutor={{
                ...tutor,
                // Strip Unicode bidi-override control codes from EVERY tutor-
                // authored text field rendered on the public profile. The
                // codes are invisible but reflow surrounding RTL UI; only
                // the page (which loads the raw row) is positioned to clean
                // them before the Hero / About / chip renderers consume them.
                tagline: tutor.tagline
                  ? stripBidiOverrides(tutor.tagline)
                  : tutor.tagline,
                shortBio: tutor.shortBio
                  ? stripBidiOverrides(tutor.shortBio)
                  : tutor.shortBio,
                longBio: tutor.longBio
                  ? stripBidiOverrides(tutor.longBio)
                  : tutor.longBio,
              }}
              subjects={subjects}
              introVideoUrl={introVideoUrl}
              profilePhotoUrl={profilePhotoUrl}
            />

            {showRatingWidget && (
              <div className="mb-12">
                <RatingWidget histogram={rating!} />
              </div>
            )}

            {recentReviews.length > 0 && (
              <ReviewsList
                reviews={recentReviews}
                totalCount={rating?.total ?? recentReviews.length}
              />
            )}

            <SubjectChips subjects={subjects} withSectionHeader />
          </section>

          <div className="lg:col-span-1">
            <BookingSidebar
              tutorUserId={tutor.userId}
              displayName={tutor.displayName}
              profilePhotoUrl={profilePhotoUrl}
              prices={prices}
              ratingAverage={rating?.average ?? null}
              ratingCount={rating?.total ?? 0}
              totalLessonsCompleted={tutor.totalLessonsCompleted}
              slotStates={slotStates}
              weekStartUtc={weekStart}
              isSignedIn={isSignedIn}
              hasAnyAvailability={hasAnyAvailability}
              viewerIsOwner={viewerIsOwner}
              initialDuration={selectedDuration}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
