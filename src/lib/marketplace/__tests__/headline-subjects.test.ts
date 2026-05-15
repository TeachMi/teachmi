import { describe, expect, it } from "vitest";
import {
  HEADLINE_FOUR_DISPLAY_ORDER,
  HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE,
  HEADLINE_FOUR_ICONS,
  HEADLINE_FOUR_SUBJECT_SLUGS,
} from "../headline-subjects";
import { launchSubjects } from "@/lib/db/seed-data";

describe("HEADLINE_FOUR_SUBJECT_SLUGS", () => {
  it("contains exactly 4 slugs", () => {
    expect(HEADLINE_FOUR_SUBJECT_SLUGS).toHaveLength(4);
  });

  it("every slug matches a seeded launch subject (typo guard)", () => {
    const seededSlugs = new Set(launchSubjects.map((s) => s.slug));
    for (const slug of HEADLINE_FOUR_SUBJECT_SLUGS) {
      expect(seededSlugs.has(slug)).toBe(true);
    }
  });

  it("contains math, english, hebrew-lashon, psychometric (the four locked headline subjects)", () => {
    expect(new Set(HEADLINE_FOUR_SUBJECT_SLUGS)).toEqual(
      new Set(["mathematics", "english", "hebrew-lashon", "psychometric"]),
    );
  });
});

describe("HEADLINE_FOUR_DISPLAY_ORDER", () => {
  it("contains exactly 4 distinct slugs from the headline-four set", () => {
    expect(HEADLINE_FOUR_DISPLAY_ORDER).toHaveLength(4);
    expect(new Set(HEADLINE_FOUR_DISPLAY_ORDER).size).toBe(4);
    for (const slug of HEADLINE_FOUR_DISPLAY_ORDER) {
      expect(HEADLINE_FOUR_SUBJECT_SLUGS).toContain(slug);
    }
  });

  it("matches Hebrew alphabetical order by first character of displayNameHe", () => {
    // א (english) → מ (mathematics) → ע (hebrew-lashon) → פ (psychometric).
    expect(HEADLINE_FOUR_DISPLAY_ORDER).toEqual([
      "english",
      "mathematics",
      "hebrew-lashon",
      "psychometric",
    ]);
  });
});

describe("HEADLINE_FOUR_ICONS", () => {
  it("has a non-empty icon name for each headline-four slug", () => {
    for (const slug of HEADLINE_FOUR_SUBJECT_SLUGS) {
      expect(HEADLINE_FOUR_ICONS[slug]).toBeTruthy();
      expect(typeof HEADLINE_FOUR_ICONS[slug]).toBe("string");
    }
  });
});

describe("HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE", () => {
  it("has a displayNameHe entry for each headline-four slug", () => {
    for (const slug of HEADLINE_FOUR_SUBJECT_SLUGS) {
      expect(HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE[slug]).toBeTruthy();
    }
  });

  it("fallback names match the seeded launchSubjects displayNameHe values", () => {
    // Guards against the seed drifting from the fallback set silently.
    const seededByslug = new Map(launchSubjects.map((s) => [s.slug, s.displayNameHe]));
    for (const slug of HEADLINE_FOUR_SUBJECT_SLUGS) {
      expect(HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE[slug]).toBe(seededByslug.get(slug));
    }
  });
});
