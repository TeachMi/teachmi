// Map-backed in-memory DB for Story 3.2's new query helpers. Composes with
// Story 2.3's `FakeDiscoveryDb` (read-only import) — does NOT modify it.
// Keep this fake self-contained: each helper uses its own internal table
// store + simple JS filter logic. The point is to exercise the helpers'
// SELECT-shape semantics without spinning up Postgres.

import {
  bookings as bookingsTable,
  ratings as ratingsTable,
  subjects as subjectsTable,
  tutorAvailability as tutorAvailabilityTable,
  tutorSubjects as tutorSubjectsTable,
} from "../../schema";
import type {
  ActiveBookingRow,
  DbForExtendedTutorQueries,
  TutorAvailabilityRow,
  TutorSubjectPublic,
} from "../tutor-queries";

export interface FakeSubject {
  id: string;
  slug: string;
  displayNameHe: string;
  sortOrder: number;
  isActive: boolean;
}

export interface FakeTutorSubject {
  tutorUserId: string;
  subjectId: string;
  proficiencyNote: string | null;
}

export interface FakeAvailability extends TutorAvailabilityRow {
  tutorUserId: string;
}

// Fake bookings carry the FULL `bookings.status` enum (not just the active
// subset) so tests can exercise the query helper's filter — production code
// excludes cancelled/completed/no_show rows in SQL; we mirror that by JS
// filter inside `bookingsChain` below.
export interface FakeBooking {
  tutorUserId: string;
  id: string;
  startsAt: Date;
  durationMinutes: number;
  status:
    | "pending_payment"
    | "confirmed"
    | "cancelled"
    | "completed"
    | "no_show";
}

export interface FakeRating {
  tutorUserId: string;
  score: 1 | 2 | 3 | 4 | 5;
}

/**
 * Implements `DbForExtendedTutorQueries`. Each call to `.select()` returns
 * a fluent chain that ends in a Promise of rows. The chain inspects the
 * `from(...)` table to decide which internal store to query and applies a
 * coarse JS filter based on a "current tutor id" set by the test before
 * calling.
 */
export class FakeFullProfileDb implements DbForExtendedTutorQueries {
  subjects: FakeSubject[] = [];
  tutorSubjects: FakeTutorSubject[] = [];
  availability: FakeAvailability[] = [];
  bookings: FakeBooking[] = [];
  ratings: FakeRating[] = [];

  /** Test must set before each helper call so the fake knows which tutor. */
  queriedTutorId: string | null = null;
  /** For availability + bookings range filters. */
  queriedRangeFromIso: string | null = null;
  queriedRangeToIso: string | null = null;

  withTutorId(id: string): this {
    this.queriedTutorId = id;
    return this;
  }
  withRange(from: Date, to: Date): this {
    this.queriedRangeFromIso = from.toISOString();
    this.queriedRangeToIso = to.toISOString();
    return this;
  }

  select = (cols: unknown) => {
    void cols;
    return {
      from: (table: unknown) => this.buildFromChain(table),
    };
  };

  private buildFromChain(table: unknown) {
    if (table === tutorSubjectsTable) return this.tutorSubjectsChain();
    if (table === tutorAvailabilityTable) return this.availabilityChain();
    if (table === bookingsTable) return this.bookingsChain();
    if (table === ratingsTable) return this.ratingsChain();
    throw new Error("FakeFullProfileDb: unsupported source table");
  }

