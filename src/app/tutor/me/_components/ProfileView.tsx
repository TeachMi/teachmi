// Read-only display of the tutor's profile, shown by default on /tutor/me.
// Story 2.11 (2026-05-18): rebuilt to mirror the Story 2.11 field set —
// tagline / shortBio / longBio / highlights / recommendation card — and to
// match the editor's visual language (square photo, ring-2). Dropped `bio`
// and `city` per the schema change.
//
// RTL-safe: uses plain `flex justify-start`, `text-start`. No
// `flex-row-reverse` / `text-end` anywhere.

import { getHighlight, isHighlightSlug } from "@/lib/highlights";

interface ProfileViewProps {
  displayName: string;
  tagline: string;
  shortBio: string;
  longBio: string;
  highlights: string[];
  recommendationVisible: boolean;
  recommendationHeadline: string;
  recommendationSub: string;
  subjectsHe: string[];
  /** Per-length pricing. `null` per length = "not offered." */
  prices: Record<45 | 60 | 75 | 90, number | null>;
  photoUrl: string | null;
  introVideoUrl: string | null;
  onEdit: () => void;
}

export function ProfileView({
  displayName,
  tagline,
  shortBio,
  longBio,
  highlights,
  recommendationVisible,
  recommendationHeadline,
  recommendationSub,
  subjectsHe,
  prices,
  photoUrl,
  introVideoUrl,
  onEdit,
}: ProfileViewProps) {
  const offeredLengths = ([45, 60, 75, 90] as const).filter(
    (len) => typeof prices[len] === "number",
  );
  const validHighlights = highlights.filter(isHighlightSlug);

  return (
    <div className="space-y-5">
      {/* Identity card — photo + name + tagline + short bio */}
      <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-bold text-primary-container">
            הפרופיל שלך
          </h2>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary"
          >
            <span className="material-symbols-outlined text-base">edit</span>
            ערוך פרופיל
          </button>
        </div>

        <div className="flex items-start gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-linen-border bg-surface-container shadow-sm ring-2 ring-white">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                ללא תמונה
              </div>
            )}
          </div>
          <div className="flex-1">
            <h3 className="mb-1 font-display text-2xl font-extrabold text-primary-container">
              {displayName}
            </h3>
            {tagline && (
              <p className="mb-3 text-sm text-on-surface-variant">{tagline}</p>
            )}
            {shortBio && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface">
                {shortBio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recommendation card — only shown when toggled visible */}
      {recommendationVisible && recommendationHeadline && (
        <div className="rounded-xl border-2 border-primary-fixed-dim bg-primary-fixed/30 p-6 text-start">
          <div className="mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container" aria-hidden="true">
              trending_up
            </span>
            <h3 className="font-display text-lg font-bold text-primary-container">
              {recommendationHeadline}
            </h3>
          </div>
          {recommendationSub && (
            <p className="text-sm text-on-surface">{recommendationSub}</p>
          )}
        </div>
      )}

      {/* Highlights */}
      {validHighlights.length > 0 && (
        <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
            <span className="material-symbols-outlined" aria-hidden="true">
              auto_awesome
            </span>
            נקודות חוזק
          </h3>
          <div className="flex flex-wrap gap-2">
            {validHighlights.map((slug) => {
              const def = getHighlight(slug);
              return (
                <span
                  key={def.slug}
                  className="flex items-center gap-1.5 rounded-lg border border-primary-fixed-dim bg-primary-fixed/40 px-3 py-1.5 text-sm font-bold text-primary-container"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    {def.icon}
                  </span>
                  {def.labelHe}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* About (longBio) */}
      {longBio && (
        <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
            <span className="material-symbols-outlined" aria-hidden="true">
              article
            </span>
            אודות
          </h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface">
            {longBio}
          </p>
        </div>
      )}

      {/* Subjects */}
      <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
        <h3 className="mb-3 font-display text-lg font-bold text-primary-container">
          מקצועות שאתם מלמדים
        </h3>
        {subjectsHe.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {subjectsHe.map((subj) => (
              <span
                key={subj}
                className="rounded-full border border-primary-container bg-primary-container px-4 py-2 text-sm font-bold text-on-primary"
              >
                {subj}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-secondary">לא נבחרו מקצועות עדיין.</p>
        )}
      </div>

      {/* Pricing — only offered lengths are shown */}
      <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
        <h3 className="mb-3 font-display text-lg font-bold text-primary-container">
          תמחור
        </h3>
        {offeredLengths.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {offeredLengths.map((len) => (
              <div
                key={len}
                className="rounded-lg border border-linen-border bg-linen p-4"
              >
                <div className="text-xs text-secondary">שיעור {len} דק׳</div>
                <div className="font-display text-2xl font-bold text-primary-container">
                  ₪{prices[len]}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-secondary">לא הוגדרו מחירים עדיין.</p>
        )}
      </div>

      {/* Intro video */}
      <div className="rounded-xl border border-linen-border bg-white p-6 text-start">
        <h3 className="mb-3 font-display text-lg font-bold text-primary-container">
          סרטון היכרות
        </h3>
        {introVideoUrl ? (
          <video
            controls
            src={introVideoUrl}
            className="w-full rounded-lg border border-linen-border bg-black"
          />
        ) : (
          <p className="text-sm text-secondary">לא הועלה סרטון עדיין.</p>
        )}
      </div>
    </div>
  );
}
