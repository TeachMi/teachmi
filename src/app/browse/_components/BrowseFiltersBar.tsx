"use client";

// Sticky filter bar on `/browse` (Story 5.x 2026-05-19, R2 2026-05-20).
// URL-driven so every state is shareable: subject + priceBucket + days +
// times + sort + page all round-trip through `?…` params, no client-only
// state.
//
// Round-2 changes (2026-05-20):
//   - Gender filter REMOVED from the UI (column kept in DB).
//   - Total-count badge REMOVED (decision: don't lead with a count).
//   - Native `<select>` swapped for the design-system Radix `Select`,
//     which has rounded chrome consistent with Storybook.
//   - Time-of-day + day-of-week filter added via `BrowseTimePopover`.

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrowseTimePopover } from "./BrowseTimePopover";
import {
  LESSON_LENGTH_OPTIONS,
  PRICE_BUCKETS,
  SORT_OPTIONS,
} from "./browse-filters-shared";

export interface SubjectOption {
  slug: string;
  displayNameHe: string;
}

interface BrowseFiltersBarProps {
  subjects: ReadonlyArray<SubjectOption>;
}

// Radix `Select` requires a non-empty `value` for items, so we map the
// "no filter" state to a sentinel string and translate at the URL edge.
const SUBJECT_ALL = "__all__";
const PRICE_ALL = "any";
const LENGTH_ALL = "all";

export function BrowseFiltersBar({ subjects }: BrowseFiltersBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentSubject = searchParams.get("subject") ?? "";
  const currentBucket = searchParams.get("price") ?? PRICE_ALL;
  const currentLength = searchParams.get("length") ?? LENGTH_ALL;
  const currentSort = searchParams.get("sort") ?? "recent";

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete("page");
      const query = params.toString();
      startTransition(() => {
        router.push(query ? `/browse?${query}` : "/browse");
      });
    },
    [router, searchParams],
  );

  return (
    <section className="sticky top-[73px] z-20 bg-linen border-b border-linen-border shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <FilterCell label="מקצוע">
            <Select
              value={currentSubject || SUBJECT_ALL}
              onValueChange={(v) =>
                updateParam("subject", v === SUBJECT_ALL ? null : v)
              }
            >
              <SelectTrigger
                size="md"
                className="min-w-[160px] border-0 bg-transparent shadow-none focus:ring-0 focus:border-0 px-0 font-bold text-primary-container"
              >
                <SelectValue placeholder="כל המקצועות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SUBJECT_ALL}>כל המקצועות</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.displayNameHe}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCell>

          <FilterCell label="משך שיעור">
            <Select
              value={currentLength}
              onValueChange={(v) =>
                updateParam("length", v === LENGTH_ALL ? null : v)
              }
            >
              <SelectTrigger
                size="md"
                className="min-w-[120px] border-0 bg-transparent shadow-none focus:ring-0 focus:border-0 px-0 font-bold text-primary-container"
              >
                <SelectValue placeholder="הכל" />
              </SelectTrigger>
              <SelectContent>
                {LESSON_LENGTH_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.labelHe}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCell>

          <FilterCell label="טווח מחיר">
            <Select
              value={currentBucket}
              onValueChange={(v) =>
                updateParam("price", v === PRICE_ALL ? null : v)
              }
            >
              <SelectTrigger
                size="md"
                className="min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 focus:border-0 px-0 font-bold text-primary-container"
              >
                <SelectValue placeholder="כל הטווחים" />
              </SelectTrigger>
              <SelectContent>
                {PRICE_BUCKETS.map((b) => (
                  <SelectItem key={b.key} value={b.key}>
                    {b.labelHe}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCell>

          {/* Time-of-day + day-of-week — Round-2 add. Lives in its own
              cell so the trigger reads as a peer of the other filters. */}
          <div className="min-w-[160px]">
            <BrowseTimePopover />
          </div>

          {/* Sort — pushed to the trailing edge in RTL via `ms-auto`. */}
          <div className="flex items-center gap-2 ms-auto">
            <label className="text-[11px] text-secondary" htmlFor="browse-sort">
              מיין לפי
            </label>
            <Select
              value={currentSort}
              onValueChange={(v) =>
                updateParam("sort", v === "recent" ? null : v)
              }
            >
              <SelectTrigger
                id="browse-sort"
                size="md"
                className="min-w-[160px] font-bold text-primary-container"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.labelHe}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-linen-border bg-surface-lowest px-3 py-1 hover:border-primary-fixed-dim transition-colors">
      <span className="text-[11px] text-secondary">{label}</span>
      {children}
    </div>
  );
}
