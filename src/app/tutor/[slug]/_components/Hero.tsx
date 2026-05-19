// Public tutor-profile hero (Story 2.11, 2026-05-18 rewrite).
//
// Layout follows `TeachMe/mocks/tutor-v2.html` lines 68–194:
//   1. Video player (full-width mobile, w-3/4 on lg+).
//   2. Identity row: SQUARE rounded-xl photo + name + tagline sub-row + verified badge.
//   3. Short-bio paragraph (max-w-2xl).
//   4. Highlights chip section ("נקודות חוזק") — only when `highlights` has items.
//   5. Recommendation card — only when `recommendationVisible` AND both texts present.
//   6. "אודות" long-bio section with double-newline paragraph splitting.
//
// REMOVED fields vs prior shape: `bio`, `city`, headline-from-subject fallback,
// online-indicator dot. Tagline now comes straight from `tutor.tagline`.
//
// RTL FLEX NOTE: every inner row uses default `flex` (NOT `flex-row-reverse`).
// In RTL writing mode, flex-row already flows right-to-left, so the first DOM
// child lands on the RIGHT (leading) edge. Adding `flex-row-reverse` flips
// back to left-to-right — undoing the RTL flow. Avoid it unless you
// intentionally want LTR-within-RTL (rare). Per AR-21 logical-properties guidance.

import { Badge } from "@/components/ui/badge";
import { verifiedTutorLabel } from "@/app/tutor/onboarding/profile/profile-form-schema";
import { getHighlight, isHighlightSlug } from "@/lib/highlights";
import type {
  DiscoverableTutorPublic,
  TutorSubjectPublic,
} from "@/lib/db/queries/tutor-queries";
import { IntroVideoPlayer } from "./IntroVideoPlayer";

interface HeroProps {
  tutor: DiscoverableTutorPublic;
  subjects: TutorSubjectPublic[];
  /** Server-rendered presigned-GET URL for the intro video (may be null). */
  introVideoUrl: string | null;
  /** Server-rendered presigned-GET URL for the profile photo (may be null). */
  profilePhotoUrl: string | null;
}

export function Hero({
  tutor,
  subjects,
  introVideoUrl,
  profilePhotoUrl,
}: HeroProps) {
  // Tagline shown directly under the display name. MVP1 onboarding form
  // always sets a tagline, so the fallback to the first subject's Hebrew
  // name is defensive for legacy rows / partially-migrated data only.
  const firstSubject = subjects[0];
  const taglineText =
    tutor.tagline && tutor.tagline.trim().length > 0
      ? tutor.tagline
      : firstSubject
        ? `מורה ל${firstSubject.displayNameHe}`
        : null;

  // Short bio renders as a single paragraph block. Page-level
  // `stripBidiOverrides` has already cleaned the text before it reaches us.
  const shortBioText =
    tutor.shortBio && tutor.shortBio.trim().length > 0 ? tutor.shortBio : null;

  // Long bio is multi-paragraph; split on double newlines (or single \n) to
  // keep the existing pattern from the prior Hero implementation.
  const longBioParagraphs =
    tutor.longBio && tutor.longBio.trim().length > 0
      ? tutor.longBio
          .split(/\n\n+|\n/)
          .map((para) => para.trim())
          .filter((para) => para.length > 0)
      : [];

  // Filter highlight slugs through the taxonomy so a stale / tampered slug
  // doesn't throw at render time.
  const highlightDefs = (tutor.highlights ?? [])
    .filter(isHighlightSlug)
    .map((slug) => getHighlight(slug));

  const showRecommendation =
    tutor.recommendationVisible &&
    !!tutor.recommendationHeadline &&
    tutor.recommendationHeadline.trim().length > 0 &&
    !!tutor.recommendationSub &&
    tutor.recommendationSub.trim().length > 0;

  return (
    <section aria-label="פרופיל המורה" className="text-start">
      {/* Video player — full-width on phone, 3/4 width on lg+ per founder
          guidance. Don't replace `w-3/4` outright on mobile; that's the
          regression Sally called out. */}
      {introVideoUrl && (
        <div className="w-full lg:w-3/4 mb-6">
          <IntroVideoPlayer
            src={introVideoUrl}
            poster={profilePhotoUrl ?? undefined}
            tutorName={tutor.displayName}
          />
        </div>
      )}

      {/* Identity row: square photo + name + tagline sub-row + verified badge. */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative shrink-0">
          {profilePhotoUrl ? (
            // Plain <img> here, not <Image> — the presigned R2 URLs rotate
            // hourly and aren't on Next's remotePatterns. Square (rounded-xl)
            // for the public profile per Sally's call; SiteHeader's circular
            // avatar is intentionally different.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profilePhotoUrl}
              alt={tutor.displayName}
              width={96}
              height={96}
              className="w-24 h-24 rounded-xl object-cover shadow-sm ring-2 ring-white"
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-24 h-24 rounded-xl bg-primary-fixed/40 text-primary-container shadow-sm ring-2 ring-white flex items-center justify-center font-display font-extrabold text-3xl"
            >
              {tutor.displayName.trim().charAt(0)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-extrabold text-3xl text-on-surface mb-1">
            {tutor.displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            {taglineText && <span>{taglineText}</span>}
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
        </div>
      </div>

      {/* Short bio (1–2 sentences). */}
      {shortBioText && (
        <p className="text-on-surface-variant leading-relaxed mb-6 max-w-2xl">
          {shortBioText}
        </p>
      )}

      {/* Highlights — נקודות חוזק */}
      {highlightDefs.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="material-symbols-outlined text-tertiary-accent text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              auto_awesome
            </span>
            <h2 className="font-display font-bold text-lg text-on-surface">
              נקודות חוזק
            </h2>
          </div>
          <p className="text-xs text-secondary mb-3">
            מבוסס על נתוני המורה וביקורות תלמידים אמיתיים
          </p>
          <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
            {highlightDefs.map((def) => (
              <li
                key={def.slug}
                className="bg-primary-fixed/40 text-primary-container text-sm px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5"
              >
                <span
                  className="material-symbols-outlined text-base"
                  aria-hidden="true"
                >
                  {def.icon}
                </span>
                {def.labelHe}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendation card — "מומלצת במיוחד ל…".
          The decorative 📈 emoji from `mocks/tutor-v2.html` line 155 was
          dropped per founder direction 2026-05-19 — the headline alone
          carries the visual weight, and the emoji rendered as a missing-
          glyph placeholder in some browser/font combos. */}
      {showRecommendation && (
        <div className="bg-linen border border-linen-border rounded-xl p-4 mb-8 text-start">
          <h3 className="font-display font-bold text-base text-on-surface">
            {tutor.recommendationHeadline}
          </h3>
          <p className="text-xs text-secondary mt-1">
            {tutor.recommendationSub}
          </p>
        </div>
      )}

      {/* About / אודות */}
      {longBioParagraphs.length > 0 && (
        <section className="border-t border-linen-border pt-6 mb-8">
          <h2 className="font-display font-bold text-xl text-on-surface mb-3">
            אודות
          </h2>
          <div className="space-y-3">
            {longBioParagraphs.map((para, idx) => (
              <p
                key={idx}
                className="text-on-surface-variant leading-relaxed"
              >
                {para}
              </p>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
