import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { auth } from "@/lib/auth/auth";
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

// Plain TS validation (no zod) — matches the codebase convention established
// by `profile-form-schema.ts` and `lib/auth/registration.ts`.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
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

const resolveAvailability = cache(
  async (
    userId: string,
    from: Date,
    to: Date,
  ): Promise<TutorAvailabilityRow[]> => {
    try {
      return await getTutorAvailabilityRows(userId, { from, to });
    } catch (err) {
      console.error("[tutor/[slug]/page] availability lookup failed", err);
      return [];
    }
  },
);

const resolveBookings = cache(
  async (
    userId: string,
    from: Date,
    to: Date,
  ): Promise<ActiveBookingRow[]> => {
    try {
      return await getActiveBookingsForTutor(userId, { from, to });
    } catch (err) {
      console.error("[tutor/[slug]/page] bookings lookup failed", err);
      return [];
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tutor = await resolveDiscoverableTutor(slug);
  if (!tutor) {
    return { title: "TeachMe" };
  }

  const description = tutor.bio
    ? truncateForDescription(tutor.bio)
    : `${tutor.displayName} — מורה ב-TeachMe`;
  const photoUrl =
    (await presignFromR2("tutor-profile-photos", tutor.profilePhotoR2Key)) ??
    "/og-default-tutor.svg";

  return {
    title: `${tutor.displayName} · TeachMe`,
    description,
    robots: { index: true, follow: true },
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
  const [session, subjects, availability, bookings, rating, introVideoUrl, profilePhotoUrl] =
    await Promise.all([
      auth(),
      resolveTutorSubjects(tutor.userId),
      resolveAvailability(tutor.userId, weekStart, weekEnd),
      resolveBookings(tutor.userId, weekStart, weekEnd),
      resolveRatingHistogram(tutor.userId),
      presignFromR2("tutor-intro-videos", tutor.introVideoR2Key),
      presignFromR2("tutor-profile-photos", tutor.profilePhotoR2Key),
    ]);

  const slotStates = computeSlotStates({
    availability,
    bookings,
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
                אודות {tutor.displayName.split(" ")[0]}
              </h2>
              {tutor.bio
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
