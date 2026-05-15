// Pure orchestrator for Story 2.5's profile-edit Server Action.
// FakeDb-tested via edit-flow.test.ts. `actions.ts` ("use server") is the
// thin Next.js wrapper that builds the real dependencies and converts the
// outcome into a redirect / state return.
//
// The load-bearing logic is the change categorization (see
// `categorize-changes.ts`) plus Story 2.3 AC4's trigger-sequence write order:
//
//   1. UPDATE tutor_profiles SET is_active = false   (FIRST — partial failure
//                                                     leaves invisible-but-stale)
//   2. UPDATE tutor_profiles SET vetting_status = 'pending'
//   3. Trigger-field UPDATEs (intro video / prices / subjects)
//   4. Non-trigger-field UPDATEs (display_name / bio / city / photo)
//   5. INSERT audit_events (event_type='tutor.profile_edit_triggered_reapproval')
//   6. INSERT audit_events (event_type='tutor.profile_edited') — only if
//      non-trigger fields ALSO changed
//
// Audit goes LAST so a partial failure never leaves a "we vetted this" trail
// for data that hasn't been written yet — same outside-cleanup placement
// Stories 1.21 and 1.22 established.

import { and, eq } from "drizzle-orm";
import {
  tutorProfiles,
  tutorSubjects,
  tutorDocuments,
  auditEvents,
} from "../../../../lib/db/schema";
import { toAuditEventValues } from "../../../../lib/db/audit";
import {
  PROFILE_FORM_LIMITS,
  parseSubmitInput,
  type ProfileDraftInput,
  type ProfileFieldErrors,
} from "../../onboarding/profile/profile-form-schema";
import type { TutorDb } from "../../onboarding/profile/profile-flow";
import {
  categorizeChanges,
  type CategorizedChanges,
  type ProfileValues,
} from "./categorize-changes";

// --- Result type -----------------------------------------------------------

export type EditProfileFlowResult =
  | {
      ok: true;
      changes: CategorizedChanges;
      /** Where the action should redirect after a successful save. */
      redirectTo: string;
    }
  | { ok: false; formError?: string; fieldErrors?: ProfileFieldErrors };

// --- Deps ------------------------------------------------------------------

export interface EditProfileDeps {
  db: TutorDb;
  tutorUserId: string;
  /** Resolves `{slug → subjectId}` for the requested slugs. */
  getSubjectIdsBySlug: (slugs: string[]) => Promise<Map<string, string>>;
  now: () => Date;
  logger?: { error: (message: string, err?: unknown) => void };
}

// --- Internal shapes -------------------------------------------------------

interface ExistingProfileLookup {
  id: string;
  vettingStatus: "pending" | "approved" | "rejected" | "paused";
  isActive: boolean;
  displayName: string;
  bio: string | null;
  city: string | null;
  introVideoR2Key: string | null;
  profilePhotoR2Key: string | null;
  hourlyPriceIls: number;
  lesson45PriceIls: number | null;
}

interface ExistingSubjectLookup {
  subjectSlug: string;
}

// --- Orchestrator ----------------------------------------------------------

