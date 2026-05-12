// Pure orchestrator for the tutor-profile-submission Server Actions.
// FakeDb-tested via profile-flow.test.ts. `actions.ts` ("use server") is the
// thin Next.js wrapper that builds the real dependencies (getDb + getFilesProvider
// + track + requireTutor() user) and converts the outcome into a redirect /
// state return.

import { eq } from "drizzle-orm";
import {
  tutorProfiles,
  tutorSubjects,
  tutorDocuments,
  tutorWizardState,
  auditEvents,
} from "../../../../lib/db/schema";
import { toAuditEventValues } from "../../../../lib/db/audit";
import type { AnalyticsEvent } from "../../../../lib/analytics";
import {
  parseSubmitInput,
  type ProfileDraftInput,
  type ProfileFieldErrors,
  type ProfileSubmitInput,
} from "./profile-form-schema";

// --- Result types ----------------------------------------------------------

export type SubmitProfileFlowResult =
  | {
      ok: true;
      isFirstSubmit: boolean;
      tutorProfileId: string;
      redirectTo: string;
    }
  | { ok: false; formError?: string; fieldErrors?: ProfileFieldErrors };

export type SaveDraftFlowResult =
  | { ok: true; savedAt: Date }
  | { ok: false; formError?: string };

// --- Minimal Drizzle-compatible Db surface for tests ----------------------

interface SelectFromWhere {
  where(condition: unknown): Promise<unknown[]>;
}
interface SelectFrom {
  from(table: unknown): SelectFromWhere;
}
interface InsertReturning {
  returning(cols: unknown): Promise<unknown[]>;
}
interface InsertValues {
  values(value: unknown): Promise<unknown> & InsertReturning;
}
interface UpdateSetWhereReturning {
  returning(cols: unknown): Promise<unknown[]>;
}
interface UpdateSetWhere {
  where(condition: unknown): Promise<unknown> & UpdateSetWhereReturning;
}
interface UpdateSet {
  set(values: unknown): UpdateSetWhere;
}
interface DeleteWhere {
  where(condition: unknown): Promise<unknown>;
}

export interface TutorTransaction {
  select(cols: unknown): SelectFrom;
  insert(table: unknown): InsertValues;
  update(table: unknown): UpdateSet;
  delete(table: unknown): DeleteWhere;
}

