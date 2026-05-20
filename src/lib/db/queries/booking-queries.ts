// SINGLE SOURCE OF TRUTH for student-side booking queries. Story 5.0 uses
// both helpers to render the dashboard hero (upcoming) and the history list
// (past). Both wrap React `cache()` so multi-call-site pages share results.
//
// Indexes used:
//   - `idx_bookings_student_history` (student_user_id, starts_at DESC) — Drizzle
//     reads it in either direction; PG can serve ASC scans from a DESC index.
//
// Fail-OPEN on DB errors — both return []. The dashboard MUST render with
// empty-state even on Neon outage. Same precedent Story 1.21 set.

import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import {
  bookings,
  lessonSessions,
  ratings,
  subjects,
  tutorProfiles,
  users,
} from "../schema";
import { getDb } from "../client";

export type UpcomingBookingStatus = "pending_payment" | "confirmed";
export type PastBookingStatus = "completed" | "no_show" | "cancelled";

interface BookingRowBase {
  id: string;
  tutorUserId: string;
  /** Resolved from tutor_profiles.displayName if approved+active, else from users.name. Nullable as a last-resort fallback. */
  tutorDisplayName: string | null;
  subjectId: string | null;
  /** Subject's Hebrew display name when a subject_id is set; null otherwise. */
  subjectNameHe: string | null;
  startsAt: Date;
  durationMinutes: number;
  priceIls: number;
}

export interface UpcomingBookingRow extends BookingRowBase {
  status: UpcomingBookingStatus;
}

export interface PastBookingRow extends BookingRowBase {
  status: PastBookingStatus;
}

const MAX_UPCOMING_BOOKINGS = 10;
const MAX_PAST_BOOKINGS = 10;
const UPCOMING_STATUSES = ["pending_payment", "confirmed"] as const;
const PAST_STATUSES = ["completed", "no_show", "cancelled"] as const;

// Minimal Drizzle-compatible surface for FakeDb tests. The chain depth
// (from → leftJoin → leftJoin → leftJoin → where → orderBy → limit) is wider
// than the prior Story 2.3 pattern; the interface here matches the shape
// the production query builder uses, with the joins implicit in the chain.
export interface DbForBookingQueries {
  select(cols: unknown): {
    from(table: unknown): {
      leftJoin(table: unknown, on: unknown): {
        leftJoin(table: unknown, on: unknown): {
          leftJoin(table: unknown, on: unknown): {
            where(condition: unknown): {
              orderBy(...specs: unknown[]): {
                limit(n: number): Promise<unknown[]>;
              };
            };
          };
        };
      };
    };
  };
}

export interface BookingQueryDeps {
  db?: DbForBookingQueries;
  /** Cutoff. For upcoming: `starts_at >= now`. For past: `starts_at < now`. */
  now?: Date;
  logger?: { error: (message: string, err?: unknown) => void };
}

async function _getUpcomingBookingsForStudent(
  userId: string,
  deps: BookingQueryDeps = {},
): Promise<UpcomingBookingRow[]> {
  const now = deps.now ?? new Date();
  const logger = deps.logger ?? { error: (msg, err) => console.error(msg, err) };
  const db = deps.db ?? (getDb() as unknown as DbForBookingQueries);

  try {
    const rows = (await db
      .select({
        id: bookings.id,
        tutorUserId: bookings.tutorUserId,
        tutorDisplayName: tutorProfiles.displayName,
        userName: users.name,
        subjectId: bookings.subjectId,
        subjectNameHe: subjects.displayNameHe,
        startsAt: bookings.startsAt,
        durationMinutes: bookings.durationMinutes,
        status: bookings.status,
        priceIls: bookings.priceIls,
      })
      .from(bookings)
      .leftJoin(tutorProfiles, eq(tutorProfiles.userId, bookings.tutorUserId))
      .leftJoin(users, eq(users.id, bookings.tutorUserId))
      .leftJoin(subjects, eq(subjects.id, bookings.subjectId))
      .where(
        and(
          eq(bookings.studentUserId, userId),
          gte(bookings.startsAt, now),
          inArray(bookings.status, [...UPCOMING_STATUSES]),
        ),
      )
      .orderBy(asc(bookings.startsAt))
      .limit(MAX_UPCOMING_BOOKINGS)) as Array<
      BookingRowBase & {
        userName: string | null;
        status: UpcomingBookingStatus;
      }
    >;

    return rows.map((r) => ({
      id: r.id,
      tutorUserId: r.tutorUserId,
      tutorDisplayName: r.tutorDisplayName ?? r.userName ?? null,
      subjectId: r.subjectId,
      subjectNameHe: r.subjectNameHe,
      startsAt: r.startsAt,
      durationMinutes: r.durationMinutes,
      status: r.status,
      priceIls: r.priceIls,
    }));
  } catch (err) {
    logger.error("[booking-queries] getUpcomingBookingsForStudent failed", err);
    return [];
  }
}

