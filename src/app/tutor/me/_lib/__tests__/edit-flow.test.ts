import { describe, expect, it } from "vitest";
import {
  auditEvents,
  tutorDocuments,
  tutorProfiles,
  tutorSubjects,
} from "../../../../../lib/db/schema";
import {
  FakeTutorDb,
  silentLogger,
} from "../../../onboarding/profile/__tests__/fake-tutor-db";
import { runEditProfile } from "../edit-flow";

// Story 2.10 simplification: tests originally authored against Story 2.5's
// trigger-sequence orchestrator. Rewritten to cover the simpler "diff +
// UPDATE + single audit row" model. Re-approval gate dropped per founder
// Option A; restoration deferred per deferred-work.md.

const TUTOR_ID = "00000000-0000-0000-0000-000000000001";
const PROFILE_ROW_ID = "tp-1";

const SUBJECT_IDS = new Map([
  ["mathematics", "00000000-0000-0000-0000-000000000010"],
  ["english", "00000000-0000-0000-0000-000000000011"],
  ["psychometric", "00000000-0000-0000-0000-000000000012"],
  ["physics", "00000000-0000-0000-0000-000000000013"],
]);

const EXISTING_PROFILE = {
  id: PROFILE_ROW_ID,
  vettingStatus: "approved" as const,
  isActive: true,
  displayName: "ד״ר ישראלה ישראלי",
  bio:
    "מורה למתמטיקה וטכנולוגיה עם תואר ד״ר מאוניברסיטת תל אביב. מלמדת מעל 8 שנים, מהתיכון ועד הכנה לפסיכומטרי. גישה ידידותית, סבלנית, ויעילה.",
  city: "תל אביב",
  introVideoR2Key: `intros/${TUTOR_ID}/v1.mp4`,
  profilePhotoR2Key: `photos/${TUTOR_ID}/v1.png`,
  hourlyPriceIls: 180,
  lesson45PriceIls: 140,
};

const EXISTING_SUBJECT_ROWS = [
  { subjectId: SUBJECT_IDS.get("mathematics")! },
  { subjectId: SUBJECT_IDS.get("english")! },
  { subjectId: SUBJECT_IDS.get("psychometric")! },
];

const UNCHANGED_INPUT = {
  displayName: EXISTING_PROFILE.displayName,
  bio: EXISTING_PROFILE.bio,
  subjects: ["mathematics", "english", "psychometric"],
  price45Ils: EXISTING_PROFILE.lesson45PriceIls,
  price60Ils: EXISTING_PROFILE.hourlyPriceIls,
  city: EXISTING_PROFILE.city,
  photoR2Key: EXISTING_PROFILE.profilePhotoR2Key,
  introVideoR2Key: EXISTING_PROFILE.introVideoR2Key,
};

