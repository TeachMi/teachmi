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
  type RatingHistogram,
  type TutorAvailabilityRow,
  type TutorSubjectPublic,
  type ActiveBookingRow,
  getActiveBookingsForTutor,
  getDiscoverableTutorByUserId,
  getTutorAvailabilityRows,
  getTutorRatingHistogram,
  getTutorSubjects,
} from "@/lib/db/queries/tutor-queries";
import { getFilesProvider } from "@/lib/providers/files";
import { AvailabilityCalendar } from "./_components/AvailabilityCalendar";
import { Hero } from "./_components/Hero";
import { RatingWidget } from "./_components/RatingWidget";
import { SubjectChips } from "./_components/SubjectChips";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ duration?: string }>;
}

const PRESIGNED_URL_TTL_SEC = 3600; // 1 hour
const CALENDAR_DAYS_AHEAD = 7;

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

function parseDuration(raw: string | undefined): 45 | 60 {
  return raw === "45" ? 45 : 60;
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

  const description = tutor.bio
    ? stripBidiOverrides(truncateForDescription(tutor.bio))
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
  const [session, subjects, calendarData, rating, introVideoUrl, profilePhotoUrl] =
    await Promise.all([
      safeAuth(),
      resolveTutorSubjects(tutor.userId),
      resolveCalendarData(tutor.userId, weekStart, weekEnd),
      resolveRatingHistogram(tutor.userId),
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

  return (
    <AppShell mainClassName="flex-1 bg-linen">
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <Hero
          tutor={tutor}
          subjects={subjects}
          rating={rating}
          introVideoUrl={introVideoUrl}
          profilePhotoUrl={profilePhotoUrl}
        />

        <AvailabilityCalendar
          tutorUserId={tutor.userId}
          slotStates={slotStates}
          hourlyPriceIls={tutor.hourlyPriceIls}
          lesson45PriceIls={tutor.lesson45PriceIls}
          selectedDuration={selectedDuration}
          isSignedIn={isSignedIn}
          weekStartUtc={weekStart}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {tutor.bio && tutor.bio.trim().length > 0 && (
            <section
              id="about"
              aria-labelledby="about-heading"
              className="lg:col-span-2 bg-white rounded-xl border border-linen-border p-6 text-start"
            >
              <h2
                id="about-heading"
                className="font-display font-bold text-xl text-primary-container mb-4"
              >
                {tutor.displayName.includes(" ")
                  ? `אודות ${tutor.displayName.split(" ")[0]}`
                  : "אודות המורה"}
              </h2>
              {stripBidiOverrides(tutor.bio)
                .split(/\n\n+|\n/)
                .map((para) => para.trim())
                .filter((para) => para.length > 0)
                .map((para, idx) => (
                  <p
                    key={idx}
                    className="text-on-surface-variant leading-relaxed mb-4 last:mb-0"
                  >
                    {para}
                  </p>
                ))}
            </section>
          )}

          {rating !== null && <RatingWidget histogram={rating} />}
        </div>

        <SubjectChips subjects={subjects} withSectionHeader />
      </div>
    </AppShell>
  );
}