async function _getPastBookingsForStudent(
  userId: string,
  deps: BookingQueryDeps = {},
): Promise<PastBookingRow[]> {
  const now = deps.now ?? new Date();
  const logger = deps.logger ?? { error: (msg, err) => console.error(msg, err) };
  const db = deps.db ?? (getDb() as unknown as DbForBookingQueries);

  try {
    const rows = (await db
      .select({
        id: bookings.id,
        tutorUserId: bookings.tutorUserId,
        tutorDisplayName: tutorProfiles.displayName,
        userName: users.name,
        subjectId: bookings.subjectId,
        subjectNameHe: subjects.displayNameHe,
        startsAt: bookings.startsAt,
        durationMinutes: bookings.durationMinutes,
        status: bookings.status,
        priceIls: bookings.priceIls,
      })
      .from(bookings)
      .leftJoin(tutorProfiles, eq(tutorProfiles.userId, bookings.tutorUserId))
      .leftJoin(users, eq(users.id, bookings.tutorUserId))
      .leftJoin(subjects, eq(subjects.id, bookings.subjectId))
      .where(
        and(
          eq(bookings.studentUserId, userId),
          lt(bookings.startsAt, now),
          inArray(bookings.status, [...PAST_STATUSES]),
        ),
      )
      .orderBy(desc(bookings.startsAt))
      .limit(MAX_PAST_BOOKINGS)) as Array<
      BookingRowBase & { userName: string | null; status: PastBookingStatus }
    >;

    return rows.map((r) => ({
      id: r.id,
      tutorUserId: r.tutorUserId,
      tutorDisplayName: r.tutorDisplayName ?? r.userName ?? null,
      subjectId: r.subjectId,
      subjectNameHe: r.subjectNameHe,
      startsAt: r.startsAt,
      durationMinutes: r.durationMinutes,
      status: r.status,
      priceIls: r.priceIls,
    }));
  } catch (err) {
    logger.error("[booking-queries] getPastBookingsForStudent failed", err);
    return [];
  }
}

export const getUpcomingBookingsForStudent = cache(_getUpcomingBookingsForStudent);
export const getPastBookingsForStudent = cache(_getPastBookingsForStudent);

// ----- Tutor-side mirror -----------------------------------------------
// Story 4.3 (2026-05-18). Same shape as the student-side query, with the
// counterpart (student) name + the tutor's payout (priceIls − commission)
// substituted. Used by the tutor self-service surface's upcoming list.

export interface UpcomingTutorBookingRow {
  id: string;
  studentUserId: string;
  /** Display name of the counterpart student (users.name; nullable). */
  studentDisplayName: string | null;
  subjectId: string | null;
  subjectNameHe: string | null;
  startsAt: Date;
  durationMinutes: number;
  status: UpcomingBookingStatus;
  /** Gross price the student paid (snapshot). */
  priceIls: number;
  /** What the tutor takes home (priceIls − platform commission). */
  tutorPayoutIls: number;
}

async function _getUpcomingBookingsForTutor(
  tutorUserId: string,
  deps: BookingQueryDeps = {},
): Promise<UpcomingTutorBookingRow[]> {
  const now = deps.now ?? new Date();
  const logger = deps.logger ?? { error: (msg, err) => console.error(msg, err) };

  try {
    // `getDb()` is inside the try so a missing DATABASE_URL (in unit
    // tests, or in a misconfigured deploy) returns `[]` instead of
    // throwing. The `/tutor/me` layout calls this on every render —
    // crashing the layout for the entire site over a DB-env blip
    // is the wrong fail mode. Matches the student-side helper's
    // intent ("fail-OPEN on DB errors — both return []").
    const db = deps.db ?? (getDb() as unknown as DbForBookingQueries);

    const rows = (await db
      .select({
        id: bookings.id,
        studentUserId: bookings.studentUserId,
        studentDisplayName: users.name,
        subjectId: bookings.subjectId,
        subjectNameHe: subjects.displayNameHe,
        startsAt: bookings.startsAt,
        durationMinutes: bookings.durationMinutes,
        status: bookings.status,
        priceIls: bookings.priceIls,
        tutorPayoutIls: bookings.tutorPayoutIls,
      })
      .from(bookings)
      // Join shape matches the student-side helper so the structural
      // FakeDb interface (3 leftJoins) stays a single contract. Here:
      //  - `users` → student name
      //  - `subjects` → subject display name
      //  - `tutor_profiles` → no-op pin (joined for shape parity; we
      //    don't select from it). The DB optimizer eliminates the row.
      .leftJoin(users, eq(users.id, bookings.studentUserId))
      .leftJoin(subjects, eq(subjects.id, bookings.subjectId))
      .leftJoin(tutorProfiles, eq(tutorProfiles.userId, bookings.tutorUserId))
      .where(
        and(
          eq(bookings.tutorUserId, tutorUserId),
          gte(bookings.startsAt, now),
          inArray(bookings.status, [...UPCOMING_STATUSES]),
        ),
      )
      .orderBy(asc(bookings.startsAt))
      .limit(MAX_UPCOMING_BOOKINGS)) as Array<UpcomingTutorBookingRow>;

    return rows;
  } catch (err) {
    logger.error("[booking-queries] getUpcomingBookingsForTutor failed", err);
    return [];
  }
}

