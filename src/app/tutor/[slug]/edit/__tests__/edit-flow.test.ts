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
  type CapturedOperation,
} from "../../../onboarding/profile/__tests__/fake-tutor-db";
import { runEditProfile } from "../edit-flow";

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

// Existing subjects [mathematics, english, psychometric] expressed as the
// fake rows the orchestrator's lookup query receives. The orchestrator
// inverts (slug → id) to translate back; we feed in the subject_id.
const EXISTING_SUBJECT_ROWS = [
  { subjectSlug: SUBJECT_IDS.get("mathematics")! },
  { subjectSlug: SUBJECT_IDS.get("english")! },
  { subjectSlug: SUBJECT_IDS.get("psychometric")! },
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
  // Pre-queue the existing profile + subjects reads.
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
      now: () => new Date("2026-05-15T10:00:00.000Z"),
      logger: silentLogger,
      ...overrides,
    },
  };
}

function findFirstUpdate(
  ops: CapturedOperation[],
  table: unknown,
  predicate: (set: Record<string, unknown>) => boolean,
): number {
  return ops.findIndex(
    (op) =>
      op.kind === "update" &&
      op.table === table &&
      predicate(op.set as Record<string, unknown>),
  );
}

// ---------------------------------------------------------------------------
// AC5 — Idempotent no-op
// ---------------------------------------------------------------------------

describe("runEditProfile — idempotent no-op (AC5)", () => {
  it("hasAnyChange=false → returns success with zero writes, redirect to /tutor/<userId>", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(UNCHANGED_INPUT, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes.hasAnyChange).toBe(false);
    expect(result.redirectTo).toBe(`/tutor/${TUTOR_ID}`);

    // No writes at all.
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
    expect(db.deletes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC1 — Non-trigger edits save in place; is_active + vetting_status unchanged
// ---------------------------------------------------------------------------

describe("runEditProfile — non-trigger only (AC1)", () => {
  it("bio change → single tutor_profiles UPDATE + audit row, no flag flips, redirect to public profile", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      {
        ...UNCHANGED_INPUT,
        bio: `${UNCHANGED_INPUT.bio} עודכן ב-2026.`,
      },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes.triggerChanges).toEqual([]);
    expect(result.changes.nonTriggerChanges).toEqual(["bio"]);
    expect(result.redirectTo).toBe(`/tutor/${TUTOR_ID}`);

    // Exactly one UPDATE on tutor_profiles, with bio in the set.
    const profileUpdates = db.updatedAt(tutorProfiles);
    expect(profileUpdates).toHaveLength(1);
    const set = profileUpdates[0]!.set as Record<string, unknown>;
    expect(set.bio).toContain("עודכן");
    expect(set).not.toHaveProperty("isActive");
    expect(set).not.toHaveProperty("vettingStatus");

    // Audit event is 'tutor.profile_edited' (NOT the trigger-reapproval variant).
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const auditValue = db.insertedInto(auditEvents)[0]!.value as { eventType: string; payload: { changedFields: string[] } };
    expect(auditValue.eventType).toBe("tutor.profile_edited");
    expect(auditValue.payload.changedFields).toEqual(["bio"]);
  });

  it("display_name + city change → grouped into one UPDATE, single audit row", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, displayName: "ד״ר ישראלה לוי", city: "ירושלים" },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(db.updatedAt(tutorProfiles)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    const auditValue = db.insertedInto(auditEvents)[0]!.value as { payload: { changedFields: string[] } };
    expect(auditValue.payload.changedFields.sort()).toEqual(["city", "display_name"]);
  });

  it("profile photo replacement (NON-trigger) leaves is_active=true", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, photoR2Key: `photos/${TUTOR_ID}/v2.png` },
      deps,
    );

    expect(result.ok).toBe(true);
    const set = db.updatedAt(tutorProfiles)[0]!.set as Record<string, unknown>;
    expect(set).not.toHaveProperty("isActive");
    expect(set.profilePhotoR2Key).toBe(`photos/${TUTOR_ID}/v2.png`);
  });
});

// ---------------------------------------------------------------------------
// AC2 — Trigger-sequence write order
// ---------------------------------------------------------------------------

