// SINGLE SOURCE OF TRUTH for marketplace discoverability. Story 2.4 flips
// `is_active=true` on admin approval; Story 2.5 flips it back to false on
// triggering edits (intro video re-upload, hourly rate change, subject set
// change). Do NOT inline this predicate at call sites — compose via
// `discoverableTutorWhere()`.
//
// Gates on `is_active`, NOT `vetting_status`. The two columns DO move together
// 99% of the time, but the 1% — partial-failure windows in 2.4 / 2.5's
// sequential writes (neon-http forbids transactions) — is exactly what
// `is_active` exists to handle correctly: an invisible-but-approved tutor is
// the safe failure mode, not visible-with-unvetted-content.

import { and, asc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import {
  bookings,
  ratings,
  subjects,
  tutorAvailability,
  tutorProfiles,
  tutorSubjects,
} from "../schema";
import { getDb } from "../client";

// `Asia/Jerusalem` date-string for a UTC instant. Used by the availability
// helper to derive the IL calendar day that `dateRange.from`/`to` represents
// — `from.toISOString().slice(0, 10)` would produce a UTC date string and
// shift the validity-window comparison by 1 day for IL-midnight inputs.
const DATE_FORMATTER_HE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function jerusalemDateString(instant: Date): string {
  // en-CA formats as YYYY-MM-DD natively.
  return DATE_FORMATTER_HE.format(instant);
}

// Maximum booking duration in milliseconds. Used to expand the lower bound
// of `getActiveBookingsForTutor`'s range so that a booking starting BEFORE
// `from` but extending INTO the window is still returned. Today's lesson
// lengths are 45 or 60 minutes (per Story 2.1's profile fields); 120 minutes
// is a safe ceiling that covers any near-term extension without inflating
// the query result set.
const MAX_BOOKING_DURATION_MS = 120 * 60 * 1000;

// --- Public surface --------------------------------------------------------

export interface DiscoverableTutorPublic {
  userId: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  introVideoR2Key: string | null;
  profilePhotoR2Key: string | null;
  hourlyPriceIls: number;
  lesson45PriceIls: number | null;
  lessonLengthMinutes: number;
  averageRating: string | null;
  ratingCount: number;
  totalLessonsCompleted: number;
}

// Minimal Drizzle-compatible surface used by Story 2.3's
// `getDiscoverableTutorByUserId` / `isTutorDiscoverable`. Dep-inject for
// FakeDb tests; the production path receives `getDb()` directly. Kept
// EXACTLY as Story 2.3 shipped — Story 3.2's new helpers use the wider
// `DbForExtendedTutorQueries` interface below.
export interface DbForTutorQueries {
  select(cols: unknown): {
    from(table: unknown): {
      where(condition: unknown): {
        limit(n: number): Promise<unknown[]>;
      };
    };
  };
}

// Story 3.2 extension — wider chain shape covering the join / orderBy /
// groupBy / where-as-promise patterns the four new helpers need. The
// production `getDb()` satisfies this naturally; tests use a separate
// `FakeFullProfileDb` (in `__tests__/fake-full-profile-db.ts`) that
// implements just this surface — keeping Story 2.3's `FakeDiscoveryDb`
// untouched per the additive-only contract.
interface ExtendedWhereTerminal extends Promise<unknown[]> {
  limit(n: number): Promise<unknown[]>;
  orderBy(...args: unknown[]): Promise<unknown[]>;
  groupBy(...args: unknown[]): Promise<unknown[]>;
}
interface ExtendedSelectFromInnerJoin {
  where(condition: unknown): ExtendedWhereTerminal;
}
interface ExtendedSelectFrom {
  where(condition: unknown): ExtendedWhereTerminal;
  innerJoin(table: unknown, on: unknown): ExtendedSelectFromInnerJoin;
}
export interface DbForExtendedTutorQueries {
  select(cols: unknown): {
    from(table: unknown): ExtendedSelectFrom;
  };
}

// --- Composable predicate --------------------------------------------------

/**
 * Composable Drizzle WHERE clause for "is this tutor discoverable to the
 * public marketplace". Compose with additional filters via Drizzle's `and(...)`:
 *
 *     db.select(...).from(tutorProfiles)
 *       .where(and(discoverableTutorWhere(), <subjectFilter>, <priceFilter>))
 *
 * Hits the existing `idx_tutor_profiles_is_active` index (see schema.ts).
 *
 * The non-null assertion is correct: `and(...)` with non-empty args never
 * returns undefined. Drizzle's types are loose here; the runtime invariant
 * is solid.
 */
export function discoverableTutorWhere(): SQL {
  return and(eq(tutorProfiles.isActive, true), isNull(tutorProfiles.deletedAt))!;
}

// --- Single-tutor lookup ---------------------------------------------------

interface TutorQueryDeps {
  db?: DbForTutorQueries;
}

const PUBLIC_COLUMNS = {
  userId: tutorProfiles.userId,
  displayName: tutorProfiles.displayName,
  bio: tutorProfiles.bio,
  city: tutorProfiles.city,
  introVideoR2Key: tutorProfiles.introVideoR2Key,
  profilePhotoR2Key: tutorProfiles.profilePhotoR2Key,
  hourlyPriceIls: tutorProfiles.hourlyPriceIls,
  lesson45PriceIls: tutorProfiles.lesson45PriceIls,
  lessonLengthMinutes: tutorProfiles.lessonLengthMinutes,
  averageRating: tutorProfiles.averageRating,
  ratingCount: tutorProfiles.ratingCount,
  totalLessonsCompleted: tutorProfiles.totalLessonsCompleted,
} as const;

/**
 * Looks up a single tutor by `tutor_profiles.user_id`, filtered through
 * `discoverableTutorWhere()`. Returns the public column subset OR `null` when
 * the tutor is not discoverable (never approved, profile-edit triggered
 * re-vetting, soft-deleted, or simply does not exist).
 *
 * **No private columns are exposed** — `vettingNotes`, `commissionRateOverride`,
 * `vettedByAdminId` etc. are deliberately excluded. The frozen `PUBLIC_COLUMNS`
 * object is the allowlist; the test at `__tests__/tutor-queries.test.ts`
 * asserts `Object.keys(result)` matches this allowlist to catch future
 * regressions.
 */
export async function getDiscoverableTutorByUserId(
  userId: string,
  deps: TutorQueryDeps = {},
): Promise<DiscoverableTutorPublic | null> {
  const db = deps.db ?? getDb();
  const rows = (await db
    .select(PUBLIC_COLUMNS)
    .from(tutorProfiles)
    .where(and(eq(tutorProfiles.userId, userId), discoverableTutorWhere()))
    .limit(1)) as DiscoverableTutorPublic[];

  return rows[0] ?? null;
}

/**
 * Thin convenience wrapper. Use when you only need the boolean and would
 * otherwise throw away the row.
 */
export async function isTutorDiscoverable(
  userId: string,
  deps: TutorQueryDeps = {},
): Promise<boolean> {
  return (await getDiscoverableTutorByUserId(userId, deps)) !== null;
}

// Re-export the public-column shape as a frozen allowlist for tests.
export const DISCOVERABLE_TUTOR_PUBLIC_KEYS = Object.freeze([
  "userId",
  "displayName",
  "bio",
  "city",
  "introVideoR2Key",
  "profilePhotoR2Key",
  "hourlyPriceIls",
  "lesson45PriceIls",
  "lessonLengthMinutes",
  "averageRating",
  "ratingCount",
  "totalLessonsCompleted",
] as const);

// ---------------------------------------------------------------------------
// Story 3.2 extensions — sibling helpers for the public profile page.
// Read-side only; no audit writes, no state mutations.
// ---------------------------------------------------------------------------

interface ExtendedTutorQueryDeps {
  db?: DbForExtendedTutorQueries;
}

export interface TutorSubjectPublic {
  id: string;
  slug: string;
  displayNameHe: string;
  sortOrder: number;
  proficiencyNote: string | null;
}

/**
 * Joins `tutor_subjects` ↔ `subjects` to return the active subjects a tutor
 * teaches. Sorted by `subjects.sort_order ASC` to match the homepage / browse
 * surface order. Inactive subjects (admin hidden the taxonomy entry) are
 * filtered out — they should not surface on public pages even if a tutor
 * still has a junction row.
 */
export async function getTutorSubjects(
  userId: string,
  deps: ExtendedTutorQueryDeps = {},
): Promise<TutorSubjectPublic[]> {
  const db = deps.db ?? (getDb() as unknown as DbForExtendedTutorQueries);
  const rows = (await db
    .select({
      id: subjects.id,
      slug: subjects.slug,
      displayNameHe: subjects.displayNameHe,
      sortOrder: subjects.sortOrder,
      proficiencyNote: tutorSubjects.proficiencyNote,
    })
    .from(tutorSubjects)
    .innerJoin(subjects, eq(tutorSubjects.subjectId, subjects.id))
    .where(and(eq(tutorSubjects.tutorUserId, userId), eq(subjects.isActive, true)))
    .orderBy(asc(subjects.sortOrder))) as TutorSubjectPublic[];

  return rows;
}

export interface TutorAvailabilityRow {
  id: string;
  kind: "recurring" | "exception_blocked" | "exception_available";
  weekday: number | null;
  date: string | null; // YYYY-MM-DD (Drizzle `date` -> string)
  startTime: string; // HH:MM:SS
  endTime: string; // HH:MM:SS
  validFrom: string | null;
  validUntil: string | null;
}

/**
 * Returns raw `tutor_availability` rows in a date range. Both `recurring`
 * (weekly pattern) and `exception_*` (date-specific) rows are returned;
 * filtering by row kind happens in the slot-state computer.
 *
 * Two filters:
 *   1. Validity window — `(valid_from IS NULL OR valid_from <= to)` AND
 *      `(valid_until IS NULL OR valid_until >= from)`. Comparisons use the
 *      Asia/Jerusalem date of `dateRange.from`/`to`, NOT the UTC date —
 *      callers typically pass IL-midnight-as-UTC instants and the raw ISO
 *      date string would shift the comparison by 1 day.
 *   2. Date column filter — `exception_*` rows have a non-null `date`
 *      column; recurring rows have `date = NULL`. Without this filter every
 *      past `exception_*` row ever created would be returned for every page
 *      render, scaling poorly as tutors accumulate exceptions.
 */
export async function getTutorAvailabilityRows(
  userId: string,
  dateRange: { from: Date; to: Date },
  deps: ExtendedTutorQueryDeps = {},
): Promise<TutorAvailabilityRow[]> {
  const db = deps.db ?? (getDb() as unknown as DbForExtendedTutorQueries);
  const fromDateIl = jerusalemDateString(dateRange.from);
  const toDateIl = jerusalemDateString(dateRange.to);
  const rows = (await db
    .select({
      id: tutorAvailability.id,
      kind: tutorAvailability.kind,
      weekday: tutorAvailability.weekday,
      date: tutorAvailability.date,
      startTime: tutorAvailability.startTime,
      endTime: tutorAvailability.endTime,
      validFrom: tutorAvailability.validFrom,
      validUntil: tutorAvailability.validUntil,
    })
    .from(tutorAvailability)
    .where(
      and(
        eq(tutorAvailability.tutorUserId, userId),
        sql`(${tutorAvailability.validFrom} IS NULL OR ${tutorAvailability.validFrom} <= ${toDateIl})`,
        sql`(${tutorAvailability.validUntil} IS NULL OR ${tutorAvailability.validUntil} >= ${fromDateIl})`,
        // `exception_*` rows must fall within the visible date range;
        // recurring rows have date=NULL and pass through.
        sql`(${tutorAvailability.date} IS NULL OR ${tutorAvailability.date} BETWEEN ${fromDateIl} AND ${toDateIl})`,
      ),
    )) as TutorAvailabilityRow[];

  return rows;
}

export interface ActiveBookingRow {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  status: "pending_payment" | "confirmed";
}

/**
 * Returns active (`pending_payment` OR `confirmed`) bookings for a tutor in
 * a date range. Cancelled / completed / no-show bookings are excluded — they
 * don't block re-booking of the slot. Used to overlay the calendar with
 * booked markers.
 *
 * Range semantics:
 *   - Upper bound is EXCLUSIVE (`startsAt < to`). `to` is intended as the
 *     start of the day AFTER the visible window; a booking starting exactly
 *     at `to` is in the NEXT period and would never be rendered, so we
 *     exclude it to avoid an off-by-one in downstream slot rendering.
 *   - Lower bound is expanded by `MAX_BOOKING_DURATION_MS` so a booking
 *     whose `startsAt` is BEFORE `from` but whose duration extends INTO
 *     the window is still returned. Without this, a 60-min booking
 *     starting at 13:30 (before a window starting at 14:00) would not be
 *     overlaid on the 14:00 slot — the slot would render as available.
 */
export async function getActiveBookingsForTutor(
  userId: string,
  dateRange: { from: Date; to: Date },
  deps: ExtendedTutorQueryDeps = {},
): Promise<ActiveBookingRow[]> {
  const db = deps.db ?? (getDb() as unknown as DbForExtendedTutorQueries);
  const fromExpanded = new Date(dateRange.from.getTime() - MAX_BOOKING_DURATION_MS);
  const rows = (await db
    .select({
      id: bookings.id,
      startsAt: bookings.startsAt,
      durationMinutes: bookings.durationMinutes,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.tutorUserId, userId),
        gte(bookings.startsAt, fromExpanded),
        lt(bookings.startsAt, dateRange.to),
        inArray(bookings.status, ["pending_payment", "confirmed"]),
      ),
    )) as ActiveBookingRow[];

  return rows;
}