export const getUpcomingBookingsForTutor = cache(_getUpcomingBookingsForTutor);

// ---------------------------------------------------------------------------
// Story 5.x — completed-but-unrated lessons for the student dashboard
// "כתבו ביקורת" CTA.
//
// Anchored on `lesson_sessions.status='completed'` with NO matching ratings
// row. `lesson_session_id` is the right anchor (not `booking_id`) — Winston's
// call from R1: bookings can in principle be rescheduled into multiple
// sessions, so the per-session uniqueness already enforced by
// `uq_ratings_lesson_session_id` is the durable identity for a review.
//
// Per Sally's design: list, not nag-strip — render inline cards on the
// student dashboard. John's call: gated strictly on
// `lesson_session.status='completed'`. No-shows and cancelled lessons
// are never review-targets.
// ---------------------------------------------------------------------------

export interface UnratedCompletedLesson {
  lessonSessionId: string;
  bookingId: string;
  tutorUserId: string;
  tutorDisplayName: string | null;
  tutorProfilePhotoR2Key: string | null;
  subjectNameHe: string | null;
  startsAt: Date;
}

const MAX_UNRATED_LESSONS = 5;

/**
 * Returns recent completed lessons for `studentUserId` that have NOT
 * been rated yet. Sorted by `startsAt DESC` (most recent first) so the
 * top of the dashboard's "rate previous" surface is the freshest signal.
 *
 * LEFT JOIN against `ratings` + WHERE `ratings.id IS NULL` is the cheap
 * "anti-join" — index on `(student_user_id, lesson_session_id)` via the
 * unique constraint covers the lookup. We don't materialize this query
 * past 5 rows because the UI shows at most 5 cards.
 */
export async function getUnratedCompletedLessonsForStudent(
  studentUserId: string,
  options: { now?: Date; limit?: number } = {},
): Promise<UnratedCompletedLesson[]> {
  const now = options.now ?? new Date();
  const limit = Math.min(20, Math.max(1, options.limit ?? MAX_UNRATED_LESSONS));

  try {
    const db = getDb();
    const rows = await db
      .select({
        lessonSessionId: lessonSessions.id,
        bookingId: bookings.id,
        tutorUserId: bookings.tutorUserId,
        tutorDisplayName: tutorProfiles.displayName,
        tutorUserName: users.name,
        tutorProfilePhotoR2Key: tutorProfiles.profilePhotoR2Key,
        subjectNameHe: subjects.displayNameHe,
        startsAt: bookings.startsAt,
      })
      .from(lessonSessions)
      .innerJoin(bookings, eq(bookings.id, lessonSessions.bookingId))
      .leftJoin(tutorProfiles, eq(tutorProfiles.userId, bookings.tutorUserId))
      .leftJoin(users, eq(users.id, bookings.tutorUserId))
      .leftJoin(subjects, eq(subjects.id, bookings.subjectId))
      .leftJoin(ratings, eq(ratings.lessonSessionId, lessonSessions.id))
      .where(
        and(
          eq(bookings.studentUserId, studentUserId),
          eq(lessonSessions.status, "completed"),
          lt(bookings.startsAt, now),
          isNull(ratings.id),
          // Skip lessons whose tutor was soft-deleted / banned after
          // the lesson completed — the dashboard shouldn't offer to
          // rate them. `users.deletedAt` is the canonical soft-delete
          // marker; `tutor_profiles.deletedAt` is the profile-level
          // mirror but doesn't fire on full-account soft-delete.
          isNull(users.deletedAt),
        ),
      )
      .orderBy(desc(bookings.startsAt))
      .limit(limit);

    return rows.map((r) => ({
      lessonSessionId: r.lessonSessionId,
      bookingId: r.bookingId,
      tutorUserId: r.tutorUserId,
      tutorDisplayName: r.tutorDisplayName ?? r.tutorUserName ?? null,
      tutorProfilePhotoR2Key: r.tutorProfilePhotoR2Key,
      subjectNameHe: r.subjectNameHe,
      startsAt: r.startsAt,
    }));
  } catch (err) {
    console.error("[booking-queries] getUnratedCompletedLessonsForStudent failed", err);
    return [];
  }
}
