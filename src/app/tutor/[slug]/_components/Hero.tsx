// Hero region for the public tutor profile page (Story 3.2).
// Two-column on lg breakpoint (info right of video in RTL); single-column on
// mobile. RSC — zero client JS. The IntroVideoPlayer is the only client
// component inside this hero region (handles play-state overlay swap).
//
// RTL FLEX NOTE: every inner row uses default `flex` (NOT `flex-row-reverse`).
// In RTL writing mode, flex-row already flows right-to-left, so the first DOM
// child lands on the RIGHT (leading) edge. Adding `flex-row-reverse` flips
// back to left-to-right — undoing the RTL flow. Avoid it unless you
// intentionally want LTR-within-RTL (rare). Per AR-21 logical-properties guidance.

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { verifiedTutorLabel } from "@/app/tutor/onboarding/profile/profile-form-schema";
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

  // Bio: split on paragraph breaks for nice line-spacing inside the hero.
  // Same `stripBidiOverrides`-style cleanup as the page's old About section
  // isn't applied here — the page's render still calls `stripBidiOverrides`
  // on `tutor.bio` before the Hero would consume it via props. For the Hero,
  // we render the bio raw and rely on React's HTML escaping; the bidi
  // override stripping is a page-level concern.
  const bioParagraphs =
    tutor.bio && tutor.bio.trim().length > 0
      ? tutor.bio
          .split(/\n\n+|\n/)
          .map((para) => para.trim())
          .filter((para) => para.length > 0)
      : [];

  return (
    <section
      aria-label="פרופיל המורה"
      className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10 items-start"
    >
      {/* Info column — rightmost in RTL via DOM order */}
      <div className="lg:col-span-3 text-start">
        <div className="flex items-start gap-5 mb-5">
          <Avatar
            src={profilePhotoUrl ?? undefined}
            name={tutor.displayName}
            size="xl"
            className="border-4 border-white shadow-md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-display font-extrabold text-3xl text-primary-container">
                {tutor.displayName}
              </h1>
              <Badge variant="approved" size="md" className="rounded-full">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  verified
                </span>
                {verifiedTutorLabel(tutor.gender)}
              </Badge>
            </div>
            <p className="text-on-surface-variant mb-3">{headline}</p>

            {(rating !== null || tutor.totalLessonsCompleted > 0) && (
              <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
                {rating !== null && (
                  <span className="flex items-center gap-1">
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
                    <span className="text-secondary flex items-center gap-1">
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

        {/* Bio — moved inside the Hero right column 2026-05-16 so the about
            sits immediately under the name and headline, paired visually
            with the video on the left rather than as a separate
            full-width section below. */}
        {bioParagraphs.length > 0 && (
          <div className="mb-5 space-y-3 text-on-surface leading-relaxed">
            {bioParagraphs.map((para, idx) => (
              <p key={idx}>{para}</p>
            ))}
          </div>
        )}

        {/* Two-price summary — delegated to the standalone PriceBlock
            component so the same JSX powers the hero, future browse cards,
            and Storybook's "Composition — tutor price block" story. */}
        <div className="mb-5">
          <PriceBlock
            hourlyPriceIls={tutor.hourlyPriceIls}
            lesson45PriceIls={tutor.lesson45PriceIls}
            lesson75PriceIls={tutor.lesson75PriceIls}
            lesson90PriceIls={tutor.lesson90PriceIls}
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