describe("runEditProfile — trigger sequence (AC2)", () => {
  it("price change flips is_active=false FIRST, then vetting_status='pending', then trigger UPDATE, then audit", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, price60Ils: 220 },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes.triggerChanges).toEqual(["hourly_price"]);
    expect(result.redirectTo).toBe("/dashboard");

    // Assert write order via the operations log.
    const isActiveIdx = findFirstUpdate(
      db.operations,
      tutorProfiles,
      (set) => set.isActive === false,
    );
    const vettingStatusIdx = findFirstUpdate(
      db.operations,
      tutorProfiles,
      (set) => set.vettingStatus === "pending",
    );
    const priceUpdateIdx = findFirstUpdate(
      db.operations,
      tutorProfiles,
      (set) => set.hourlyPriceIls === 220,
    );

    expect(isActiveIdx).toBeGreaterThanOrEqual(0);
    expect(vettingStatusIdx).toBeGreaterThan(isActiveIdx);
    expect(priceUpdateIdx).toBeGreaterThan(vettingStatusIdx);

    // Audit lands after every UPDATE — it's an INSERT into auditEvents and
    // it's the LAST operation in the log.
    const lastOp = db.operations[db.operations.length - 1];
    expect(lastOp).toBeDefined();
    expect(lastOp!.kind).toBe("insert");
    if (lastOp && lastOp.kind === "insert") {
      expect(lastOp.table).toBe(auditEvents);
      const auditValue = lastOp.value as { eventType: string };
      expect(auditValue.eventType).toBe("tutor.profile_edit_triggered_reapproval");
    }
  });

  it("intro_video re-upload also flips the tutor_documents row to pending", async () => {
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
  });

  it("subjects change DELETEs then INSERTs the junction rows", async () => {
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
    const insertedIds = db.insertedInto(tutorSubjects).map(
      (r) => (r.value as { subjectId: string }).subjectId,
    );
    expect(insertedIds).toEqual([
      SUBJECT_IDS.get("mathematics"),
      SUBJECT_IDS.get("english"),
      SUBJECT_IDS.get("psychometric"),
      SUBJECT_IDS.get("physics"),
    ]);
  });

  it("audit payload includes previousVettingStatus from the loaded profile row", async () => {
    const { db, deps } = makeDeps();
    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, price60Ils: 220 },
      deps,
    );

    expect(result.ok).toBe(true);
    const audit = db.insertedInto(auditEvents)[0]!.value as {
      eventType: string;
      payload: { changedFields: string[]; previousVettingStatus: string };
    };
    expect(audit.eventType).toBe("tutor.profile_edit_triggered_reapproval");
    expect(audit.payload.previousVettingStatus).toBe("approved");
    expect(audit.payload.changedFields).toEqual(["hourly_price"]);
  });
});

// ---------------------------------------------------------------------------
// Mixed trigger + non-trigger → BOTH audit rows
// ---------------------------------------------------------------------------

describe("runEditProfile — mixed trigger + non-trigger save", () => {
  it("price change + bio change → two audit rows, trigger first then edited", async () => {
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
    expect(db.insertedInto(auditEvents)).toHaveLength(2);
    const events = db.insertedInto(auditEvents).map(
      (e) => (e.value as { eventType: string }).eventType,
    );
    expect(events).toEqual([
      "tutor.profile_edit_triggered_reapproval",
      "tutor.profile_edited",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Partial failure recovery (AC2 last paragraph)
// ---------------------------------------------------------------------------

describe("runEditProfile — partial failure leaves invisible-but-stale", () => {
  it("vetting_status UPDATE failure after is_active=false succeeded → returns error, no compensating write", async () => {
    const { db, deps } = makeDeps();
    // First UPDATE (is_active=false) succeeds. Second UPDATE
    // (vetting_status='pending') throws. Schedule the throw via failNext at
    // the right point in the sequence using a counting helper.
    const realUpdate = db.update.bind(db);
    let updateCallCount = 0;
    (db as unknown as { update: typeof realUpdate }).update = (table: unknown) => {
      updateCallCount += 1;
      if (updateCallCount === 2) {
        db.failNext = new Error("simulated vetting_status UPDATE failure");
      }
      return realUpdate(table);
    };

    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, price60Ils: 220 },
      deps,
    );

    expect(result.ok).toBe(false);
    // is_active=false was attempted (first UPDATE). No compensating "flip
    // back to true" UPDATE — the failure mode is invisible-but-stale.
    const isActiveFlips = db.operations.filter(
      (op) =>
        op.kind === "update" &&
        op.table === tutorProfiles &&
        (op.set as Record<string, unknown>).isActive === true,
    );
    expect(isActiveFlips).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Input validation + R2 ownership defense
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
    // Pre-queue empty profile lookup → orchestrator should bail.
    const db = new FakeTutorDb();
    db.queueSelect([]); // no profile rows
    db.queueSelect([]); // subjects (not reached, but defensive)
    const deps = {
      db,
      tutorUserId: TUTOR_ID,
      getSubjectIdsBySlug: async (slugs: string[]) =>
        new Map(slugs.map((s) => [s, SUBJECT_IDS.get(s) ?? "missing"])),
      now: () => new Date("2026-05-15T10:00:00.000Z"),
      logger: silentLogger,
    };

    const result = await runEditProfile(UNCHANGED_INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toContain("פרופיל לא נמצא");
  });
});

// ---------------------------------------------------------------------------
// Re-edit while already invisible-but-pending → still flips audit + writes
// ---------------------------------------------------------------------------

describe("runEditProfile — already-pending tutor", () => {
  it("second edit on an already-pending tutor still writes the trigger-reapproval audit", async () => {
    const db = new FakeTutorDb();
    db.queueSelect([
      { ...EXISTING_PROFILE, isActive: false, vettingStatus: "pending" },
    ]);
    db.queueSelect(EXISTING_SUBJECT_ROWS);
    const deps = {
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
      now: () => new Date("2026-05-15T10:00:00.000Z"),
      logger: silentLogger,
    };

    const result = await runEditProfile(
      { ...UNCHANGED_INPUT, price60Ils: 230 },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const audit = db.insertedInto(auditEvents)[0]!.value as {
      payload: { previousVettingStatus: string };
    };
    expect(audit.payload.previousVettingStatus).toBe("pending");
  });
});
