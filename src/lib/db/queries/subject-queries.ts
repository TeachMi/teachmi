// Subject taxonomy reads for the marketplace homepage (FR17, Story 3.1).
//
// Separate from `tutor-queries.ts` because subject reads are conceptually
// orthogonal to tutor discoverability:
//   - `tutor-queries.ts` (Story 2.3 + 3.2) — the marketplace gate
//     (`discoverableTutorWhere`) + per-tutor lookups.
//   - `subject-queries.ts` (Story 3.1) — admin-configurable taxonomy reads.
//
// Story 3.6 (admin taxonomy editor, Sprint 2) will be the producer of
// `subjects` mutations; this module is the canonical reader.
//
// CACHING — Next 16.2.4 `unstable_cache` chosen over the newer `"use cache"`
// directive. Rationale:
//   - `"use cache"` requires `experimental.cacheComponents: true` in
//     `next.config.ts`, which is a wider scope change (affects how all RSC
//     and Server Actions interact with the cache lifecycle across the app).
//   - `unstable_cache` is a documented Next primitive available without
//     config changes; the `unstable_` prefix is the team's signal that the
//     API may change but it's been stable since Next 13.
//   - `revalidateTag("subjects")` invalidates `unstable_cache` entries
//     tagged `"subjects"` identically to `"use cache"` entries.
// If `cacheComponents` is enabled in a future story, refactor this module
// to use the `"use cache"` directive + `cacheTag("subjects")` + `cacheLife()`.

import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { subjects } from "../schema";
import { getDb } from "../client";

// Public column subset for marketplace surfaces. Excludes `category`,
// `displayNameEn`, and meta cols — the homepage is Hebrew-only and doesn't
// surface categorization. Story 3.6's admin editor will read additional
// columns directly via its own query (not via this helper).
export interface MarketplaceSubject {
  id: string;
  slug: string;
  displayNameHe: string;
  sortOrder: number;
}

// Frozen public-column allowlist for tests. Same pattern as Story 2.3's
// `DISCOVERABLE_TUTOR_PUBLIC_KEYS`. If a future engineer adds a private
// column (`category`, `displayNameEn`, etc.) to the SELECT, the test
// `Object.keys(result[0]).sort()` assertion fails fast.
export const MARKETPLACE_SUBJECT_PUBLIC_KEYS = Object.freeze([
  "displayNameHe",
  "id",
  "slug",
  "sortOrder",
] as const);

// Minimal Drizzle-surface type for FakeDb tests. Only the chain shape
// `.select(...).from(table).where(condition).orderBy(...)` is used. Follows
// the structural-typing convention established by Story 2.3 + 3.2.
export interface DbForSubjectQueries {
  select(cols: unknown): {
    from(table: unknown): {
      where(condition: unknown): {
        orderBy(order: unknown): Promise<unknown[]>;
      };
    };
  };
}

interface SubjectQueryDeps {
  db?: DbForSubjectQueries;
}

const PUBLIC_COLUMNS = {
  id: subjects.id,
  slug: subjects.slug,
  displayNameHe: subjects.displayNameHe,
  sortOrder: subjects.sortOrder,
} as const;

// Internal raw-query function. Wrapped below in `unstable_cache` with tag
// `"subjects"` so Story 3.6's admin mutation can invalidate cross-request via
// `revalidateTag("subjects")`.
//
// Dep-inject `db` for FakeDb testing (test path bypasses the cache wrapper
// and tests this function directly).
async function getActiveSubjectsRaw(
  deps: SubjectQueryDeps = {},
): Promise<MarketplaceSubject[]> {
  const db = deps.db ?? (getDb() as unknown as DbForSubjectQueries);
  const rows = (await db
    .select(PUBLIC_COLUMNS)
    .from(subjects)
    .where(eq(subjects.isActive, true))
    .orderBy(asc(subjects.sortOrder))) as MarketplaceSubject[];
  return rows;
}

// Cached wrapper. The cache key `["active-subjects-v1"]` is stable across
// requests. Story 3.6's admin save Server Action MUST call
// `revalidateTag("subjects")` after each mutation to invalidate this entry.
//
// No `revalidate` time set — manual-invalidation only. Without 3.6's
// `revalidateTag` call wired in, the homepage will show stale data
// indefinitely after the first request (acceptable closed-beta behavior;
// taxonomy changes are rare and admin-initiated).
const cachedGetActiveSubjects = unstable_cache(
  async () => getActiveSubjectsRaw(),
  ["active-subjects-v1"],
  { tags: ["subjects"] },
);

/**
 * Returns all marketplace-visible subjects, sorted by `sort_order ASC`
 * (the admin-configured ordering — Story 3.6 will let admins drag-and-drop
 * to reorder this). Inactive subjects (`is_active = false`) are excluded.
 *
 * **Caching:** wrapped in `unstable_cache` with tag `"subjects"`. Invalidate
 * via `revalidateTag("subjects")` from Story 3.6's admin save action.
 *
 * **Display-order note:** the marketplace homepage (Story 3.1) re-sorts
 * results in Hebrew alphabetical order via `localeCompare('he-IL')` for
 * presentation; this helper returns the admin-configured order verbatim
 * so that Story 3.4 (browse filter dropdown) can use it directly.
 */
export async function getActiveSubjects(
  deps: SubjectQueryDeps = {},
): Promise<MarketplaceSubject[]> {
  // Tests dep-inject `db` and bypass the cache wrapper — calling the raw
  // function directly so the FakeDb chain is observable.
  if (deps.db !== undefined) {
    return getActiveSubjectsRaw(deps);
  }
  return cachedGetActiveSubjects();
}
