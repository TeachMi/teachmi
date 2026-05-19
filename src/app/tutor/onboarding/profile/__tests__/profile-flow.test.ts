import { describe, expect, it } from "vitest";
import {
  auditEvents,
  tutorDocuments,
  tutorProfiles,
  tutorSubjects,
  tutorWizardState,
} from "../../../../../lib/db/schema";
import { runSaveDraft, runSubmitProfile } from "../profile-flow";
import { FakeTutorDb, TrackRecorder, silentLogger } from "./fake-tutor-db";

const TUTOR_ID = "00000000-0000-0000-0000-000000000001";
const SUBJECT_IDS = new Map([
  ["mathematics", "00000000-0000-0000-0000-000000000010"],
  ["english", "00000000-0000-0000-0000-000000000011"],
  ["psychometric", "00000000-0000-0000-0000-000000000012"],
]);

const VALID_LONG_BIO =
  "מורה למתמטיקה וטכנולוגיה עם תואר ד״ר מאוניברסיטת תל אביב. מלמדת מעל 8 שנים, מהתיכון ועד הכנה לפסיכומטרי. גישה ידידותית, סבלנית, ויעילה.";

const VALID_INPUT = {
  displayName: "ד״ר ישראלה ישראלי",
  gender: "female",
  // Story 2.11 (2026-05-18): bio → tagline / shortBio / longBio split.
  tagline: "מורה למתמטיקה ופיזיקה",
  shortBio: "מורה למתמטיקה עם 8 שנות ניסיון, מהתיכון ועד הכנה לפסיכומטרי.",
  longBio: VALID_LONG_BIO,
  highlights: ["accessible", "patient"],
  recommendationVisible: false,
  recommendationHeadline: "",
  recommendationSub: "",
  subjects: ["mathematics", "english", "psychometric"],
  prices: { 45: 140, 60: 180, 75: null, 90: null },
  photoR2Key: `photos/${TUTOR_ID}/01HQXY.png`,
  introVideoR2Key: `intros/${TUTOR_ID}/01HQXY.mp4`,
};

function makeDeps(overrides: Partial<Parameters<typeof runSubmitProfile>[1]> = {}) {
  const db = new FakeTutorDb();
  const track = new TrackRecorder();
  return {
    db,
    track,
    deps: {
      db,
      tutorUserId: TUTOR_ID,
      getSubjectIdsBySlug: async (slugs: string[]) => {
        const out = new Map<string, string>();
        for (const slug of slugs) {
          const id = SUBJECT_IDS.get(slug);
          if (id) out.set(slug, id);
        }
        return out;
      },
      now: () => new Date("2026-05-12T10:00:00.000Z"),
      track: track.capture,
      logger: silentLogger,
      ...overrides,
    },
  };
}

describe("runSubmitProfile — happy path (first submit)", () => {
  it("INSERTs tutor_profiles, replaces tutor_subjects, stamps wizard state, writes audit, fires PostHog", async () => {
    const { db, track, deps } = makeDeps();
    // Profile row lookup → empty (no existing profile).
    db.queueSelect([]);
    // Insert returning → profile id.
    db.queueReturning([{ id: "tp-1" }]);
    // tutor_documents UPDATE returning → matched 1 row (patch H9, 2026-05-13).
    db.queueReturning([{ id: "td-1" }]);
    // Wizard state lookup → empty (no draft yet).
    db.queueSelect([]);

    const result = await runSubmitProfile(VALID_INPUT, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isFirstSubmit).toBe(true);
    expect(result.tutorProfileId).toBe("tp-1");
    expect(result.redirectTo).toBe("/tutor/onboarding/agreement");

    expect(db.insertedInto(tutorProfiles)).toHaveLength(1);
    expect(db.insertedInto(tutorProfiles)[0]?.value).toMatchObject({
      userId: TUTOR_ID,
      vettingStatus: "pending",
      isActive: false,
      hourlyPriceIls: 180,
      lesson45PriceIls: 140,
      introVideoR2Key: `intros/${TUTOR_ID}/01HQXY.mp4`,
      profilePhotoR2Key: `photos/${TUTOR_ID}/01HQXY.png`,
    });

    expect(db.deletedFrom(tutorSubjects)).toHaveLength(1);
    expect(db.insertedInto(tutorSubjects)).toHaveLength(3);
    expect(
      db.insertedInto(tutorSubjects).map((row) => (row.value as { subjectId: string }).subjectId),
    ).toEqual([
      SUBJECT_IDS.get("mathematics"),
      SUBJECT_IDS.get("english"),
      SUBJECT_IDS.get("psychometric"),
    ]);

    expect(db.updatedAt(tutorDocuments)).toHaveLength(1);
    expect(db.insertedInto(tutorWizardState)).toHaveLength(1);
    expect(db.insertedInto(tutorWizardState)[0]?.value).toMatchObject({
      userId: TUTOR_ID,
      phase: 2,
      completedAt: new Date("2026-05-12T10:00:00.000Z"),
    });

    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)[0]?.value).toMatchObject({
      eventType: "tutor.profile_submitted",
      actorKind: "user",
      actorId: TUTOR_ID,
      payload: { phase: 2, isFirstSubmit: true, subjectCount: 3, hasIntroVideo: true, hasPhoto: true },
    });

    expect(track.events).toHaveLength(1);
    expect(track.events[0]).toMatchObject({
      event: "tutor_profile_created",
      tutorUserId: TUTOR_ID,
      subjectCount: 3,
      hasIntroVideo: true,
      hasPhoto: true,
    });
  });
});

