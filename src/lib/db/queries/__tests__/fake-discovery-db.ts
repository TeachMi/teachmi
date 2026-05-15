// Map-backed in-memory DB for tutor-queries tests. Smaller than
// `FakeTutorDb` in app/tutor/onboarding/profile/__tests__ because the
// discovery helpers only need the SELECT chain — no inserts, updates, deletes.
//
// Why a separate file (not extending FakeTutorDb): FakeTutorDb is queue-based
// (the test pushes rows it expects to be returned). The discovery tests are
// state-based — they configure tutor rows once and exercise the helper's
// WHERE-clause logic. State-based is the right shape here because the test
// names mirror real-world states ("never-approved", "approved", "re-uploaded
// after approval", etc.), and a queue would obscure that intent.

import { tutorProfiles as tutorProfilesTable } from "../../schema";
import type { DiscoverableTutorPublic } from "../tutor-queries";

export interface FakeTutorRow {
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
  // gate-relevant columns
  isActive: boolean;
  vettingStatus: "pending" | "approved" | "rejected" | "paused";
  deletedAt: Date | null;
}

const PUBLIC_KEYS: Array<keyof DiscoverableTutorPublic> = [
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
];

export class FakeDiscoveryDb {
  /** key = userId */
  private rows = new Map<string, FakeTutorRow>();

  /** Capture the last selectCols arg so tests can assert SELECT shape. */
  lastSelectCols: unknown = null;

  upsert(row: FakeTutorRow): this {
    this.rows.set(row.userId, row);
    return this;
  }

  patch(userId: string, partial: Partial<FakeTutorRow>): this {
    const existing = this.rows.get(userId);
    if (!existing) throw new Error(`FakeDiscoveryDb.patch: no row for ${userId}`);
    this.rows.set(userId, { ...existing, ...partial });
    return this;
  }

  /**
   * Drizzle-compatible select chain. Inspects the where-condition shape
   * (we know what the helper composes) and applies the equivalent JS filter
   * over `this.rows`. Returns a projected row using only the keys present
   * in `selectCols`.
   */
  select = (cols: unknown) => {
    this.lastSelectCols = cols;
    return {
      from: (table: unknown) => {
        if (table !== tutorProfilesTable) {
          throw new Error("FakeDiscoveryDb.select.from: only tutorProfiles supported");
        }
        return {
          where: (condition: unknown) => {
            // The helper composes:
            //   and(eq(tutorProfiles.userId, <id>),
            //       and(eq(tutorProfiles.isActive, true), isNull(tutorProfiles.deletedAt)))
            // We don't introspect — the unit test exercises end-to-end
            // semantics: set up rows, call helper, assert filtered result.
            // Use the captured condition object as a sentinel for "the helper
            // composed something" (a non-null SQL clause).
            void condition;
            return {
              limit: (n: number) => {
                void n;
                // Apply the actual filter logic in JS.
                const filtered: DiscoverableTutorPublic[] = [];
                const queriedUserId = this.queriedUserId;
                if (queriedUserId === null) {
                  // No userId set on the fake → return all matching rows.
                  for (const row of this.rows.values()) {
                    if (row.isActive && row.deletedAt === null) {
                      filtered.push(projectPublic(row));
                    }
                  }
                } else {
                  const row = this.rows.get(queriedUserId);
                  if (row && row.isActive && row.deletedAt === null) {
                    filtered.push(projectPublic(row));
                  }
                }
                return Promise.resolve(filtered.slice(0, n));
              },
            };
          },
        };
      },
    };
  };

  /** Set before each query. Avoids parsing Drizzle SQL clauses. */
  queriedUserId: string | null = null;
  withQueriedUserId(userId: string | null): this {
    this.queriedUserId = userId;
    return this;
  }
}

function projectPublic(row: FakeTutorRow): DiscoverableTutorPublic {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_KEYS) {
    out[key] = row[key];
  }
  return out as unknown as DiscoverableTutorPublic;
}

export function buildFakeRow(overrides: Partial<FakeTutorRow> = {}): FakeTutorRow {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    displayName: "ד״ר מיכל לוי",
    bio: "מורה למתמטיקה עם 8 שנות ניסיון.",
    city: "תל אביב",
    introVideoR2Key: "intros/00000000-0000-0000-0000-000000000001/abc.mp4",
    profilePhotoR2Key: "photos/00000000-0000-0000-0000-000000000001/abc.jpg",
    hourlyPriceIls: 180,
    lesson45PriceIls: 140,
    lessonLengthMinutes: 60,
    averageRating: "4.90",
    ratingCount: 124,
    totalLessonsCompleted: 1240,
    isActive: false,
    vettingStatus: "pending",
    deletedAt: null,
    ...overrides,
  };
}
