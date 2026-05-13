// Rating histogram widget for the public tutor profile (Story 3.2). RSC.
// Renders only when histogram !== null (i.e., at least one rating exists);
// caller is responsible for the null check. See AC7 rationale: at MVP-1
// closed-beta every tutor has rating_count=0 until Story 5.5 ships ratings.

import type { RatingHistogram } from "@/lib/db/queries/tutor-queries";

interface RatingWidgetProps {
  histogram: RatingHistogram;
}

function bucketCount(h: RatingHistogram, score: 1 | 2 | 3 | 4 | 5): number {
  return h[`score${score}`];
}

export function RatingWidget({ histogram }: RatingWidgetProps) {
  const scores: Array<5 | 4 | 3 | 2 | 1> = [5, 4, 3, 2, 1];

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="bg-white rounded-xl border border-linen-border p-6 text-start"
    >
      <h2
        id="reviews-heading"
        className="font-display font-bold text-lg text-primary-container mb-4"
      >
        דירוג ממוצע
      </h2>
      <div className="flex flex-row-reverse items-baseline gap-2 mb-3">
        <span className="font-display font-extrabold text-4xl text-primary-container">
          {histogram.average.toFixed(1)}
        </span>
        <div className="flex" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="material-symbols-outlined text-tertiary-accent"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-secondary mb-4">
        מתוך {histogram.total} ביקורות
      </p>
      <div className="space-y-1 text-xs">
        {scores.map((s) => {
          const count = bucketCount(histogram, s);
          const pct =
            histogram.total > 0 ? Math.round((count / histogram.total) * 100) : 0;
          return (
            <div
              key={s}
              className="flex flex-row-reverse items-center gap-2"
              aria-label={`${count} ביקורות עם דירוג ${s} כוכבים`}
            >
              <span className="w-6">{s}★</span>
              <div
                className="flex-1 bg-surface-container rounded-full h-2"
                role="presentation"
              >
                <div
                  className="bg-tertiary-accent h-2 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-secondary text-end">{count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
