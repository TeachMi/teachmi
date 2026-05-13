// Fixture helpers for the Story 2.3 intro-video discoverability gate E2E.
//
// Mirrors the password-reset.flow.ts pattern (Story 1.15): graceful skip when
// DATABASE_URL is unset, per-worker unique email, idempotent provisioning via
// direct Drizzle writes.
//
// Story 2.1 was expected to ship a `tutor-onboarding.flow.ts` with a
// `createVerifiedTutor` + `submitTutorProfile` fixture chain but did not.
// Rather than build the full wizard-driven fixture here (which would
// duplicate state-machine knowledge between 2.3 and a future 2.1 follow-up),
// we write tutor + tutor_profile rows directly. This is the same kind of
// test-only shortcut the password-reset fixture takes for `users` provisioning.

import type { TestInfo } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import {
  tutorDocuments,
  tutorProfiles,
  users,
} from "../../src/lib/db/schema";

const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export interface ProvisionedTutor {
  email: string;
  userId: string;
}

export function buildTutorEmail(testInfo: TestInfo): string {
  const runId = process.env.GITHUB_RUN_ID ?? "local";
  const worker = testInfo.workerIndex;
  return `tutor-discovery+${runId}-w${worker}@example.test`;
}

export async function provisionInactiveTutor(
  testInfo: TestInfo,
): Promise<ProvisionedTutor | null> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[tutor-discovery/fixture] refuses to run when NODE_ENV === 'production' — direct Drizzle writes.",
    );
  }
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const sql = neon(url);
  const db = drizzle(sql);

  const email = buildTutorEmail(testInfo);
  const passwordHash = await hash("not-used-2.3-test-only", ARGON2_OPTIONS);

  // Idempotent user provisioning.
  await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: "ד״ר מיכל לוי (E2E)",
      role: "tutor",
      emailVerified: new Date(),
      createdByKind: "system",
      createdByActor: "e2e-tutor-discovery-fixture",
    })
    .onConflictDoNothing({ target: users.email });

  // Restore a clean state if a prior test soft-deleted or paused this user.
  await db
    .update(users)
    .set({ deletedAt: null, role: "tutor", emailVerified: new Date() })
    .where(eq(users.email, email));

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  const userId = userRows[0]?.id;
  if (!userId) {
    throw new Error(`[tutor-discovery/fixture] failed to provision ${email}`);
  }

  // Provision a tutor_profiles row in the "fresh submit" state: is_active=false,
  // vetting_status='pending'. Idempotent — if a prior test landed an approved
  // state, reset to pending here.
  await db
    .insert(tutorProfiles)
    .values({
      userId,
      displayName: "ד״ר מיכל לוי (E2E)",
      bio: "מורה למתמטיקה — שיעורים פרטיים לבגרות.",
      city: "תל אביב",
      introVideoR2Key: `intros/${userId}/e2e-fixture.mp4`,
      profilePhotoR2Key: null,
      hourlyPriceIls: 180,
      lesson45PriceIls: 140,
      lessonLengthMinutes: 60,
      vettingStatus: "pending",
      isActive: false,
      createdByKind: "system",
      createdByActor: "e2e-tutor-discovery-fixture",
    })
    .onConflictDoNothing({ target: tutorProfiles.userId });

  await db
    .update(tutorProfiles)
    .set({
      vettingStatus: "pending",
      isActive: false,
      deletedAt: null,
    })
    .where(eq(tutorProfiles.userId, userId));

  // Ensure a single pending intro_video document row exists for the tutor.
  await db
    .insert(tutorDocuments)
    .values({
      tutorUserId: userId,
      docType: "intro_video",
      r2Key: `intros/${userId}/e2e-fixture.mp4`,
      mimeType: "video/mp4",
      sizeBytes: 1024,
      vettingStatus: "pending",
      createdByKind: "system",
      createdByActor: "e2e-tutor-discovery-fixture",
    })
    .onConflictDoNothing();

  return { email, userId };
}

/**
 * Simulate the Story 2.4 admin approval Server Action (which doesn't exist
 * yet). Match the ORDER documented in Story 2.3 spec AC3:
 *   1. tutor_documents.vetting_status = 'verified'
 *   2. tutor_profiles.vetting_status   = 'approved'
 *   3. tutor_profiles.is_active        = true
 *
 * Step 3 is LAST so a partial failure (network blip after step 2) leaves the
 * tutor recoverably-invisible rather than visible-with-unvetted-content.
 */
