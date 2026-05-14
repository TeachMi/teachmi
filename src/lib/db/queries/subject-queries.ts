import { eq } from "drizzle-orm";
import { subjects } from "../schema";
import { getDb } from "../client";

export interface MarketplaceSubject {
  id: string;
  slug: string;
  displayNameHe: string;
  category: string | null;
  sortOrder: number;
}

interface SubjectQueryDeps {
  db?: {
    select(cols: unknown): {
      from(table: unknown): {
        where(condition: unknown): Promise<MarketplaceSubject[]>;
      };
    };
  };
}

const HEBREW_COLLATOR = new Intl.Collator("he-IL", {
  sensitivity: "base",
  numeric: true,
});

export function sortSubjectsByMarketplaceOrder(
  rows: readonly MarketplaceSubject[],
): MarketplaceSubject[] {
  return [...rows].sort((a, b) => {
    const byConfiguredOrder = a.sortOrder - b.sortOrder;
    if (byConfiguredOrder !== 0) return byConfiguredOrder;
    return HEBREW_COLLATOR.compare(a.displayNameHe, b.displayNameHe);
  });
}

export async function listActiveMarketplaceSubjects(
  deps: SubjectQueryDeps = {},
): Promise<MarketplaceSubject[]> {
  const db = deps.db ?? getDb();
  const rows = (await db
    .select({
      id: subjects.id,
      slug: subjects.slug,
      displayNameHe: subjects.displayNameHe,
      category: subjects.category,
      sortOrder: subjects.sortOrder,
    })
    .from(subjects)
    .where(eq(subjects.isActive, true))) as MarketplaceSubject[];

  return sortSubjectsByMarketplaceOrder(rows);
}
