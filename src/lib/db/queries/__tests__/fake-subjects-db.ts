// Map-backed in-memory DB for `subject-queries.ts` tests. Same shape as
// `FakeDiscoveryDb` (Story 2.3) — state-based, not queue-based — because
// the helper's behavior is "filter active subjects + sort by sort_order."
//
// The helper composes `select(cols).from(subjects).where(eq(isActive, true))
// .orderBy(asc(sortOrder))`. We accept any condition + order sentinel and
// apply the equivalent JS logic over `this.rows`.

import { subjects as subjectsTable } from "../../schema";
import type {
  DbForSubjectQueries,
  MarketplaceSubject,
} from "../subject-queries";

export interface FakeSubjectRow {
  id: string;
  slug: string;
  displayNameHe: string;
  sortOrder: number;
  isActive: boolean;
}

export class FakeSubjectsDb implements DbForSubjectQueries {
  private rows: FakeSubjectRow[] = [];
  lastSelectCols: unknown = null;

  upsert(row: FakeSubjectRow): this {
    const idx = this.rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      this.rows[idx] = row;
    } else {
      this.rows.push(row);
    }
    return this;
  }

  select = (cols: unknown) => {
    this.lastSelectCols = cols;
    return {
      from: (table: unknown) => {
        if (table !== subjectsTable) {
          throw new Error("FakeSubjectsDb.select.from: only subjects supported");
        }
        return {
          where: (condition: unknown) => {
            // We don't introspect the SQL clause — the helper composes
            // `eq(subjects.isActive, true)`. Apply the equivalent JS filter.
            void condition;
            return {
              orderBy: (order: unknown) => {
                void order;
                const filtered = this.rows.filter((r) => r.isActive);
                filtered.sort((a, b) => a.sortOrder - b.sortOrder);
                return Promise.resolve(
                  filtered.map(
                    (r): MarketplaceSubject => ({
                      id: r.id,
                      slug: r.slug,
                      displayNameHe: r.displayNameHe,
                      sortOrder: r.sortOrder,
                    }),
                  ),
                );
              },
            };
          },
        };
      },
    };
  };
}

export function buildFakeSubject(
  overrides: Partial<FakeSubjectRow> = {},
): FakeSubjectRow {
  return {
    id: "00000000-0000-0000-0000-00000000aa01",
    slug: "mathematics",
    displayNameHe: "מתמטיקה",
    sortOrder: 10,
    isActive: true,
    ...overrides,
  };
}
