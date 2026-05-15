import Link from "next/link";
import {
  HEADLINE_FOUR_DISPLAY_ORDER,
  HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE,
  HEADLINE_FOUR_ICONS,
  type HeadlineFourSlug,
} from "@/lib/marketplace/headline-subjects";
import type { MarketplaceSubject } from "@/lib/db/queries/subject-queries";

interface HeadlineFourSubjectsProps {
  subjects: MarketplaceSubject[];
}

// Marketplace homepage headline-four band. Mirrors `mocks/landing.html`
// lines 228–259. Renders the four product-committed subjects (math, English,
// hebrew-lashon, psychometric — per the product brief) as prominent cards
// in a single row on `lg:`, 2×2 on mobile. RSC; zero client JS.
//
// **Display-name fallback** (per Story 3.1 AC2): if `getActiveSubjects()`
// returns a list missing one of the four headline slugs (degenerate state —
// admin hid a headline subject via Story 3.6's editor), the card STILL renders
// using `HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE`. The headline-four is a
// product commitment, not a taxonomy choice.
export function HeadlineFourSubjects({ subjects }: HeadlineFourSubjectsProps) {
  const subjectBySlug = new Map(subjects.map((s) => [s.slug, s]));

  function resolveDisplayName(slug: HeadlineFourSlug): string {
    const row = subjectBySlug.get(slug);
    if (row) return row.displayNameHe;
    return HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE[slug];
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <h2 className="mb-8 text-start font-display text-3xl font-bold text-primary-container">
        המקצועות הפופולריים
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {HEADLINE_FOUR_DISPLAY_ORDER.map((slug) => {
          const displayName = resolveDisplayName(slug);
          const iconName = HEADLINE_FOUR_ICONS[slug];
          return (
            <Link
              key={slug}
              href={`/browse?subject=${slug}`}
              className="group rounded-xl border border-linen-border bg-surface-lowest p-6 text-start transition-all hover:border-primary-fixed-dim hover:shadow-lg"
            >
              {/* Icon sits at the start of the flex row — `justify-start` in
                  RTL = right side of the card. Matches the mock where the
                  icon hugs the leading edge above the subject name. */}
              <div className="mb-3 flex items-center justify-start">
                <span className="material-symbols-outlined text-3xl text-primary-container transition-colors group-hover:text-tertiary-accent">
                  {iconName}
                </span>
              </div>
              <h3 className="font-display text-xl font-bold text-primary-container">
                {displayName}
              </h3>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
