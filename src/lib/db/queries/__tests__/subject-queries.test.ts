import { describe, expect, it } from "vitest";
import {
  listActiveMarketplaceSubjects,
  sortSubjectsByMarketplaceOrder,
  type MarketplaceSubject,
} from "../subject-queries";
import { subjects as subjectsTable } from "../../schema";

class FakeSubjectDb {
  rows: Array<MarketplaceSubject & { isActive: boolean }> = [];

  select = () => ({
    from: (table: unknown) => {
      if (table !== subjectsTable) {
        throw new Error("FakeSubjectDb only supports subjects");
      }
      return {
        where: () =>
          Promise.resolve(
            this.rows.filter((row) => row.isActive).map(toMarketplaceSubject),
          ),
      };
    },
  });
}

function subject(
  slug: string,
  displayNameHe: string,
  sortOrder: number,
  isActive = true,
): MarketplaceSubject & { isActive: boolean } {
  return {
    id: `subject-${slug}`,
    slug,
    displayNameHe,
    category: "core",
    sortOrder,
    isActive,
  };
}

function toMarketplaceSubject(
  row: MarketplaceSubject & { isActive: boolean },
): MarketplaceSubject {
  return {
    id: row.id,
    slug: row.slug,
    displayNameHe: row.displayNameHe,
    category: row.category,
    sortOrder: row.sortOrder,
  };
}

describe("sortSubjectsByMarketplaceOrder", () => {
  it("uses configured sortOrder with Hebrew display name as a tie-breaker", () => {
    const result = sortSubjectsByMarketplaceOrder([
      subject("mathematics", "מתמטיקה", 40),
      subject("english", "אנגלית", 20),
      subject("biology", "ביולוגיה", 20),
      subject("accounting", "חשבונאות", 10),
    ]);

    expect(result.map((row) => row.slug)).toEqual([
      "accounting",
      "english",
      "biology",
      "mathematics",
    ]);
  });
});

describe("listActiveMarketplaceSubjects", () => {
  it("returns only active subjects for public marketplace surfaces", async () => {
    const db = new FakeSubjectDb();
    db.rows.push(
      subject("mathematics", "מתמטיקה", 10),
      subject("hidden", "מוסתר", 999, false),
      subject("english", "אנגלית", 20),
    );

    const result = await listActiveMarketplaceSubjects({ db });

    expect(result.map((row) => row.slug)).toEqual(["mathematics", "english"]);
    expect(result.some((row) => row.slug === "hidden")).toBe(false);
  });
});