export async function runEditProfile(
  raw: ProfileDraftInput,
  deps: EditProfileDeps,
): Promise<EditProfileFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };

  const parsed = parseSubmitInput(raw);
  if (!parsed.ok) {
    return { ok: false, fieldErrors: parsed.fieldErrors };
  }
  const input = parsed.value;

  // Defense-in-depth R2-key ownership check — same shape as
  // `runSubmitProfile`. Even if the action layer also guards, refusing here
  // means an attacker cannot smuggle another tutor's r2Key through the edit
  // flow either.
  if (!input.introVideoR2Key.startsWith(`intros/${deps.tutorUserId}/`)) {
    log.error(
      `[runEditProfile] intro_video r2Key does not match tutor prefix: ${input.introVideoR2Key}`,
    );
    return { ok: false, formError: "מפתח R2 של סרטון לא תקין." };
  }
  if (input.photoR2Key !== null && !input.photoR2Key.startsWith(`photos/${deps.tutorUserId}/`)) {
    log.error(
      `[runEditProfile] photo r2Key does not match tutor prefix: ${input.photoR2Key}`,
    );
    return { ok: false, formError: "מפתח R2 של תמונה לא תקין." };
  }

  if (input.bio.trim().length > PROFILE_FORM_LIMITS.BIO_MAX_CHARS) {
    return { ok: false, fieldErrors: { bio: "ביוגרפיה ארוכה מדי." } };
  }

  let subjectIds: Map<string, string>;
  try {
    subjectIds = await deps.getSubjectIdsBySlug(input.subjects);
  } catch (err) {
    log.error("[runEditProfile] subject lookup failed", err);
    return { ok: false, formError: "אירעה שגיאה בטעינת המקצועות. נסו שוב." };
  }
  const missing = input.subjects.filter((slug) => !subjectIds.has(slug));
  if (missing.length > 0) {
    log.error(`[runEditProfile] unknown subject slugs: ${missing.join(",")}`);
    return { ok: false, formError: "אחד המקצועות לא נמצא. רעננו את העמוד ונסו שוב." };
  }

  try {
    const db = deps.db;

    // 1. Load existing profile row.
    const existingRows = (await db
      .select({
        id: tutorProfiles.id,
        vettingStatus: tutorProfiles.vettingStatus,
        isActive: tutorProfiles.isActive,
        displayName: tutorProfiles.displayName,
        bio: tutorProfiles.bio,
        city: tutorProfiles.city,
        introVideoR2Key: tutorProfiles.introVideoR2Key,
        profilePhotoR2Key: tutorProfiles.profilePhotoR2Key,
        hourlyPriceIls: tutorProfiles.hourlyPriceIls,
        lesson45PriceIls: tutorProfiles.lesson45PriceIls,
      })
      .from(tutorProfiles)
      .where(eq(tutorProfiles.userId, deps.tutorUserId))) as ExistingProfileLookup[];

    const existing = existingRows[0] ?? null;
    if (existing === null) {
      // Edit assumes a prior submission. The page guards against this, but
      // the orchestrator returns a clean error if a race or test bypass
      // calls this without a profile row.
      log.error("[runEditProfile] no tutor_profiles row for user");
      return { ok: false, formError: "פרופיל לא נמצא. השלימו תחילה את אשף ההצטרפות." };
    }

    // 2. Load existing subjects (slug set) — paired with the SUBJECT_IDS map
    //    via the inverse mapping below.
    const existingSubjectRows = (await db
      .select({ subjectSlug: tutorSubjects.subjectId })
      .from(tutorSubjects)
      .where(eq(tutorSubjects.tutorUserId, deps.tutorUserId))) as ExistingSubjectLookup[];

    // Invert the (slug → id) map so we can translate existing tutor_subjects'
    // subject_id back to slugs. Subject taxonomy entries deleted between the
    // tutor's original submit and this edit (admin hidden a subject) appear
    // as ids without a slug — treat those as a deleted subject, contributing
    // a placeholder slug so the diff catches them as "the set changed".
    const idToSlug = new Map<string, string>();
    for (const [slug, id] of subjectIds.entries()) idToSlug.set(id, slug);
    const existingSlugs = existingSubjectRows.map(
      (row) => idToSlug.get(row.subjectSlug) ?? `__unknown_${row.subjectSlug}`,
    );

    // 3. Build the categorized change set.
    const oldValues: ProfileValues = {
      displayName: existing.displayName,
      bio: existing.bio ?? "",
      city: existing.city ?? "",
      profilePhotoR2Key: existing.profilePhotoR2Key,
      introVideoR2Key: existing.introVideoR2Key,
      hourlyPriceIls: existing.hourlyPriceIls,
      lesson45PriceIls: existing.lesson45PriceIls,
      subjects: existingSlugs,
    };
    const newValues: ProfileValues = {
      displayName: input.displayName,
      bio: input.bio,
      city: input.city ?? "",
      profilePhotoR2Key: input.photoR2Key,
      introVideoR2Key: input.introVideoR2Key,
      hourlyPriceIls: input.price60Ils,
      lesson45PriceIls: input.price45Ils,
      subjects: input.subjects,
    };
    const changes = categorizeChanges(oldValues, newValues);

    // 4. Idempotent no-op: nothing changed, no DB writes, no audit row.
    if (!changes.hasAnyChange) {
      return {
        ok: true,
        changes,
        redirectTo: `/tutor/${deps.tutorUserId}`,
      };
    }

    const hasTriggerChange = changes.triggerChanges.length > 0;

    // 5. Trigger-sequence — Story 2.3 AC4 contract.
    //    Each step is its own UPDATE so partial failures land in safe states
    //    (invisible-but-stale). Audit goes last.
    if (hasTriggerChange) {
      // 5a. is_active=false FIRST. Idempotent if already false.
      await db
        .update(tutorProfiles)
        .set({
          isActive: false,
          updatedAt: deps.now(),
          updatedByKind: "user",
          updatedByActor: deps.tutorUserId,
        })
        .where(eq(tutorProfiles.id, existing.id));

      // 5b. vetting_status='pending'.
      await db
        .update(tutorProfiles)
        .set({
          vettingStatus: "pending",
          updatedAt: deps.now(),
          updatedByKind: "user",
          updatedByActor: deps.tutorUserId,
        })
        .where(eq(tutorProfiles.id, existing.id));
    }

    // 6. Trigger-field updates. Group all profile-row trigger fields into one
    //    UPDATE so we don't trigger a half-priced state on partial failure.
    const triggerProfileSet: Record<string, unknown> = {};
    if (changes.triggerChanges.includes("intro_video")) {
      triggerProfileSet.introVideoR2Key = input.introVideoR2Key;
    }
    if (changes.triggerChanges.includes("hourly_price")) {
      triggerProfileSet.hourlyPriceIls = input.price60Ils;
    }
    if (changes.triggerChanges.includes("lesson_45_price")) {
      triggerProfileSet.lesson45PriceIls = input.price45Ils;
    }
    if (Object.keys(triggerProfileSet).length > 0) {
      triggerProfileSet.updatedAt = deps.now();
      triggerProfileSet.updatedByKind = "user";
      triggerProfileSet.updatedByActor = deps.tutorUserId;
      await db
        .update(tutorProfiles)
        .set(triggerProfileSet)
        .where(eq(tutorProfiles.id, existing.id));
    }

    // 7. Subjects — DELETE-then-INSERT (same pattern Story 2.1's submit uses).
    if (changes.triggerChanges.includes("subjects")) {
      await db
        .delete(tutorSubjects)
        .where(eq(tutorSubjects.tutorUserId, deps.tutorUserId));
      for (const slug of input.subjects) {
        const subjectId = subjectIds.get(slug);
        if (!subjectId) {
          throw new Error(
            `[runEditProfile] invariant violation: slug ${slug} passed pre-check but not in subjectIds map`,
          );
        }
        await db.insert(tutorSubjects).values({
          tutorUserId: deps.tutorUserId,
          subjectId,
          createdByKind: "user",
          createdByActor: deps.tutorUserId,
        });
      }
    }

    // 8. Intro-video re-upload — re-confirm the tutor_documents row in
    //    pending state so admin queue (Story 2.4) surfaces it for review.
    //    Same DEFENSE-IN-DEPTH ownership filter as `runSubmitProfile`.
    if (changes.triggerChanges.includes("intro_video")) {
      const documentsUpdated = (await db
        .update(tutorDocuments)
        .set({
          vettingStatus: "pending",
          updatedAt: deps.now(),
          updatedByKind: "user",
          updatedByActor: deps.tutorUserId,
        })
        .where(
          and(
            eq(tutorDocuments.r2Key, input.introVideoR2Key),
            eq(tutorDocuments.tutorUserId, deps.tutorUserId),
          ),
        )
        .returning({ id: tutorDocuments.id })) as { id: string }[];
      if (documentsUpdated.length === 0) {
        throw new Error(
          "[runEditProfile] intro_video document not found — admin moved it or row was deleted",
        );
      }
    }

    // 9. Non-trigger-field updates. Group all into one UPDATE.
    const nonTriggerProfileSet: Record<string, unknown> = {};
    if (changes.nonTriggerChanges.includes("display_name")) {
      nonTriggerProfileSet.displayName = input.displayName;
    }
    if (changes.nonTriggerChanges.includes("bio")) {
      nonTriggerProfileSet.bio = input.bio;
    }
    if (changes.nonTriggerChanges.includes("city")) {
      nonTriggerProfileSet.city = input.city;
    }
    if (changes.nonTriggerChanges.includes("profile_photo")) {
      nonTriggerProfileSet.profilePhotoR2Key = input.photoR2Key;
    }
    if (Object.keys(nonTriggerProfileSet).length > 0) {
      nonTriggerProfileSet.updatedAt = deps.now();
      nonTriggerProfileSet.updatedByKind = "user";
      nonTriggerProfileSet.updatedByActor = deps.tutorUserId;
      await db
        .update(tutorProfiles)
        .set(nonTriggerProfileSet)
        .where(eq(tutorProfiles.id, existing.id));
    }

    // 10. Audit row(s). Trigger audit FIRST (matches AC2 ordering), then a
    //     separate non-trigger row when both kinds happened in the same save.
    if (hasTriggerChange) {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "tutor.profile_edit_triggered_reapproval",
          actorKind: "user",
          actorId: deps.tutorUserId,
          targetType: "tutor_profile",
          targetId: existing.id,
          payload: {
            changedFields: changes.triggerChanges,
            previousVettingStatus: existing.vettingStatus,
          },
        }),
      );
    }
    if (changes.nonTriggerChanges.length > 0) {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "tutor.profile_edited",
          actorKind: "user",
          actorId: deps.tutorUserId,
          targetType: "tutor_profile",
          targetId: existing.id,
          payload: {
            changedFields: changes.nonTriggerChanges,
          },
        }),
      );
    }

    // 11. Redirect target. Trigger flows route the tutor to /dashboard (the
    //     "in review" Card is the right next-state). Non-trigger flows route
    //     back to the public profile so the tutor sees their fresh values.
    return {
      ok: true,
      changes,
      redirectTo: hasTriggerChange ? "/dashboard" : `/tutor/${deps.tutorUserId}`,
    };
  } catch (err) {
    log.error("[runEditProfile] sequential writes failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב בעוד דקה." };
  }
}
