import Link from "next/link";
import type { MarketplaceSubject } from "@/lib/db/queries/subject-queries";
import { HEADLINE_FOUR_DISPLAY_ORDER } from "@/lib/marketplace/headline-subjects";

// Marketplace homepage subject band. Replaces Story 3.1's two-tier layout
// (a 4-card headline band + a separate full 11-subject taxonomy grid) with
// the single consolidated grid from `landing-v2.html` (founder direction
// 2026-05-20: the old 11-subject grid carried no dependency worth keeping).
//
// Shows up to `MAX_CARDS` subjects — the four headline subjects first, then
// the admin-sorted remainder — with a "לכל המקצועות" link to `/browse` for
// the rest. RSC; zero client JS.

// Material Symbols Outlined icon per launch subject. Decorative — the `<h3>`
// label is the semantic anchor; an unknown slug falls back to `school`.
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

const MAX_CARDS = 8;

interface SubjectGridProps {
  subjects: MarketplaceSubject[];
}

export function SubjectGrid({ subjects }: SubjectGridProps) {
  if (subjects.length === 0) {
    // Degenerate state — `getActiveSubjects()` returned empty (missing
    // DATABASE_URL / Neon outage). Mirrors the old taxonomy band's
    // empty-state copy so a DB blip degrades gracefully instead of 500-ing.
    return (
      <section className="border-y border-linen-border bg-linen">
        <div className="mx-auto max-w-7xl px-6 py-12 text-start">
          <h2 className="mb-2 font-display text-2xl font-extrabold text-primary-container">
            המקצועות הפופולריים
          </h2>
          <p className="text-on-surface-variant">
            המקצועות מתעדכנים, חזרו בקרוב.
          </p>
        </div>
      </section>
    );
  }

  // Lead with the four headline subjects in their committed display order,
  // then fill from the admin-sorted taxonomy (the incoming list is already
  // ordered by `sort_order`). Cap at MAX_CARDS — the rest are one click
  // away on `/browse`.
  const headlineRank = new Map<string, number>(
    HEADLINE_FOUR_DISPLAY_ORDER.map((slug, index) => [slug, index]),
  );
  const ordered = [...subjects].sort((a, b) => {
    const aRank = headlineRank.get(a.slug);
    const bRank = headlineRank.get(b.slug);
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;
    return 0;
  });
  const shown = ordered.slice(0, MAX_CARDS);

  return (
    <section className="border-y border-linen-border bg-linen">
      <div className="mx-auto max-w-7xl px-6 py-12 text-start">
        <h2 className="mb-6 font-display text-2xl font-extrabold text-primary-container">
          המקצועות הפופולריים
        </h2>

        {/* Phone (base) shows a compact 3-up grid of small icon tiles
            (founder direction 2026-05-21); `sm:` and up keep the original
            larger cards unchanged. */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
          {shown.map((subject) => {
            const icon = SUBJECT_ICONS[subject.slug] ?? "school";
            return (
              <Link
                key={subject.id}
                href={`/browse?subject=${subject.slug}`}
                className="group rounded-xl border border-linen-border bg-surface-lowest p-3 text-center transition-all hover:border-primary-fixed-dim hover:shadow-lg sm:rounded-2xl sm:p-5 sm:text-start"
              >
                <span className="material-symbols-outlined mx-auto mb-1 block text-2xl text-primary-container transition-colors group-hover:text-tertiary-accent sm:mx-0 sm:mb-2 sm:text-3xl">
                  {icon}
                </span>
                <h3 className="font-display text-xs font-bold leading-tight text-on-surface sm:text-lg">
                  {subject.displayNameHe}
                </h3>
              </Link>
            );
          })}
        </div>

        <div className="mt-5">
          <Link
            href="/browse"
            className="inline-flex items-center gap-1 text-sm font-bold text-primary-container hover:underline"
          >
            לכל המקצועות
            <span
              className="material-symbols-outlined text-base"
              aria-hidden="true"
            >
              arrow_back
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
