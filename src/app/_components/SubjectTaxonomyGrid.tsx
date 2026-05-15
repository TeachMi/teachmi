import Link from "next/link";
import type { MarketplaceSubject } from "@/lib/db/queries/subject-queries";

interface SubjectTaxonomyGridProps {
  subjects: MarketplaceSubject[];
}

// Material Symbols Outlined icon mapping for the 11 launch subjects. Mock-
// derived per `mocks/landing.html` lines 271–315. Decorative — the `<h3>`
// text label is the semantic anchor; missing/unknown icon renders an empty
// span (acceptable visual degradation).
const SUBJECT_ICONS: Record<string, string> = {
  mathematics: "calculate",
  english: "language",
  "hebrew-lashon": "edit_note",
  psychometric: "psychology",
  physics: "science",
  chemistry: "experiment",
  biology: "biotech",
  "computer-science": "terminal",
  statistics: "equalizer",
  accounting: "account_balance",
  economics: "trending_up",
};

// Marketplace homepage full-taxonomy band. Mirrors `mocks/landing.html`
// lines 263–322. Omitted from mock:
//   - Tutor-count chips ("340 מורים") — aspirational numbers; defer to a
//     follow-up when closed-beta has real counts.
//   - "צפו בהכל" CTA card at the end of the mock's grid — the taxonomy IS
//     the full list; no separate /all-subjects page.
//
// Sorts client-side via `localeCompare('he-IL')` on `displayNameHe` for
// Hebrew alphabetical (אבגד…) presentation order. The query layer returns
// subjects in admin-configured `sort_order` (used elsewhere — e.g., Story
// 3.4's browse filter dropdown); the homepage re-sorts for predictability.
//
// RSC; zero client JS.
export function SubjectTaxonomyGrid({ subjects }: SubjectTaxonomyGridProps) {
  if (subjects.length === 0) {
    return (
      <section className="border-y border-linen-border bg-linen py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-8 text-end font-display text-2xl font-bold text-primary-container">
            כל המקצועות
          </h2>
          <p className="text-end text-on-surface-variant">
            המקצועות מתעדכנים, חזרו בקרוב.
          </p>
        </div>
      </section>
    );
  }

  const sorted = [...subjects].sort((a, b) =>
    a.displayNameHe.localeCompare(b.displayNameHe, "he-IL"),
  );

  return (
    <section className="border-y border-linen-border bg-linen py-16">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="mb-8 text-start font-display text-2xl font-bold text-primary-container">
          כל המקצועות
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {sorted.map((subject) => {
            const iconName = SUBJECT_ICONS[subject.slug] ?? "";
            return (
              <Link
                key={subject.id}
                href={`/browse?subject=${subject.slug}`}
                className="flex items-center justify-between rounded-lg border border-linen-border bg-surface-lowest p-4 transition-colors hover:border-primary-fixed-dim"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-on-surface">
                    {subject.displayNameHe}
                  </span>
                  {iconName ? (
                    <span className="material-symbols-outlined text-lg text-primary-container">
                      {iconName}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
