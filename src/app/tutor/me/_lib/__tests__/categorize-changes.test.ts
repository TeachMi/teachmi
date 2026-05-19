import { describe, expect, it } from "vitest";
import { categorizeChanges, type ProfileValues } from "../categorize-changes";

const BASE: ProfileValues = {
  displayName: "ד״ר מיכל לוי",
  gender: "female",
  tagline: "מורה למתמטיקה",
  shortBio: "מורה פרטי מנוסה במתמטיקה עם 8 שנות ניסיון.",
  longBio: "מלמדת מתמטיקה כבר 8 שנים, מבית ספר התיכון ועד הכנה לפסיכומטרי. גישה אישית, חומרי לימוד מקוריים, ומעקב שבועי.",
  highlights: [],
  recommendationHeadline: "",
  recommendationSub: "",
  recommendationVisible: false,
  lesson75PriceIls: null,
  lesson90PriceIls: null,
  profilePhotoR2Key: "photos/00000000-0000-0000-0000-000000000001/abc.jpg",
  introVideoR2Key: "intros/00000000-0000-0000-0000-000000000001/abc.mp4",
  hourlyPriceIls: 180,
  lesson45PriceIls: 140,
  subjects: ["mathematics", "english", "psychometric"],
};

describe("categorizeChanges — non-trigger only", () => {
  it("long_bio change only → nonTrigger=[long_bio]", () => {
    const out = categorizeChanges(BASE, {
      ...BASE,
      longBio: "ביוגרפיה חדשה לגמרי, עם פרטים נוספים על הניסיון ועל גישת ההוראה.",
    });
    expect(out.triggerChanges).toEqual([]);
    expect(out.nonTriggerChanges).toEqual(["long_bio"]);
    expect(out.hasAnyChange).toBe(true);
  });

  it("displayName change only → nonTrigger=[display_name]", () => {
    const out = categorizeChanges(BASE, { ...BASE, displayName: "ד״ר מיכל לוי-כהן" });
    expect(out.triggerChanges).toEqual([]);
    expect(out.nonTriggerChanges).toEqual(["display_name"]);
  });

  it("gender change only → nonTrigger=[gender] (non-trigger because it doesn't affect discoverability, just gendered Hebrew copy)", () => {
    const out = categorizeChanges(BASE, { ...BASE, gender: "male" });
    expect(out.triggerChanges).toEqual([]);
    expect(out.nonTriggerChanges).toEqual(["gender"]);
    expect(out.hasAnyChange).toBe(true);
  });

  it("tagline change only → nonTrigger=[tagline]", () => {
    const out = categorizeChanges(BASE, { ...BASE, tagline: "מורה למתמטיקה ופיזיקה" });
    expect(out.triggerChanges).toEqual([]);
    expect(out.nonTriggerChanges).toEqual(["tagline"]);
  });

  it("profile photo replacement only → nonTrigger=[profile_photo]", () => {
    const out = categorizeChanges(BASE, {
      ...BASE,
      profilePhotoR2Key: "photos/00000000-0000-0000-0000-000000000001/new.jpg",
    });
    expect(out.triggerChanges).toEqual([]);
    expect(out.nonTriggerChanges).toEqual(["profile_photo"]);
  });
});

describe("categorizeChanges — trigger changes", () => {
  it("intro video re-upload → trigger=[intro_video]", () => {
    const out = categorizeChanges(BASE, {
      ...BASE,
      introVideoR2Key: "intros/00000000-0000-0000-0000-000000000001/new.mp4",
    });
    expect(out.triggerChanges).toEqual(["intro_video"]);
    expect(out.nonTriggerChanges).toEqual([]);
  });

  it("hourly_price change → trigger=[hourly_price]", () => {
    const out = categorizeChanges(BASE, { ...BASE, hourlyPriceIls: 200 });
    expect(out.triggerChanges).toEqual(["hourly_price"]);
  });

  it("lesson_45_price change → trigger=[lesson_45_price]", () => {
    const out = categorizeChanges(BASE, { ...BASE, lesson45PriceIls: 150 });
    expect(out.triggerChanges).toEqual(["lesson_45_price"]);
  });

  it("subjects added → trigger=[subjects]", () => {
    const out = categorizeChanges(BASE, {
      ...BASE,
      subjects: ["mathematics", "english", "psychometric", "physics"],
    });
    expect(out.triggerChanges).toEqual(["subjects"]);
  });

  it("subjects removed → trigger=[subjects]", () => {
    const out = categorizeChanges(BASE, {
      ...BASE,
      subjects: ["mathematics", "english"],
    });
    expect(out.triggerChanges).toEqual(["subjects"]);
  });

  it("subjects identical set but different order → no change", () => {
    const out = categorizeChanges(BASE, {
      ...BASE,
      subjects: ["psychometric", "mathematics", "english"],
    });
    expect(out.triggerChanges).toEqual([]);
    expect(out.nonTriggerChanges).toEqual([]);
    expect(out.hasAnyChange).toBe(false);
  });
});

describe("categorizeChanges — mixed + idempotency edge cases", () => {
  it("mixed trigger + non-trigger → both categorized", () => {
    const out = categorizeChanges(BASE, {
      ...BASE,
      longBio: "ביוגרפיה חדשה לגמרי עם תוכן רב יותר ופירוט על שיטת ההוראה.",
      hourlyPriceIls: 200,
    });
    expect(out.triggerChanges).toEqual(["hourly_price"]);
    expect(out.nonTriggerChanges).toEqual(["long_bio"]);
    expect(out.hasAnyChange).toBe(true);
  });

  it("long_bio whitespace-only change → no change", () => {
    const out = categorizeChanges(BASE, { ...BASE, longBio: `  ${BASE.longBio}  ` });
    expect(out.triggerChanges).toEqual([]);
    expect(out.nonTriggerChanges).toEqual([]);
    expect(out.hasAnyChange).toBe(false);
  });

  it("empty string treated equal to null for text fields", () => {
    const out = categorizeChanges(
      { ...BASE, tagline: "" },
      { ...BASE, tagline: "" },
    );
    expect(out.hasAnyChange).toBe(false);
  });

  it("no changes at all → hasAnyChange=false (idempotent no-op)", () => {
    const out = categorizeChanges(BASE, { ...BASE });
    expect(out.triggerChanges).toEqual([]);
    expect(out.nonTriggerChanges).toEqual([]);
    expect(out.hasAnyChange).toBe(false);
  });

  it("null → key transition for intro video counts as trigger change", () => {
    const out = categorizeChanges(
      { ...BASE, introVideoR2Key: null },
      { ...BASE, introVideoR2Key: "intros/.../first.mp4" },
    );
    expect(out.triggerChanges).toEqual(["intro_video"]);
  });

  it("multi-trigger save preserves insertion order: intro_video, hourly, lesson_45, subjects", () => {
    const out = categorizeChanges(BASE, {
      ...BASE,
      introVideoR2Key: "intros/x/new.mp4",
      hourlyPriceIls: 200,
      lesson45PriceIls: 150,
      subjects: ["mathematics"],
    });
    expect(out.triggerChanges).toEqual([
      "intro_video",
      "hourly_price",
      "lesson_45_price",
      "subjects",
    ]);
  });
});
