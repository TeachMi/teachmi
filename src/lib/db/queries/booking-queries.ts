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
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { bookings, subjects, tutorProfiles, users } from "../schema";
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
