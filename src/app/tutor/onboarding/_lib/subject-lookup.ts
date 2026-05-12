import { eq, inArray } from "drizzle-orm";
import { subjects } from "../../../../lib/db/schema";

interface SubjectsDb {
  select(cols: unknown): {
    from(table: unknown): {
      where(condition: unknown): Promise<{ id: string; slug: string }[]>;
    };
  };
}

/**
 * Resolve subject slugs → ids using the database. Returns a Map; unknown
 * slugs are simply absent (the orchestrator surfaces the mismatch).
 *
 * NB: `inArray([])` is valid SQL but Drizzle short-circuits to `false`. We
 * guard against empty input to avoid the network round-trip.
 */
export async function lookupSubjectIdsBySlug(
  db: SubjectsDb,
  slugs: readonly string[],
): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({ id: subjects.id, slug: subjects.slug })
    .from(subjects)
    .where(inArray(subjects.slug, [...slugs]));

  const out = new Map<string, string>();
  for (const row of rows) {
    out.set(row.slug, row.id);
  }
  return out;
}

/**
 * Fetch active subjects ordered by sort_order, for the multi-select UI.
 * Inactive subjects (admin-hidden via Story 3.6) are excluded.
 */
export async function listActiveSubjects(db: SubjectsDb) {
  return await db
    .select({ id: subjects.id, slug: subjects.slug })
    .from(subjects)
    .where(eq(subjects.isActive, true));
}
