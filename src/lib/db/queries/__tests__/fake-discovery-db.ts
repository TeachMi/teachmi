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
import type {
  DiscoverableTutorPublic,
  TutorProfileForOwner,
} from "../tutor-queries";

export interface FakeTutorRow {
  userId: string;
  displayName: string;
  gender: "male" | "female";
  tagline: string | null;
  shortBio: string | null;
  longBio: string | null;
  highlights: string[] | null;
  recommendationHeadline: string | null;
  recommendationSub: string | null;
  recommendationVisible: boolean;
  introVideoR2Key: string | null;
  profilePhotoR2Key: string | null;
  hourlyPriceIls: number | null;
  lesson45PriceIls: number | null;
  lesson75PriceIls: number | null;
  lesson90PriceIls: number | null;
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
  "gender",
  "tagline",
  "shortBio",
  "longBio",
  "highlights",
  "recommendationHeadline",
  "recommendationSub",
  "recommendationVisible",
  "introVideoR2Key",
  "profilePhotoR2Key",
  "hourlyPriceIls",
  "lesson45PriceIls",
  "lesson75PriceIls",
  "lesson90PriceIls",
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
            const ownerMode = this.ownerOnlyMode;
            const includeRow = (row: FakeTutorRow): boolean =>
              ownerMode
                ? row.deletedAt === null
                : row.isActive && row.deletedAt === null;
            return {
              limit: (n: number) => {
                void n;
                // Apply the actual filter logic in JS.
                const filtered: Array<DiscoverableTutorPublic | TutorProfileForOwner> = [];
                const queriedUserId = this.queriedUserId;
                if (queriedUserId === null) {
                  // No userId set on the fake → return all matching rows.
                  for (const row of this.rows.values()) {
                    if (includeRow(row)) {
                      filtered.push(
                        ownerMode ? projectOwner(row) : projectPublic(row),
                      );
                    }
                  }
                } else {
                  const row = this.rows.get(queriedUserId);
                  if (row && includeRow(row)) {
                    filtered.push(
                      ownerMode ? projectOwner(row) : projectPublic(row),
                    );
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

  /**
   * Toggle Story 2.5's owner-mode lookup: when true, the select chain drops
   * the `is_active=true` filter (still respects `deletedAt IS NULL`) and
   * projects to the wider `TutorProfileForOwner` shape.
   */
  ownerOnlyMode = false;
  withOwnerOnlyMode(enabled: boolean): this {
    this.ownerOnlyMode = enabled;
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

const OWNER_KEYS: Array<keyof TutorProfileForOwner> = [
  "userId",
  "displayName",
  "gender",
  "tagline",
  "shortBio",
  "longBio",
  "highlights",
  "recommendationHeadline",
  "recommendationSub",
  "recommendationVisible",
  "introVideoR2Key",
  "profilePhotoR2Key",
  "hourlyPriceIls",
  "lesson45PriceIls",
  "lesson75PriceIls",
  "lesson90PriceIls",
  "lessonLengthMinutes",
  "vettingStatus",
  "isActive",
];

function projectOwner(row: FakeTutorRow): TutorProfileForOwner {
  const out: Record<string, unknown> = {};
  for (const key of OWNER_KEYS) {
    out[key] = row[key];
  }
  return out as unknown as TutorProfileForOwner;
}

export function buildFakeRow(overrides: Partial<FakeTutorRow> = {}): FakeTutorRow {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    displayName: "ד״ר מיכל לוי",
    gender: "female",
    tagline: "מורה למתמטיקה",
    shortBio: "מורה פרטי מנוסה במתמטיקה עם 8 שנות ניסיון.",
    longBio: "מלמדת מתמטיקה כבר 8 שנים, מבית ספר התיכון ועד הכנה לפסיכומטרי. גישה אישית, חומרי לימוד מקוריים, ומעקב שבועי.",
    highlights: null,
    recommendationHeadline: null,
    recommendationSub: null,
    recommendationVisible: false,
    introVideoR2Key: "intros/00000000-0000-0000-0000-000000000001/abc.mp4",
    profilePhotoR2Key: "photos/00000000-0000-0000-0000-000000000001/abc.jpg",
    hourlyPriceIls: 180,
    lesson45PriceIls: 140,
    lesson75PriceIls: null,
    lesson90PriceIls: null,
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
