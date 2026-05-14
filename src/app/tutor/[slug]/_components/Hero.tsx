// Hero region for the public tutor profile page (Story 3.2).
// Two-column on lg breakpoint (info right of video in RTL); single-column on
// mobile. RSC — zero client JS. The IntroVideoPlayer is the only client
// component inside this hero region (handles play-state overlay swap).

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { DiscoverableTutorPublic } from "@/lib/db/queries/tutor-queries";
import type { TutorSubjectPublic } from "@/lib/db/queries/tutor-queries";
import type { RatingHistogram } from "@/lib/db/queries/tutor-queries";
import { IntroVideoPlayer } from "./IntroVideoPlayer";
import { PriceBlock } from "./PriceBlock";

interface HeroProps {
  tutor: DiscoverableTutorPublic;
  subjects: TutorSubjectPublic[];
  rating: RatingHistogram | null;
  /** Server-rendered presigned-GET URL for the intro video (may be null). */
  introVideoUrl: string | null;
  /** Server-rendered presigned-GET URL for the profile photo (may be null). */
  profilePhotoUrl: string | null;
}

export function Hero({
  tutor,
  subjects,
  rating,
  introVideoUrl,
  profilePhotoUrl,
}: HeroProps) {
  // Headline: first subject's displayNameHe + proficiencyNote (e.g.,
  // "מתמטיקה — 5 יחידות"), fallback to city or generic label.
  const firstSubject = subjects[0];
  const headline = firstSubject
    ? firstSubject.proficiencyNote
      ? `${firstSubject.displayNameHe} — ${firstSubject.proficiencyNote}`
      : firstSubject.displayNameHe
    : (tutor.city ?? "מורה ב-TeachMe");

  return (
    <section
      aria-label="פרופיל המורה"
      className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10"
    >
      {/* Info column — rightmost in RTL via DOM order */}
      <div className="lg:col-span-3 text-start">
        <div className="flex flex-row-reverse items-start gap-5 mb-5">
          <Avatar
            src={profilePhotoUrl ?? undefined}
            name={tutor.displayName}
            size="xl"
            className="border-4 border-white shadow-md"
          />
          <div className="flex-1">
            <div className="flex flex-row-reverse items-center gap-2 mb-1">
              <h1 className="font-display font-extrabold text-3xl text-primary-container">
                {tutor.displayName}
              </h1>
              {tutor.vettingStatus === "approved" && (
                <Badge variant="approved" size="md" className="rounded-full">
                  <span
                    className="material-symbols-outlined text-sm"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                    aria-hidden="true"
                  >
                    verified
                  </span>
                  מורה מאומתת
                </Badge>
              )}
            </div>
            <p className="text-on-surface-variant mb-3">{headline}</p>

            {(rating !== null || tutor.totalLessonsCompleted > 0) && (
              <div className="flex flex-row-reverse flex-wrap items-center gap-4 text-sm">
                {rating !== null && (
                  <span className="flex flex-row-reverse items-center gap-1">
                    <span
                      className="material-symbols-outlined text-tertiary-accent text-base"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                      aria-hidden="true"
                    >
                      star
                    </span>
                    <span className="font-bold">{rating.average.toFixed(1)}</span>
                    <span className="text-secondary">
                      ({rating.total} ביקורות)
                    </span>
                  </span>
                )}
                {tutor.totalLessonsCompleted > 0 && (
                  <>
                    {rating !== null && <span className="text-secondary">·</span>}
                    <span className="text-secondary flex flex-row-reverse items-center gap-1">
                      <span
                        className="material-symbols-outlined text-base"
                        aria-hidden="true"
                      >
                        school
                      </span>
                      {tutor.totalLessonsCompleted.toLocaleString("he-IL")}{" "}
                      שיעורים
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Two-price summary — delegated to the standalone PriceBlock
            component so the same JSX powers the hero, future browse cards,
            and Storybook's "Composition — tutor price block" story. */}
        <div className="mb-5">
          <PriceBlock
            hourlyPriceIls={tutor.hourlyPriceIls}
            lesson45PriceIls={tutor.lesson45PriceIls}
          />
        </div>
      </div>

      {/* Video column */}
      {introVideoUrl && (
        <div className="lg:col-span-2">
          <IntroVideoPlayer
            src={introVideoUrl}
            poster={profilePhotoUrl ?? undefined}
            tutorName={tutor.displayName}
          />
        </div>
      )}
    </section>
  );
}
