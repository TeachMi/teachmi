// Marketplace browse query (Story 5.x 2026-05-19). Drives `/browse` —
// filterable + sortable + paginated list of discoverable tutors.
//
// Architecture decisions (party-mode 2026-05-19):
//   - Default sort = `created_at DESC` (recency). "Relevance" with N=20
//     tutors is theater; "rating" makes the page look hollow until aggregates
//     fill in. Recency surfaces new partner tutors first, which is the
//     correct dynamic for closed beta.
//   - Price filter operates on `hourly_price_ils` only — the 60-min canonical
//     price. Tutors who set ONLY a 45/75/90 price (rare in practice) sort
//     by the same column with NULLs last. Don't try to coalesce across
//     lengths at query time — that's a UI display concern, not a filter
//     concern.
//   - No JOIN against `tutor_availability` at query time. "Next available
//     slot" / "available now" are derived per-card lazily in the UI if at
//     all — the JOIN explosion at scale is the trap Winston flagged.
//   - Gender filter shipped from day one. Per Winston: real Israeli-market
//     requirement (religious / cultural matching for tutoring is normal),
//     column already exists, partial index covers it.
//
// Composability: built on top of `discoverableTutorWhere()` from
// `tutor-queries.ts` so any future "is_paused" / "is_deleted" gate moves
// in one place.

