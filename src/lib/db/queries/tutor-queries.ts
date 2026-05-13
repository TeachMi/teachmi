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

import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { tutorProfiles } from "../schema";
import { getDb } from "../client";

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

// Minimal Drizzle-compatible surface used by the helpers. Dep-inject for
// FakeDb tests; the production path receives `getDb()` directly. The shape
// mirrors `TutorDb` in `profile-flow.ts` but only includes the read chain.
interface SelectFromWhereLimit {
  limit(n: number): Promise<unknown[]>;
}
interface SelectFromWhere {
  where(condition: unknown): SelectFromWhereLimit;
}
interface SelectFrom {
  from(table: unknown): SelectFromWhere;
}
export interface DbForTutorQueries {
  select(cols: unknown): SelectFrom;
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

// Silence the unused-`sql` import when no future helper needs raw SQL.
void sql;