export async function simulateAdminApproval(userId: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for simulateAdminApproval");
  const sql = neon(url);
  const db = drizzle(sql);

  await db
    .update(tutorDocuments)
    .set({ vettingStatus: "verified", verifiedAt: new Date() })
    .where(
      and(
        eq(tutorDocuments.tutorUserId, userId),
        eq(tutorDocuments.docType, "intro_video"),
      ),
    );

  await db
    .update(tutorProfiles)
    .set({ vettingStatus: "approved", vettedAt: new Date() })
    .where(eq(tutorProfiles.userId, userId));

  await db
    .update(tutorProfiles)
    .set({ isActive: true })
    .where(eq(tutorProfiles.userId, userId));
}

/**
 * Simulate the Story 2.5 profile-edit re-upload trigger (doesn't exist yet).
 * Match the ORDER documented in Story 2.3 spec AC4:
 *   1. tutor_profiles.is_active = false (FIRST — invisible-but-stale is safe)
 *   2. tutor_profiles.vetting_status = 'pending'
 * (Then 2.5 would also UPDATE the tutor_documents.r2_key for the new intro
 * video — out of scope for this fixture; we just need the gate flip.)
 */
export async function simulateReuploadTrigger(userId: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for simulateReuploadTrigger");
  const sql = neon(url);
  const db = drizzle(sql);

  await db
    .update(tutorProfiles)
    .set({ isActive: false, vettingStatus: "pending" })
    .where(eq(tutorProfiles.userId, userId));
}

// ---------------------------------------------------------------------------
// Story 3.2 additions — seed subjects + availability for full-profile E2E tests.
// ---------------------------------------------------------------------------

import { subjects, tutorSubjects, tutorAvailability } from "../../src/lib/db/schema";

/**
 * Idempotently inserts subject taxonomy rows + tutor_subjects junction rows
 * for a fixture tutor. Subject slugs must already exist in the launch-subjects
 * seed (`pnpm db:seed`) — this helper looks them up by slug and creates the
 * junction. If a slug isn't in the seed, the junction insert is skipped.
 */
export async function seedTutorSubjects(
  tutorUserId: string,
  slugs: string[],
): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for seedTutorSubjects");
  const sql = neon(url);
  const db = drizzle(sql);

  for (const slug of slugs) {
    const subjectRows = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.slug, slug));
    const subjectId = subjectRows[0]?.id;
    if (!subjectId) continue;
    await db
      .insert(tutorSubjects)
      .values({
        tutorUserId,
        subjectId,
        proficiencyNote: null,
        createdByKind: "system",
        createdByActor: "e2e-tutor-discovery-fixture",
      })
      .onConflictDoNothing();
  }
}

/**
 * Inserts a recurring availability rule for the tutor on a given weekday +
 * time window. **Non-idempotent** — each call appends a new row regardless
 * of whether an identical row already exists (no UNIQUE constraint covers
 * the (tutor, kind, weekday, startTime, endTime) tuple). Tests MUST call
 * `clearTutorSeededData` first if they care about exact row counts or if
 * they run repeatedly against a shared dev/e2e DB.
 */
export async function seedRecurringAvailability(
  tutorUserId: string,
  weekday: number,
  startTime: string, // "HH:MM:SS"
  endTime: string,
): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for seedRecurringAvailability");
  const sql = neon(url);
  const db = drizzle(sql);

  await db.insert(tutorAvailability).values({
    tutorUserId,
    kind: "recurring",
    weekday,
    date: null,
    startTime,
    endTime,
    validFrom: null,
    validUntil: null,
    createdByKind: "system",
    createdByActor: "e2e-tutor-discovery-fixture",
  });
}

/**
 * Clears tutor_subjects and tutor_availability rows for a fixture tutor.
 * Use between tests that seed conflicting state.
 *
 * Scoped to `createdByActor = "e2e-tutor-discovery-fixture"` so this helper
 * does NOT nuke any developer's own seeded rows that might exist in a
 * shared dev DB. The seed helpers above stamp this actor on every row they
 * insert.
 */
export async function clearTutorSeededData(tutorUserId: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for clearTutorSeededData");
  const sql = neon(url);
  const db = drizzle(sql);

  const FIXTURE_ACTOR = "e2e-tutor-discovery-fixture";
  await db
    .delete(tutorSubjects)
    .where(
      and(
        eq(tutorSubjects.tutorUserId, tutorUserId),
        eq(tutorSubjects.createdByActor, FIXTURE_ACTOR),
      ),
    );
  await db
    .delete(tutorAvailability)
    .where(
      and(
        eq(tutorAvailability.tutorUserId, tutorUserId),
        eq(tutorAvailability.createdByActor, FIXTURE_ACTOR),
      ),
    );
}