describe("runSubmitProfile — re-submit after changes-requested", () => {
  it("UPDATEs the existing tutor_profiles row and does NOT re-fire tutor_profile_created", async () => {
    const { db, track, deps } = makeDeps();
    db.queueSelect([
      {
        id: "tp-existing",
        vettingStatus: "changes-requested",
        introVideoR2Key: `intros/${TUTOR_ID}/old.mp4`,
      },
    ]);
    // tutor_documents UPDATE returning → matched 1 row (patch H9, 2026-05-13).
    db.queueReturning([{ id: "td-existing" }]);
    db.queueSelect([{ phase: 2 }]);

    const result = await runSubmitProfile(VALID_INPUT, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isFirstSubmit).toBe(false);
    expect(result.tutorProfileId).toBe("tp-existing");

    expect(db.insertedInto(tutorProfiles)).toHaveLength(0);
    expect(db.updatedAt(tutorProfiles)).toHaveLength(1);
    expect(db.updatedAt(tutorProfiles)[0]?.set).toMatchObject({
      vettingStatus: "pending",
      isActive: false,
    });

    // Wizard state was already at phase=2 → UPDATE, not INSERT.
    expect(db.updatedAt(tutorWizardState)).toHaveLength(1);

    expect(track.events).toHaveLength(0);
  });
});

describe("runSubmitProfile — validation failures", () => {
  it.each([
    ["empty subjects array", { subjects: [] }, "subjects"],
    // Story 2.10 amendment 2026-05-16: the upper-bound subject cap was
    // dropped (SUBJECTS_MAX raised to 100 acting as a guard rail) per
    // founder direction. Only the minimum-1 constraint stays.
    ["longBio under 50 chars", { longBio: "קצר מדי" }, "longBio"],
    ["longBio over 1000 chars", { longBio: "x".repeat(1001) }, "longBio"],
    ["shortBio under 30 chars", { shortBio: "קצר" }, "shortBio"],
    ["tagline under 4 chars", { tagline: "אב" }, "tagline"],
    ["tagline over 60 chars", { tagline: "x".repeat(61) }, "tagline"],
    ["price45 of 0", { prices: { 45: 0, 60: 180, 75: null, 90: null } }, "price45Ils"],
    ["price60 of 0", { prices: { 45: 140, 60: 0, 75: null, 90: null } }, "price60Ils"],
    ["price60 over cap", { prices: { 45: 140, 60: 50_000, 75: null, 90: null } }, "price60Ils"],
    // Story 2.10 follow-up 2026-05-17: cross-length consistency (price45 < price60) was dropped.
    // The previous "price45 ≥ price60 → error" test case no longer applies.
    ["no lengths offered at all", { prices: { 45: null, 60: null, 75: null, 90: null } }, "prices"],
    // Story 2.11 (2026-05-18): intro video is now OPTIONAL — no error when missing.
    // Photo is now REQUIRED (was optional).
    ["missing photo", { photoR2Key: undefined }, "photoR2Key"],
    ["display name under 2 chars", { displayName: "א" }, "displayName"],
  ])("rejects %s", async (_name, overrideInput, expectedField) => {
    const { db, deps } = makeDeps();
    const result = await runSubmitProfile({ ...VALID_INPUT, ...overrideInput }, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.[expectedField as keyof typeof result.fieldErrors]).toBeDefined();
    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });
});

describe("runSubmitProfile — subject taxonomy desync", () => {
  it("returns form-level error when a slug is unknown to the taxonomy lookup", async () => {
    const { db, deps } = makeDeps({
      getSubjectIdsBySlug: async () => new Map(), // no slugs known
    });

    const result = await runSubmitProfile(VALID_INPUT, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toMatch(/אחד המקצועות/);
    expect(db.inserts).toHaveLength(0);
  });
});

describe("runSubmitProfile — DB transaction failure", () => {
  it("returns formError on transaction reject; no analytics fired", async () => {
    const { db, track, deps } = makeDeps();
    db.failNext = new Error("simulated DB outage");

    const result = await runSubmitProfile(VALID_INPUT, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toMatch(/אירעה שגיאה/);
    expect(track.events).toHaveLength(0);
  });
});

describe("runSaveDraft", () => {
  it("INSERTs a new wizard state row + audit when none exists", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]); // no existing wizard state

    const result = await runSaveDraft(
      { displayName: "טיוטה חלקית", subjects: ["mathematics"] },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedAt).toEqual(new Date("2026-05-12T10:00:00.000Z"));

    expect(db.insertedInto(tutorWizardState)).toHaveLength(1);
    expect(db.insertedInto(tutorWizardState)[0]?.value).toMatchObject({
      userId: TUTOR_ID,
      phase: 2,
      completedAt: null,
      data: { displayName: "טיוטה חלקית", subjects: ["mathematics"] },
    });

    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)[0]?.value).toMatchObject({
      eventType: "tutor.profile_draft_saved",
    });
  });

  it("UPDATEs an existing phase-2 row instead of inserting", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([{ phase: 2 }]);

    const result = await runSaveDraft({ longBio: "עוד טיוטה" }, deps);

    expect(result.ok).toBe(true);
    expect(db.insertedInto(tutorWizardState)).toHaveLength(0);
    expect(db.updatedAt(tutorWizardState)).toHaveLength(1);
    expect(db.updatedAt(tutorWizardState)[0]?.set).toMatchObject({
      data: { longBio: "עוד טיוטה" },
    });
  });

  it("returns formError when DB transaction fails", async () => {
    const { db, deps } = makeDeps();
    db.failNext = new Error("simulated DB outage");

    const result = await runSaveDraft({ longBio: "טיוטה" }, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toMatch(/שמירה אוטומטית/);
  });
});