  // tutorSubjects + innerJoin(subjects).where(...).orderBy(...)
  private tutorSubjectsChain() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const producer = () => {
      const tutorId = self.queriedTutorId;
      if (!tutorId) return [];
      const joins: TutorSubjectPublic[] = [];
      for (const ts of self.tutorSubjects) {
        if (ts.tutorUserId !== tutorId) continue;
        const subj = self.subjects.find((s) => s.id === ts.subjectId);
        if (!subj || !subj.isActive) continue;
        joins.push({
          id: subj.id,
          slug: subj.slug,
          displayNameHe: subj.displayNameHe,
          sortOrder: subj.sortOrder,
          proficiencyNote: ts.proficiencyNote,
        });
      }
      joins.sort((a, b) => a.sortOrder - b.sortOrder);
      return joins;
    };
    return {
      innerJoin: (_joined: unknown, _on: unknown) => ({
        where: (_cond: unknown) => self.makeExtendedWhereTerminal(producer),
      }),
      where: (_cond: unknown) => self.makeExtendedWhereTerminal(producer),
    };
  }

  // tutor_availability.where(...).limit?.orderBy? → directly awaitable
  private availabilityChain() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      where: (_cond: unknown) =>
        self.makeExtendedWhereTerminal(() => {
          const tutorId = self.queriedTutorId;
          if (!tutorId) return [];
          // Validity filter is mocked: rows lacking valid windows pass; rows
          // with valid windows are checked against the queried range.
          const fromIso = self.queriedRangeFromIso ?? "0000-01-01";
          const toIso = self.queriedRangeToIso ?? "9999-12-31";
          const fromDateStr = fromIso.slice(0, 10);
          const toDateStr = toIso.slice(0, 10);
          return self.availability
            .filter((row) => row.tutorUserId === tutorId)
            .filter((row) => {
              if (row.validFrom && row.validFrom > toDateStr) return false;
              if (row.validUntil && row.validUntil < fromDateStr) return false;
              return true;
            })
            .map(
              ({ tutorUserId: _tu, ...rest }): TutorAvailabilityRow => rest,
            );
        }),
      innerJoin: (_t: unknown, _o: unknown) => {
        throw new Error("FakeFullProfileDb: tutor_availability.innerJoin not used");
      },
    };
  }

  private bookingsChain() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      where: (_cond: unknown) =>
        self.makeExtendedWhereTerminal(() => {
          const tutorId = self.queriedTutorId;
          if (!tutorId) return [];
          const from = self.queriedRangeFromIso
            ? new Date(self.queriedRangeFromIso)
            : new Date(0);
          const to = self.queriedRangeToIso
            ? new Date(self.queriedRangeToIso)
            : new Date(9999, 0, 1);
          return self.bookings
            .filter((b) => b.tutorUserId === tutorId)
            .filter((b) => b.startsAt >= from && b.startsAt <= to)
            .filter(
              (b): b is FakeBooking & { status: "pending_payment" | "confirmed" } =>
                b.status === "pending_payment" || b.status === "confirmed",
            )
            .map(({ tutorUserId: _tu, ...rest }): ActiveBookingRow => rest);
        }),
      innerJoin: (_t: unknown, _o: unknown) => {
        throw new Error("FakeFullProfileDb: bookings.innerJoin not used");
      },
    };
  }

  private ratingsChain() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      where: (_cond: unknown) =>
        self.makeExtendedWhereTerminal(() => {
          // Aggregated GROUP BY shape — returns score + count.
          const tutorId = self.queriedTutorId;
          if (!tutorId) return [];
          const counts = new Map<number, number>();
          for (const r of self.ratings) {
            if (r.tutorUserId !== tutorId) continue;
            counts.set(r.score, (counts.get(r.score) ?? 0) + 1);
          }
          return Array.from(counts, ([score, count]) => ({ score, count }));
        }),
      innerJoin: (_t: unknown, _o: unknown) => {
        throw new Error("FakeFullProfileDb: ratings.innerJoin not used");
      },
    };
  }

  // Build a terminal object that's both a Promise<rows> and exposes the
  // chain methods (.limit, .orderBy, .groupBy) for completeness — each
  // returns the same resolved rows.
  private makeExtendedWhereTerminal<T>(produce: () => T[]) {
    const rowsPromise = Promise.resolve(produce());
    return Object.assign(rowsPromise, {
      limit: (n: number) =>
        rowsPromise.then((rows) => rows.slice(0, n)) as Promise<unknown[]>,
      orderBy: () => rowsPromise as Promise<unknown[]>,
      groupBy: () => rowsPromise as Promise<unknown[]>,
    });
  }
}