export interface RatingHistogram {
  score1: number;
  score2: number;
  score3: number;
  score4: number;
  score5: number;
  total: number;
  average: number;
}

/**
 * Aggregates `ratings.score` GROUP BY score for a single tutor. Returns
 * `null` when there are no ratings at all (caller hides the rating widget
 * entirely; see AC7).
 *
 * Why null-vs-zeros: at MVP-1 closed-beta every tutor will be at 0 ratings
 * until Story 5.5 (advisory ratings) ships. Returning a zero-filled object
 * would force the caller to add the `total === 0` check; returning null
 * makes the "widget hidden entirely" intent explicit at the type level.
 */
export async function getTutorRatingHistogram(
  userId: string,
  deps: ExtendedTutorQueryDeps = {},
): Promise<RatingHistogram | null> {
  const db = deps.db ?? (getDb() as unknown as DbForExtendedTutorQueries);
  const rows = (await db
    .select({
      score: ratings.score,
      count: sql<number>`count(*)::int`,
    })
    .from(ratings)
    .where(eq(ratings.tutorUserId, userId))
    .groupBy(ratings.score)) as Array<{ score: number; count: number }>;

  if (rows.length === 0) return null;

  const buckets = { score1: 0, score2: 0, score3: 0, score4: 0, score5: 0 };
  let total = 0;
  let weightedSum = 0;
  for (const row of rows) {
    // Defense-in-depth: the DB CHECK constraint `ck_ratings_score BETWEEN 1
    // AND 5` should make out-of-range scores impossible. If a corrupt row
    // ever slips through (manual DB edit, future migration relaxation), we
    // skip it entirely so `total` and `weightedSum` aren't polluted with
    // values that won't appear in the histogram — guarantees the displayed
    // average matches the sum of the rendered bars.
    if (row.score < 1 || row.score > 5) continue;
    const key = `score${row.score}` as keyof typeof buckets;
    buckets[key] = row.count;
    total += row.count;
    weightedSum += row.score * row.count;
  }
  if (total === 0) return null;

  return {
    ...buckets,
    total,
    average: weightedSum / total,
  };
}
