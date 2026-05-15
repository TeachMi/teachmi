import { describe, expect, it } from "vitest";
import {
  getActiveSubjects,
  MARKETPLACE_SUBJECT_PUBLIC_KEYS,
} from "../subject-queries";
import { FakeSubjectsDb, buildFakeSubject } from "./fake-subjects-db";

describe("getActiveSubjects", () => {
  it("returns all active subjects sorted by sort_order ASC", async () => {
    const db = new FakeSubjectsDb()
      .upsert(buildFakeSubject({ id: "id-c", slug: "english", displayNameHe: "אנגלית", sortOrder: 20 }))
      .upsert(buildFakeSubject({ id: "id-a", slug: "mathematics", displayNameHe: "מתמטיקה", sortOrder: 10 }))
      .upsert(buildFakeSubject({ id: "id-b", slug: "psychometric", displayNameHe: "פסיכומטרי", sortOrder: 40 }));

    const result = await getActiveSubjects({ db });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.slug)).toEqual(["mathematics", "english", "psychometric"]);
  });

  it("excludes rows with is_active=false", async () => {
    const db = new FakeSubjectsDb()
      .upsert(buildFakeSubject({ id: "id-a", slug: "mathematics", isActive: true, sortOrder: 10 }))
      .upsert(buildFakeSubject({ id: "id-b", slug: "music", isActive: false, sortOrder: 20 }));

    const result = await getActiveSubjects({ db });

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("mathematics");
  });

  it("returns an empty array when zero active subjects exist", async () => {
    const db = new FakeSubjectsDb();
    const result = await getActiveSubjects({ db });
    expect(result).toEqual([]);
  });

  it("returned shape contains exactly the public columns (frozen allowlist)", async () => {
    const db = new FakeSubjectsDb().upsert(
      buildFakeSubject({ id: "id-a", slug: "mathematics", displayNameHe: "מתמטיקה", sortOrder: 10 }),
    );

    const [row] = await getActiveSubjects({ db });
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual([...MARKETPLACE_SUBJECT_PUBLIC_KEYS].sort());
  });

  it("MARKETPLACE_SUBJECT_PUBLIC_KEYS is frozen", () => {
    expect(Object.isFrozen(MARKETPLACE_SUBJECT_PUBLIC_KEYS)).toBe(true);
  });
});
