// Pure orchestrator for Story 2.10's tutor-profile-edit Server Action.
// FakeDb-tested via edit-flow.test.ts. `actions.ts` ("use server") is the
// thin Next.js wrapper that builds the real dependencies and converts the
// outcome into a redirect / state return.
//
// Originally authored as part of Story 2.5 with a re-approval trigger
// sequence (Story 2.3 AC4: is_active=false FIRST → vetting_status=pending
// → trigger updates → non-trigger → 2 audit rows). Story 2.10 SIMPLIFIES
// the orchestrator: every edit saves immediately, profile stays
// discoverable, ONE audit row written. The re-approval gate is dropped
// for closed-beta and restored before public go-live (see
// deferred-work.md "Restore re-approval gate (FR14) before public
// go-live").
//
// The `categorize-changes.ts` helper still returns the
// `triggerChanges` / `nonTriggerChanges` split — kept in the return
// shape as a FORWARD-COMPAT HOOK so the gate-restoration story (pre-go-live)
// can re-introduce the trigger sequence as a ~50-line orchestrator diff
// without rewriting the helper.

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
  gender: "male" | "female";
  bio: string | null;
  city: string | null;
  introVideoR2Key: string | null;
  profilePhotoR2Key: string | null;
  hourlyPriceIls: number | null;
  lesson45PriceIls: number | null;
  lesson75PriceIls: number | null;
  lesson90PriceIls: number | null;
}

// The select aliases `tutor_subjects.subject_id` (a UUID FK to subjects.id).
// Field name mirrors the underlying column, NOT the slug — the UUID is
// translated to a slug via `idToSlug` below.
interface ExistingSubjectLookup {
  subjectId: string;
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

  // Defense-in-depth R2-key ownership check. The action layer also guards;
  // refusing here means a misbehaving client cannot smuggle another tutor's
  // r2Key through the edit flow either.
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
        gender: tutorProfiles.gender,
        bio: tutorProfiles.bio,
        city: tutorProfiles.city,
        introVideoR2Key: tutorProfiles.introVideoR2Key,
        profilePhotoR2Key: tutorProfiles.profilePhotoR2Key,
        hourlyPriceIls: tutorProfiles.hourlyPriceIls,
        lesson45PriceIls: tutorProfiles.lesson45PriceIls,
        lesson75PriceIls: tutorProfiles.lesson75PriceIls,
        lesson90PriceIls: tutorProfiles.lesson90PriceIls,
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

    // 2. Load existing subjects so the categorize helper can compare sets.
    const existingSubjectRows = (await db
      .select({ subjectId: tutorSubjects.subjectId })
      .from(tutorSubjects)
      .where(eq(tutorSubjects.tutorUserId, deps.tutorUserId))) as ExistingSubjectLookup[];

    // Invert the (slug → id) map. Taxonomy entries deleted between original
    // submit and this edit appear as ids without a slug — treat them with a
    // placeholder so the diff catches the change.
    const idToSlug = new Map<string, string>();
    for (const [slug, id] of subjectIds.entries()) idToSlug.set(id, slug);
    const existingSlugs = existingSubjectRows.map(
      (row) => idToSlug.get(row.subjectId) ?? `__unknown_${row.subjectId}`,
    );

    // 3. Diff old vs new. The trigger/non-trigger split in the return shape
    //    is FORWARD-COMPAT only — Story 2.10 ignores the distinction. When
    //    the re-approval gate is restored before public go-live, this split
    //    is what the trigger-sequence write order keys off (see
    //    deferred-work.md).
    const oldValues: ProfileValues = {
      displayName: existing.displayName,
      gender: existing.gender,
      bio: existing.bio ?? "",
      city: existing.city ?? "",
      profilePhotoR2Key: existing.profilePhotoR2Key,
      introVideoR2Key: existing.introVideoR2Key,
      hourlyPriceIls: existing.hourlyPriceIls,
      lesson45PriceIls: existing.lesson45PriceIls,
      lesson75PriceIls: existing.lesson75PriceIls,
      lesson90PriceIls: existing.lesson90PriceIls,
      subjects: existingSlugs,
    };
    const newValues: ProfileValues = {
      displayName: input.displayName,
      gender: input.gender,
      bio: input.bio,
      city: input.city ?? "",
      profilePhotoR2Key: input.photoR2Key,
      introVideoR2Key: input.introVideoR2Key,
      hourlyPriceIls: input.prices[60],
      lesson45PriceIls: input.prices[45],
      lesson75PriceIls: input.prices[75],
      lesson90PriceIls: input.prices[90],
      subjects: input.subjects,
    };
    const changes = categorizeChanges(oldValues, newValues);

