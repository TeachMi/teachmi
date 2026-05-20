// Recent reviews on the public tutor profile (Story 5.x 2026-05-19).
// Renders BELOW `RatingWidget` (which shows the aggregate histogram) to
// match `mocks/tutor-v2.html` lines 170-191. RSC, no client interactivity.
//
// Empty state: callers check upstream and don't mount this component when
// `reviews.length === 0` — keeps the conditional render close to where
// the page knows the totals.
//
// Reviewer display is initial-only. Full name is PII and the closed-beta
// design (per Sally) shows "ל. · אפריל 2026" style.

import type { PublicReviewRow } from "@/lib/db/queries/tutor-queries";

interface ReviewsListProps {
  reviews: ReadonlyArray<PublicReviewRow>;
  /** Total review count — drives the "כל N הביקורות ←" link in the header. */
  totalCount: number;
}

const HEBREW_MONTH_FORMATTER = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
});

function formatHebrewMonth(date: Date): string {
  return HEBREW_MONTH_FORMATTER.format(date);
}

export function ReviewsList({ reviews, totalCount }: ReviewsListProps) {
  if (reviews.length === 0) return null;

  return (
    <section
      aria-labelledby="reviews-list-heading"
      className="mb-12 border-t border-linen-border pt-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          id="reviews-list-heading"
          className="font-display font-bold text-xl text-on-surface"
        >
          ביקורות תלמידים
        </h2>
        {totalCount > reviews.length && (
          // Forward-looking total — the "see all N" CTA is intentionally
          // text-only (no link) until a paginated reviews route exists.
          // Shipping a dead `href="#reviews"` was visible to keyboard
          // users / SR; better to suppress until destination lands.
          <span className="text-sm text-secondary">
            מציג {reviews.length} מתוך {totalCount.toLocaleString("he-IL")}
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {reviews.map((r) => (
          <article
            key={r.id}
            className="bg-white rounded-xl border border-linen-border p-4 text-start"
          >
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              <span
                className="material-symbols-outlined text-tertiary-accent text-base"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                star
              </span>
              <span className="font-bold text-sm">{r.score}</span>
              <span className="text-xs text-secondary ms-2">
                {r.reviewerInitial}. · {formatHebrewMonth(r.createdAt)}
              </span>
            </div>
            {r.comment ? (
              <p className="text-sm text-on-surface-variant leading-relaxed">
                &ldquo;{r.comment}&rdquo;
              </p>
            ) : (
              <p className="text-sm text-secondary italic">דירוג ללא טקסט</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