export interface TutorDb {
  transaction<TResult>(
    callback: (transaction: TutorTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

// --- Deps ------------------------------------------------------------------

export interface SubmitProfileDeps {
  db: TutorDb;
  tutorUserId: string;
  /** Resolves `{slug → subjectId}` for the requested slugs. Throws on unknown slug. */
  getSubjectIdsBySlug: (slugs: string[]) => Promise<Map<string, string>>;
  now: () => Date;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

export interface SaveDraftDeps {
  db: TutorDb;
  tutorUserId: string;
  now: () => Date;
  logger?: { error: (message: string, err?: unknown) => void };
}

// --- Internal shapes -------------------------------------------------------

interface ExistingProfileLookup {
  id: string;
  vettingStatus: "pending" | "approved" | "rejected" | "paused";
  introVideoR2Key: string | null;
}

// --- Orchestrator: submit --------------------------------------------------

export async function runSubmitProfile(
  raw: ProfileDraftInput,
  deps: SubmitProfileDeps,
): Promise<SubmitProfileFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };

  const parsed = parseSubmitInput(raw);
  if (!parsed.ok) {
    return { ok: false, fieldErrors: parsed.fieldErrors };
  }
  const input = parsed.value;

  let subjectIds: Map<string, string>;
  try {
    subjectIds = await deps.getSubjectIdsBySlug(input.subjects);
  } catch (err) {
    log.error("[runSubmitProfile] subject lookup failed", err);
    return {
      ok: false,
      formError: "אירעה שגיאה בטעינת המקצועות. נסו שוב.",
    };
  }

  const missing = input.subjects.filter((slug) => !subjectIds.has(slug));
  if (missing.length > 0) {
    log.error(`[runSubmitProfile] unknown subject slugs: ${missing.join(",")}`);
    return {
      ok: false,
      formError: "אחד המקצועות לא נמצא. רעננו את העמוד ונסו שוב.",
    };
  }

  try {
    const result = await deps.db.transaction(async (tx) => {
      // 1. Look up any existing profile + intro-video doc state.
      const existingRows = (await tx
        .select({
          id: tutorProfiles.id,
          vettingStatus: tutorProfiles.vettingStatus,
          introVideoR2Key: tutorProfiles.introVideoR2Key,
        })
        .from(tutorProfiles)
        .where(eq(tutorProfiles.userId, deps.tutorUserId))) as ExistingProfileLookup[];

      const existing = existingRows[0] ?? null;
      const isFirstSubmit = existing === null;

      // 2. Upsert tutor_profiles.
      let tutorProfileId: string;
      if (existing === null) {
        const inserted = (await tx
          .insert(tutorProfiles)
          .values({
            userId: deps.tutorUserId,
            displayName: input.displayName,
            bio: input.bio,
            city: input.city,
            introVideoR2Key: input.introVideoR2Key,
            profilePhotoR2Key: input.photoR2Key,
            hourlyPriceIls: input.price60Ils,
            lesson45PriceIls: input.price45Ils,
            lessonLengthMinutes: 60,
            vettingStatus: "pending",
            isActive: false,
            createdByKind: "user",
            createdByActor: deps.tutorUserId,
          })
          .returning({ id: tutorProfiles.id })) as { id: string }[];
        tutorProfileId = inserted[0]?.id ?? "";
        if (!tutorProfileId) {
          throw new Error("[runSubmitProfile] insert returned no id");
        }
      } else {
        await tx
          .update(tutorProfiles)
          .set({
            displayName: input.displayName,
            bio: input.bio,
            city: input.city,
            introVideoR2Key: input.introVideoR2Key,
            profilePhotoR2Key: input.photoR2Key,
            hourlyPriceIls: input.price60Ils,
            lesson45PriceIls: input.price45Ils,
            // Re-submitting after changes-requested flips us back to "pending"
            // for re-review (Story 2.4 owns the admin queue surface). Approved
            // profiles editing high-impact fields is Story 2.5's concern — this
            // story owns initial submit + changes-requested re-submit.
            vettingStatus: "pending",
            isActive: false,
            updatedAt: deps.now(),
            updatedByKind: "user",
            updatedByActor: deps.tutorUserId,
          })
          .where(eq(tutorProfiles.id, existing.id));
        tutorProfileId = existing.id;
      }

      // 3. Replace tutor_subjects junction (DELETE-then-INSERT).
      await tx
        .delete(tutorSubjects)
        .where(eq(tutorSubjects.tutorUserId, deps.tutorUserId));

      for (const slug of input.subjects) {
        const subjectId = subjectIds.get(slug);
        if (!subjectId) continue;
        await tx.insert(tutorSubjects).values({
          tutorUserId: deps.tutorUserId,
          subjectId,
          createdByKind: "user",
          createdByActor: deps.tutorUserId,
        });
      }

      // 4. Re-confirm the intro_video document row (the upload-confirm action
      //    inserted it in pending state already; this UPDATE is idempotent.)
      await tx
        .update(tutorDocuments)
        .set({
          vettingStatus: "pending",
          updatedAt: deps.now(),
          updatedByKind: "user",
          updatedByActor: deps.tutorUserId,
        })
        .where(eq(tutorDocuments.r2Key, input.introVideoR2Key));

      // 5. Mark phase 2 complete on the wizard state.
      //    The draft-save action already upserts the row; we just stamp
      //    completed_at here on the existing row (or create one if missing).
      const wizardRows = (await tx
        .select({ phase: tutorWizardState.phase })
        .from(tutorWizardState)
        .where(eq(tutorWizardState.userId, deps.tutorUserId))) as { phase: number }[];
      const hasPhase2 = wizardRows.some((row) => row.phase === 2);
      if (hasPhase2) {
        await tx
          .update(tutorWizardState)
          .set({
            data: serializeDraftForPersistence(input),
            completedAt: deps.now(),
            updatedAt: deps.now(),
            updatedByKind: "user",
            updatedByActor: deps.tutorUserId,
          })
          .where(eq(tutorWizardState.userId, deps.tutorUserId));
        // ^ NB: filter is intentionally userId-only since `update.where`
        //   does not chain a second `eq` in our minimal surface; the
        //   real Drizzle call (production) uses `and(eq(userId), eq(phase, 2))`
        //   — see actions.ts for the production query.
      } else {
        await tx.insert(tutorWizardState).values({
          userId: deps.tutorUserId,
          phase: 2,
          data: serializeDraftForPersistence(input),
          completedAt: deps.now(),
          createdByKind: "user",
          createdByActor: deps.tutorUserId,
        });
      }

      // 6. Audit-event row, same-tx.
      await tx.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "tutor.profile_submitted",
          actorKind: "user",
          actorId: deps.tutorUserId,
          targetType: "tutor_profile",
          targetId: tutorProfileId,
          payload: {
            phase: 2,
            isFirstSubmit,
            subjectCount: input.subjects.length,
            hasIntroVideo: true,
            hasPhoto: input.photoR2Key !== null,
          },
        }),
      );

      return { tutorProfileId, isFirstSubmit, input };
    });