    // 4. Idempotent no-op: nothing changed, no DB writes, no audit row.
    if (!changes.hasAnyChange) {
      return {
        ok: true,
        changes,
        redirectTo: "/tutor/me",
      };
    }

    // 5. Single UPDATE on tutor_profiles for every changed scalar field.
    //    Bundle trigger + non-trigger fields together — they're all just
    //    "fields that changed" under the simplified Story 2.10 model.
    const profileUpdateSet: Record<string, unknown> = {};
    const allChanges = [
      ...changes.triggerChanges,
      ...changes.nonTriggerChanges,
    ];
    if (allChanges.includes("display_name")) profileUpdateSet.displayName = input.displayName;
    if (allChanges.includes("gender")) profileUpdateSet.gender = input.gender;
    if (allChanges.includes("bio")) profileUpdateSet.bio = input.bio;
    if (allChanges.includes("city")) profileUpdateSet.city = input.city;
    if (allChanges.includes("profile_photo")) profileUpdateSet.profilePhotoR2Key = input.photoR2Key;
    if (allChanges.includes("intro_video")) profileUpdateSet.introVideoR2Key = input.introVideoR2Key;
    if (allChanges.includes("hourly_price")) profileUpdateSet.hourlyPriceIls = input.prices[60];
    if (allChanges.includes("lesson_45_price")) profileUpdateSet.lesson45PriceIls = input.prices[45];
    if (allChanges.includes("lesson_75_price")) profileUpdateSet.lesson75PriceIls = input.prices[75];
    if (allChanges.includes("lesson_90_price")) profileUpdateSet.lesson90PriceIls = input.prices[90];

    if (Object.keys(profileUpdateSet).length > 0) {
      profileUpdateSet.updatedAt = deps.now();
      profileUpdateSet.updatedByKind = "user";
      profileUpdateSet.updatedByActor = deps.tutorUserId;
      await db
        .update(tutorProfiles)
        .set(profileUpdateSet)
        .where(eq(tutorProfiles.id, existing.id));
    }

    // 6. Subjects — DELETE-then-INSERT (same pattern Story 2.1's submit uses).
    if (allChanges.includes("subjects")) {
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

    // 7. Intro-video re-upload — flip the tutor_documents row back to
    //    pending so the eventual admin queue (Story 2.4) can surface it
    //    for review. Story 2.10's "no gate" model still keeps this signal
    //    intact so a future gate restoration (deferred-work.md) doesn't
    //    have to re-thread the document state.
    if (allChanges.includes("intro_video")) {
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

    // 8. ONE audit row covering every changed field. Story 2.5 wrote two
    //    rows (trigger + non-trigger) because the gate distinguished them;
    //    Story 2.10 collapses to a single `tutor.profile_edited` event
    //    with `changedFields` listing every field that moved.
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "tutor.profile_edited",
        actorKind: "user",
        actorId: deps.tutorUserId,
        targetType: "tutor_profile",
        targetId: existing.id,
        payload: {
          changedFields: allChanges,
        },
      }),
    );

    // 9. Redirect to /tutor/me — the tutor lands back on their Profile tab
    //    with the fresh values. Story 2.5 redirected to /dashboard on
    //    trigger flows and /tutor/<userId> on non-trigger flows; both of
    //    those branches collapse here since every edit preserves
    //    discoverability and the dashboard now redirects tutors to
    //    /tutor/me anyway.
    return {
      ok: true,
      changes,
      redirectTo: "/tutor/me",
    };
  } catch (err) {
    log.error("[runEditProfile] sequential writes failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב בעוד דקה." };
  }
}