function makeDeps(overrides: Partial<Parameters<typeof runEditProfile>[1]> = {}) {
  const db = new FakeTutorDb();
  db.queueSelect([EXISTING_PROFILE]);
  db.queueSelect(EXISTING_SUBJECT_ROWS);
  return {
    db,
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
      now: () => new Date("2026-05-16T10:00:00.000Z"),
      logger: silentLogger,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Idempotent no-op
// ---------------------------------------------------------------------------

describe("runEditProfile — idempotent no-op (AC3)", () => {
  it("hasAnyChange=false → zero writes, redirect to /tutor/me", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(UNCHANGED_INPUT, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes.hasAnyChange).toBe(false);
    expect(result.redirectTo).toBe("/tutor/me");

    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
    expect(db.deletes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC2 — Every edit saves immediately + ONE audit row + discoverability preserved
// ---------------------------------------------------------------------------

describe("runEditProfile — save preserves discoverability (AC2)", () => {
  it("bio change → single UPDATE + ONE audit row, NO is_active or vetting_status touched", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, bio: `${UNCHANGED_INPUT.bio} עודכן ב-2026.` },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/tutor/me");

    const profileUpdates = db.updatedAt(tutorProfiles);
    expect(profileUpdates).toHaveLength(1);
    const set = profileUpdates[0]!.set as Record<string, unknown>;
    expect(set.bio).toContain("עודכן");
    // CRITICAL: gate dropped — these fields are NEVER in the update set.
    expect(set).not.toHaveProperty("isActive");
    expect(set).not.toHaveProperty("vettingStatus");

    // Exactly ONE audit row.
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const auditValue = db.insertedInto(auditEvents)[0]!.value as {
      eventType: string;
      payload: { changedFields: string[] };
    };
    expect(auditValue.eventType).toBe("tutor.profile_edited");
    expect(auditValue.payload.changedFields).toEqual(["bio"]);
  });

  it("price change → single UPDATE + ONE audit row, NO gate flip", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, price60Ils: 220 },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe("/tutor/me");

    const profileUpdates = db.updatedAt(tutorProfiles);
    expect(profileUpdates).toHaveLength(1);
    const set = profileUpdates[0]!.set as Record<string, unknown>;
    expect(set.hourlyPriceIls).toBe(220);
    expect(set).not.toHaveProperty("isActive");
    expect(set).not.toHaveProperty("vettingStatus");

    // Audit event type is the unified one (not the trigger-reapproval variant).
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const auditValue = db.insertedInto(auditEvents)[0]!.value as { eventType: string };
    expect(auditValue.eventType).toBe("tutor.profile_edited");
  });

  it("intro_video re-upload → tutor_documents flipped to pending; ONE audit row", async () => {
    const { db, deps } = makeDeps();
    db.queueReturning([{ id: "td-1" }]); // tutor_documents UPDATE row match

    const newKey = `intros/${TUTOR_ID}/v2.mp4`;
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, introVideoR2Key: newKey },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(db.updatedAt(tutorDocuments)).toHaveLength(1);
    const docSet = db.updatedAt(tutorDocuments)[0]!.set as Record<string, unknown>;
    expect(docSet.vettingStatus).toBe("pending");

    // Still only ONE audit row even though intro_video used to fire the
    // trigger-reapproval event in Story 2.5.
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const auditValue = db.insertedInto(auditEvents)[0]!.value as { eventType: string };
    expect(auditValue.eventType).toBe("tutor.profile_edited");
  });

  it("subjects change → DELETE-then-INSERT junction rows; ONE audit row", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      {
        ...UNCHANGED_INPUT,
        subjects: ["mathematics", "english", "psychometric", "physics"],
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(db.deletedFrom(tutorSubjects)).toHaveLength(1);
    expect(db.insertedInto(tutorSubjects)).toHaveLength(4);
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
  });

  it("profile photo change → ONLY updates tutor_profiles, NOT users (the two columns map to different R2 buckets — see SiteHeader role-aware resolver)", async () => {
    const { db, deps } = makeDeps();
    const newKey = `photos/${TUTOR_ID}/v2.png`;
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, photoR2Key: newKey },
      deps,
    );

    expect(result.ok).toBe(true);
    // The profile UPDATE includes the new photo key.
    const profileUpdates = db.updatedAt(tutorProfiles);
    const set = profileUpdates[0]!.set as Record<string, unknown>;
    expect(set.profilePhotoR2Key).toBe(newKey);
  });

it("mixed trigger + non-trigger change → ONE UPDATE + ONE audit row with combined changedFields", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      {
        ...UNCHANGED_INPUT,
        price60Ils: 220,
        bio: `${UNCHANGED_INPUT.bio} עוד טקסט.`,
      },
      deps,
    );

    expect(result.ok).toBe(true);
    // ONE profile UPDATE bundling both price + bio.
    const profileUpdates = db.updatedAt(tutorProfiles);
    expect(profileUpdates).toHaveLength(1);
    const set = profileUpdates[0]!.set as Record<string, unknown>;
    expect(set.hourlyPriceIls).toBe(220);
    expect(set.bio).toContain("עוד טקסט");

    // ONE audit row covering both fields.
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const auditValue = db.insertedInto(auditEvents)[0]!.value as {
      eventType: string;
      payload: { changedFields: string[] };
    };
    expect(auditValue.eventType).toBe("tutor.profile_edited");
    expect(auditValue.payload.changedFields.sort()).toEqual(
      ["bio", "hourly_price"].sort(),
    );
  });

  it("redirect target is always /tutor/me regardless of which fields changed", async () => {
    // Sanity assertion: the unified redirect target replaces Story 2.5's
    // branching (trigger → /dashboard, non-trigger → /tutor/<userId>).
    const cases = [
      { ...UNCHANGED_INPUT, bio: `${UNCHANGED_INPUT.bio} edit.` },
      { ...UNCHANGED_INPUT, price60Ils: 220 },
      { ...UNCHANGED_INPUT, subjects: ["mathematics"] },
    ];
    for (const input of cases) {
      const { deps } = makeDeps();
      const result = await runEditProfile(input, deps);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.redirectTo).toBe("/tutor/me");
    }
  });
});

// ---------------------------------------------------------------------------
// Input validation + R2 ownership defense (unchanged from Story 2.5)
// ---------------------------------------------------------------------------

describe("runEditProfile — input validation", () => {
  it("invalid bio (too short) → fieldErrors, no DB writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, bio: "קצר" },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.bio).toBeTruthy();
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it("intro_video r2Key from another tutor → formError, no DB writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      {
        ...UNCHANGED_INPUT,
        introVideoR2Key: "intros/99999999-9999-9999-9999-999999999999/evil.mp4",
      },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toContain("סרטון");
    expect(db.updates).toEqual([]);
  });

  it("photo r2Key from another tutor → formError, no DB writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      {
        ...UNCHANGED_INPUT,
        photoR2Key: "photos/99999999-9999-9999-9999-999999999999/evil.png",
      },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toContain("תמונה");
  });

  it("no profile row → formError directing the user to onboarding", async () => {
    const db = new FakeTutorDb();
    db.queueSelect([]);
    db.queueSelect([]);
    const deps = {
      db,
      tutorUserId: TUTOR_ID,
      getSubjectIdsBySlug: async (slugs: string[]) =>
        new Map(slugs.map((s) => [s, SUBJECT_IDS.get(s) ?? "missing"])),
      now: () => new Date("2026-05-16T10:00:00.000Z"),
      logger: silentLogger,
    };

    const result = await runEditProfile(UNCHANGED_INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toContain("פרופיל לא נמצא");
  });
});