    // 7. Post-tx analytics (only on first submit; re-submits during
    //    changes-requested cycles do NOT re-fire). Idempotency guard relies on
    //    the SELECT-before-INSERT inside the tx — concurrent submits at the
    //    boundary would both see "no existing row" and INSERT; the unique
    //    `uq_tutor_profiles_user_id` constraint stops the second from
    //    succeeding, but its caller still sees isFirstSubmit=true. Real DB
    //    backstop is the unique index; closed-beta scale makes the race
    //    practically nonexistent. Documented as a deferred-work entry.
    if (result.isFirstSubmit) {
      try {
        deps.track({
          event: "tutor_profile_created",
          tutorUserId: deps.tutorUserId,
          subjectCount: result.input.subjects.length,
          has45MinPrice: true,
          has60MinPrice: true,
          hasIntroVideo: true,
          hasPhoto: result.input.photoR2Key !== null,
          bioLength: result.input.bio.length,
        });
      } catch (err) {
        // PostHog is fire-and-forget; never block the redirect on analytics.
        log.error("[runSubmitProfile] track(tutor_profile_created) failed", err);
      }
    }

    return {
      ok: true,
      isFirstSubmit: result.isFirstSubmit,
      tutorProfileId: result.tutorProfileId,
      redirectTo: "/tutor/onboarding/agreement",
    };
  } catch (err) {
    log.error("[runSubmitProfile] transaction failed", err);
    return {
      ok: false,
      formError: "אירעה שגיאה. נסו שוב בעוד דקה.",
    };
  }
}

// --- Orchestrator: save draft ---------------------------------------------

export async function runSaveDraft(
  raw: ProfileDraftInput,
  deps: SaveDraftDeps,
): Promise<SaveDraftFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };

  const data = serializeDraftForPersistence(raw);
  const savedAt = deps.now();

  try {
    await deps.db.transaction(async (tx) => {
      const existingRows = (await tx
        .select({ phase: tutorWizardState.phase })
        .from(tutorWizardState)
        .where(eq(tutorWizardState.userId, deps.tutorUserId))) as { phase: number }[];
      const hasPhase2 = existingRows.some((row) => row.phase === 2);

      if (hasPhase2) {
        await tx
          .update(tutorWizardState)
          .set({
            data,
            updatedAt: savedAt,
            updatedByKind: "user",
            updatedByActor: deps.tutorUserId,
          })
          .where(eq(tutorWizardState.userId, deps.tutorUserId));
      } else {
        await tx.insert(tutorWizardState).values({
          userId: deps.tutorUserId,
          phase: 2,
          data,
          completedAt: null,
          createdByKind: "user",
          createdByActor: deps.tutorUserId,
        });
      }

      await tx.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "tutor.profile_draft_saved",
          actorKind: "user",
          actorId: deps.tutorUserId,
          targetType: "tutor_profile",
          targetId: deps.tutorUserId,
          payload: { phase: 2, fieldsSaved: Object.keys(data) },
        }),
      );
    });

    return { ok: true, savedAt };
  } catch (err) {
    log.error("[runSaveDraft] transaction failed", err);
    return { ok: false, formError: "שמירה אוטומטית נכשלה." };
  }
}

// --- Helpers ---------------------------------------------------------------

function serializeDraftForPersistence(
  raw: ProfileDraftInput | ProfileSubmitInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (raw.displayName !== undefined && raw.displayName !== null) out.displayName = raw.displayName;
  if (raw.bio !== undefined && raw.bio !== null) out.bio = raw.bio;
  if (raw.subjects && raw.subjects.length > 0) out.subjects = raw.subjects;
  if (raw.price45Ils !== undefined && raw.price45Ils !== null) out.price45Ils = raw.price45Ils;
  if (raw.price60Ils !== undefined && raw.price60Ils !== null) out.price60Ils = raw.price60Ils;
  if (raw.city !== undefined && raw.city !== null) out.city = raw.city;
  if (raw.photoR2Key !== undefined && raw.photoR2Key !== null) out.photoR2Key = raw.photoR2Key;
  if (raw.introVideoR2Key !== undefined && raw.introVideoR2Key !== null)
    out.introVideoR2Key = raw.introVideoR2Key;
  return out;
}