import { and, asc, desc, eq, gt, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { subjects, tutorAvailability, tutorProfiles, tutorSubjects, users } from "../schema";
import { getDb } from "../client";
import { discoverableTutorWhere } from "./tutor-queries";

export type BrowseSort = "recent" | "rating" | "price_asc" | "price_desc";

/**
 * Half-open time range, `"HH:MM:SS"` strings matching the
 * `tutor_availability.start_time` / `end_time` columns. Buckets cross
 * midnight only when the user picks the late-night option, but the table
 * stores times as wall clock so we never wrap — the smallest bucket is
 * `00:00-03:00` and rules covering those hours are stored verbatim.
 */
export interface TimeRangeFilter {
  /** Inclusive lower bound. */
  startTime: string;
  /** Exclusive upper bound. */
  endTime: string;
}

export interface BrowseSearchInput {
  subjectSlug?: string;
  /** Lower bound (inclusive) on `hourly_price_ils`. */
  priceMin?: number;
  /** Upper bound (inclusive) on `hourly_price_ils`. */
  priceMax?: number;
  gender?: "male" | "female";
  /**
   * When set, only tutors who priced this lesson length appear in
   * results — i.e., the matching `lesson_*_price_ils` column is NOT
   * NULL. The card UI then surfaces THAT length's price instead of
   * the 60-min anchor.
   */
  lessonLengthMinutes?: 45 | 60 | 75 | 90;
  /**
   * 0=Sunday … 6=Saturday. When set, a tutor matches only if they have at
   * least one recurring availability rule on one of these weekdays.
   * Combined with `timeBuckets` via AND-inside-EXISTS: the SAME rule
   * must satisfy both weekday and time-range overlap.
   */
  daysOfWeek?: number[];
  /**
   * Time-of-day ranges. Same EXISTS-AND contract as `daysOfWeek` —
   * picking morning + Sunday matches tutors with a Sunday-morning
   * recurring rule, NOT tutors with Sunday-evening AND a separate
   * Wednesday-morning rule.
   */
  timeBuckets?: TimeRangeFilter[];
  sort?: BrowseSort;
  /** 1-based page. */
  page?: number;
  pageSize?: number;
}

export interface BrowseTutorCard {
  userId: string;
  displayName: string;
  gender: "male" | "female";
  tagline: string | null;
  shortBio: string | null;
  highlights: string[] | null;
  introVideoR2Key: string | null;
  profilePhotoR2Key: string | null;
  // All four lesson-length prices are selected so the row card can
  // surface every offered duration. Each is null when the tutor hasn't
  // set a price for that length.
  lesson45PriceIls: number | null;
  hourlyPriceIls: number | null;
  lesson75PriceIls: number | null;
  lesson90PriceIls: number | null;
  averageRating: string | null;
  ratingCount: number;
  totalLessonsCompleted: number;
}

export interface BrowseSearchResult {
  tutors: BrowseTutorCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const DEFAULT_BROWSE_PAGE_SIZE = 12;

const SORT_TO_ORDER_BY: Record<BrowseSort, SQL[]> = {
  // Recency — newest discoverable tutors first. Stable on `id` to avoid
  // tied-timestamp scroll skips.
  recent: [desc(tutorProfiles.createdAt), asc(tutorProfiles.id)],
  // Rating — average DESC, NULLs last; secondary on review count so a tutor
  // with one 5-star doesn't outrank a tutor with twenty 4.9s.
  rating: [
    sql`${tutorProfiles.averageRating} DESC NULLS LAST`,
    desc(tutorProfiles.ratingCount),
    desc(tutorProfiles.createdAt),
  ],
  // Price — hourly ASC, NULLs last (a tutor who hasn't set hourly_price_ils
  // sorts behind tutors who have it set, regardless of their other lengths).
  price_asc: [
    sql`${tutorProfiles.hourlyPriceIls} ASC NULLS LAST`,
    desc(tutorProfiles.createdAt),
  ],
  price_desc: [
    sql`${tutorProfiles.hourlyPriceIls} DESC NULLS LAST`,
    desc(tutorProfiles.createdAt),
  ],
};

/**
 * Compose the WHERE clause from optional filters. `discoverableTutorWhere`
 * (is_active=true, non-empty content, not soft-deleted) is always applied.
 *
 * Subject filter is a JOIN, not a column — caller wires it via the
 * `subjectId` parameter once it has resolved the slug → id (one extra
 * SELECT, but the alternative is a sub-query inside the WHERE which
 * doesn't compose cleanly with Drizzle's `and()` helpers).
 *
 * Days + time-buckets filter via EXISTS subquery against
 * `tutor_availability`. Semantics: a tutor matches when AT LEAST ONE of
 * their `recurring` rules overlaps `(weekday IN days) AND (timeRange
 * overlap with bucket)`. The same rule must satisfy both axes — picking
 * Sunday + morning matches Sunday-morning rules, not Sunday-evening +
 * Wednesday-morning rules. Index on
 * `(tutor_user_id, kind, weekday)` (already exists) covers the lookup.
 */
function buildFilters(input: BrowseSearchInput, subjectId: string | null): SQL {
  const clauses: SQL[] = [discoverableTutorWhere()];

  if (input.priceMin !== undefined) {
    clauses.push(gte(tutorProfiles.hourlyPriceIls, input.priceMin));
  }
  if (input.priceMax !== undefined) {
    clauses.push(lte(tutorProfiles.hourlyPriceIls, input.priceMax));
  }
  if (input.gender !== undefined) {
    clauses.push(eq(tutorProfiles.gender, input.gender));
  }
  if (input.lessonLengthMinutes !== undefined) {
    // Each canonical length lives in its own column. The filter narrows
    // to tutors with a positive price for that length — `IS NOT NULL`
    // alone would let a tutor with an accidental `₪0` row pass, which
    // would render "free lesson" on the card.
    const lengthColumn = (() => {
      switch (input.lessonLengthMinutes) {
        case 45:
          return tutorProfiles.lesson45PriceIls;
        case 60:
          return tutorProfiles.hourlyPriceIls;
        case 75:
          return tutorProfiles.lesson75PriceIls;
        case 90:
          return tutorProfiles.lesson90PriceIls;
      }
    })();
    clauses.push(gt(lengthColumn, 0));
  }
  if (subjectId !== null) {
    // The JOIN is added in the main query; this just narrows by the
    // resolved subject id.
    clauses.push(eq(tutorSubjects.subjectId, subjectId));
  }

  const days = input.daysOfWeek ?? [];
  const times = input.timeBuckets ?? [];
  if (days.length > 0 || times.length > 0) {
    clauses.push(buildAvailabilityExists(days, times));
  }

  return and(...clauses)!;
}

/**
 * Builds the `EXISTS (SELECT 1 FROM tutor_availability ... )` predicate.
 * The inner WHERE combines:
 *   - tutor join: `ta.tutor_user_id = tutor_profiles.user_id`
 *   - recurring rule type only (`kind = 'recurring'`)
 *   - weekday IN (selected days) — only if days were picked
 *   - time-range OVERLAP with any selected bucket: `ta.start_time <
 *     bucket.endTime AND ta.end_time > bucket.startTime`. Open-bound
 *     overlap is the right operator since `tutor_availability` stores
 *     half-open intervals (start inclusive, end exclusive).
 */
function buildAvailabilityExists(
  days: number[],
  times: TimeRangeFilter[],
): SQL {
  const innerClauses: SQL[] = [
    sql`${tutorAvailability.tutorUserId} = ${tutorProfiles.userId}`,
    eq(tutorAvailability.kind, "recurring"),
    // Exclude tutors whose matching recurring days fall entirely inside
    // an `exception_blocked` window in the visible horizon. Without
    // this, a tutor with all matching days blocked still surfaces in
    // browse results. Two-week horizon matches `CALENDAR_DAYS_AHEAD`
    // in the profile / booking-context paths.
    sql`NOT EXISTS (
      SELECT 1 FROM ${tutorAvailability} blk
      WHERE blk.tutor_user_id = ${tutorProfiles.userId}
        AND blk.kind = 'exception_blocked'
        AND blk.date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
        AND blk.start_time <= ${tutorAvailability.startTime}
        AND blk.end_time >= ${tutorAvailability.endTime}
    )`,
  ];

  if (days.length > 0) {
    // Drizzle's `inArray` over a smallint column binds the values as
    // proper parameters — safe against any tampered input that could
    // otherwise reach `sql.raw()` (caller path is currently strict but
    // defense-in-depth matters for a function that takes a number[]).
    innerClauses.push(inArray(tutorAvailability.weekday, days));
  }

  if (times.length > 0) {
    // OR over each (start, end) range. Half-open overlap:
    // ta.start_time < bucket.endTime AND ta.end_time > bucket.startTime.
    const rangeClauses = times.map(
      (t) =>
        sql`(${tutorAvailability.startTime} < ${t.endTime} AND ${tutorAvailability.endTime} > ${t.startTime})`,
    );
    innerClauses.push(sql`(${sql.join(rangeClauses, sql` OR `)})`);
  }

  const inner = and(...innerClauses)!;
  return sql`EXISTS (SELECT 1 FROM ${tutorAvailability} WHERE ${inner})`;
}

/**
 * Resolve a subject slug → id. Returns `null` if the slug is unknown or
 * inactive — caller treats this as "filter rejects everything" and
 * short-circuits to an empty result. Doing this in app code keeps the main
 * query free of correlated sub-queries.
 */
async function resolveSubjectId(slug: string | undefined): Promise<string | null> {
  if (!slug) return null;
  const db = getDb();
  const rows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.slug, slug), eq(subjects.isActive, true)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Search discoverable tutors. Returns the public card column subset
 * (intentionally narrower than `DiscoverableTutorPublic` — `longBio`,
 * recommendation fields, and other long-form columns aren't rendered on
 * the row card).
 *
 * Idempotent + parameter-only: same input → same result (modulo concurrent
 * DB writes). No mutations.
 */
export async function searchTutors(
  input: BrowseSearchInput = {},
): Promise<BrowseSearchResult> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.max(1, Math.min(50, Math.floor(input.pageSize ?? DEFAULT_BROWSE_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;
  const sort: BrowseSort = input.sort ?? "recent";

  // Filter prep — resolves subject slug → id BEFORE the main query so we
  // can fail-fast on an unknown slug. An empty result for `?subject=foo`
  // (typo in the URL) is the right UX over silently ignoring it.
  const subjectId = await resolveSubjectId(input.subjectSlug);
  if (input.subjectSlug && subjectId === null) {
    return {
      tutors: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
    };
  }

  const db = getDb();
  const where = buildFilters(input, subjectId);

  // Count query — total rows after filters, BEFORE pagination. Drives the
  // pagination control. Same JOIN shape as the main query. The subject-
  // filter branch joins through `tutor_subjects`; because the junction
  // table's PK is `(tutor_user_id, subject_id)` and we always filter by a
  // SINGLE subject_id, each tutor matches AT MOST ONCE — so `count(*)` is
  // safe even without DISTINCT. If we ever support `subject_id IN (...)`,
  // switch back to `count(distinct tutor_profiles.user_id)`.
  const countQuery = subjectId !== null
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(tutorProfiles)
        .innerJoin(users, eq(users.id, tutorProfiles.userId))
        .innerJoin(tutorSubjects, eq(tutorSubjects.tutorUserId, tutorProfiles.userId))
        .where(where)
    : db
        .select({ count: sql<number>`count(*)::int` })
        .from(tutorProfiles)
        .innerJoin(users, eq(users.id, tutorProfiles.userId))
        .where(where);

  const countRows = (await countQuery) as Array<{ count: number }>;
  const totalCount = countRows[0]?.count ?? 0;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);

  if (totalCount === 0) {
    return { tutors: [], totalCount: 0, page, pageSize, totalPages: 0 };
  }

  // Main row query — same JOIN shape as the count to keep filter parity.
  // Subject JOIN is only added when filtering by subject; without it, the
  // `tutor_subjects` JOIN would multiply rows by N subjects per tutor.
  const baseSelect = {
    userId: tutorProfiles.userId,
    displayName: tutorProfiles.displayName,
    gender: tutorProfiles.gender,
    tagline: tutorProfiles.tagline,
    shortBio: tutorProfiles.shortBio,
    highlights: tutorProfiles.highlights,
    introVideoR2Key: tutorProfiles.introVideoR2Key,
    profilePhotoR2Key: tutorProfiles.profilePhotoR2Key,
    lesson45PriceIls: tutorProfiles.lesson45PriceIls,
    hourlyPriceIls: tutorProfiles.hourlyPriceIls,
    lesson75PriceIls: tutorProfiles.lesson75PriceIls,
    lesson90PriceIls: tutorProfiles.lesson90PriceIls,
    averageRating: tutorProfiles.averageRating,
    ratingCount: tutorProfiles.ratingCount,
    totalLessonsCompleted: tutorProfiles.totalLessonsCompleted,
  };

  const orderBy = SORT_TO_ORDER_BY[sort];

  // Same dedup reasoning as the count query above — single-subject filter
  // produces zero duplicates due to the `tutor_subjects` PK, so a plain
  // SELECT (not SELECT DISTINCT) is both correct and avoids Postgres's
  // "ORDER BY expressions must appear in select list" constraint that
  // SELECT DISTINCT enforces.
  const tutorRows = subjectId !== null
    ? ((await db
        .select(baseSelect)
        .from(tutorProfiles)
        .innerJoin(users, eq(users.id, tutorProfiles.userId))
        .innerJoin(tutorSubjects, eq(tutorSubjects.tutorUserId, tutorProfiles.userId))
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset(offset)) as BrowseTutorCard[])
    : ((await db
        .select(baseSelect)
        .from(tutorProfiles)
        .innerJoin(users, eq(users.id, tutorProfiles.userId))
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset(offset)) as BrowseTutorCard[]);

  return {
    tutors: tutorRows,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}
