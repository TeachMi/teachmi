// Pure orchestrator for the tutor-profile-submission Server Actions.
// FakeDb-tested via profile-flow.test.ts. `actions.ts` ("use server") is the
// thin Next.js wrapper that builds the real dependencies (getDb + getFilesProvider
// + track + requireTutor() user) and converts the outcome into a redirect /
// state return.

import { and, eq } from "drizzle-orm";
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
  PROFILE_FORM_LIMITS,
  parseSubmitInput,
  type ProfileDraftInput,
  type ProfileFieldErrors,
  type ProfileSubmitInput,
} from "./profile-form-schema";

// Code-review patch (2026-05-12, patch #11): enforce length / count bounds on
// draft inputs too. Without this, `runSaveDraft` accepted arbitrary-length
// bio / displayName / subjects[] and persisted them into `tutor_wizard_state.data`
// — a DoS vector (10MB bio crashes subsequent reads). Truncate (not reject):
// the user is mid-typing, so we'd rather store what fits than block the save.
function clampDraftForPersistence(raw: ProfileDraftInput): ProfileDraftInput {
  return {
    displayName: raw.displayName?.slice(0, PROFILE_FORM_LIMITS.DISPLAY_NAME_MAX_CHARS),
    gender: raw.gender,
    tagline: raw.tagline?.slice(0, PROFILE_FORM_LIMITS.TAGLINE_MAX_CHARS),
    shortBio: raw.shortBio?.slice(0, PROFILE_FORM_LIMITS.SHORT_BIO_MAX_CHARS),
    longBio: raw.longBio?.slice(0, PROFILE_FORM_LIMITS.LONG_BIO_MAX_CHARS),
    highlights: raw.highlights?.slice(0, 4),
    recommendationVisible: raw.recommendationVisible,
    recommendationHeadline: raw.recommendationHeadline?.slice(
      0,
      PROFILE_FORM_LIMITS.RECOMMENDATION_HEADLINE_MAX_CHARS,
    ),
    recommendationSub: raw.recommendationSub?.slice(
      0,
      PROFILE_FORM_LIMITS.RECOMMENDATION_SUB_MAX_CHARS,
    ),
    subjects: raw.subjects?.slice(0, PROFILE_FORM_LIMITS.SUBJECTS_MAX),
    prices: raw.prices,
    photoR2Key: raw.photoR2Key?.slice(0, PROFILE_FORM_LIMITS.R2_KEY_MAX_CHARS),
    introVideoR2Key: raw.introVideoR2Key?.slice(0, PROFILE_FORM_LIMITS.R2_KEY_MAX_CHARS),
  };
}

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

/**
 * Minimal Drizzle-compatible surface the orchestrators consume. We deliberately
 * do NOT require `db.transaction(...)` here — the neon-http driver throws
 * `No transactions support in neon-http driver`. The orchestrators sequence
 * writes manually instead; tests assert on the resulting capture arrays.
 */
export interface TutorDb {
  select(cols: unknown): SelectFrom;
  insert(table: unknown): InsertValues;
  update(table: unknown): UpdateSet;
  delete(table: unknown): DeleteWhere;
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

  // Code-review patch (2026-05-12): defense-in-depth R2-key ownership check.
  // The confirm-upload actions also guard, but a misbehaving / malicious
  // client could skip the confirm step and submit FormData with another
  // tutor's r2Key directly. Refuse here as well so submit-without-confirm
  // can't claim foreign keys.
  // Story 2.11 (2026-05-18): introVideoR2Key is now optional (nullable). Only
  // validate the ownership prefix when the tutor supplied a video.
  if (
    input.introVideoR2Key !== null &&
    !input.introVideoR2Key.startsWith(`intros/${deps.tutorUserId}/`)
  ) {
    log.error(
      `[runSubmitProfile] intro_video r2Key does not match tutor prefix: ${input.introVideoR2Key}`,
    );
    return { ok: false, formError: "מפתח R2 של סרטון לא תקין." };
  }
  if (input.photoR2Key !== null && !input.photoR2Key.startsWith(`photos/${deps.tutorUserId}/`)) {
    log.error(
      `[runSubmitProfile] photo r2Key does not match tutor prefix: ${input.photoR2Key}`,
    );
    return { ok: false, formError: "מפתח R2 של תמונה לא תקין." };
  }

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

  // Sequential writes (no transaction) — neon-http driver does not support
  // transactions. Same pattern Stories 1.13/1.14 use. Partial failure leaves
  // the DB in an inconsistent state; the next submit attempt's upsert logic
  // converges back to the intended end state. Documented in deferred-work.md.
  try {
    const db = deps.db;

    // 1. Look up any existing profile.
    const existingRows = (await db
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
      const inserted = (await db
        .insert(tutorProfiles)
        .values({
          userId: deps.tutorUserId,
          displayName: input.displayName,
          gender: input.gender,
          // Story 2.11 — write new content fields; `bio` (deprecated)
          // mirrors `longBio` for one deploy as a safety net.
          bio: input.longBio,
          tagline: input.tagline,
          shortBio: input.shortBio,
          longBio: input.longBio,
          highlights: input.highlights,
          recommendationHeadline: input.recommendationHeadline,
          recommendationSub: input.recommendationSub,
          recommendationVisible: input.recommendationVisible,
          introVideoR2Key: input.introVideoR2Key,
          profilePhotoR2Key: input.photoR2Key,
          hourlyPriceIls: input.prices[60],
          lesson45PriceIls: input.prices[45],
          lesson75PriceIls: input.prices[75],
          lesson90PriceIls: input.prices[90],
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
      await db
        .update(tutorProfiles)
        .set({
          displayName: input.displayName,
          gender: input.gender,
          // Story 2.11 — write new content fields; `bio` mirrors `longBio`
          // during the one-deploy safety window.
          bio: input.longBio,
          tagline: input.tagline,
          shortBio: input.shortBio,
          longBio: input.longBio,
          highlights: input.highlights,
          recommendationHeadline: input.recommendationHeadline,
          recommendationSub: input.recommendationSub,
          recommendationVisible: input.recommendationVisible,
          introVideoR2Key: input.introVideoR2Key,
          profilePhotoR2Key: input.photoR2Key,
          hourlyPriceIls: input.prices[60],
          lesson45PriceIls: input.prices[45],
          lesson75PriceIls: input.prices[75],
          lesson90PriceIls: input.prices[90],
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
    await db
      .delete(tutorSubjects)
      .where(eq(tutorSubjects.tutorUserId, deps.tutorUserId));

    // Code-review patch (2026-05-12, patch #6): the outer `missing.length > 0`
    // guard above already errored on unknown slugs, so by here every slug is
    // resolvable. Removing the dead-defense `continue` makes the intent
    // explicit and surfaces any future inconsistency loudly via assertion.
    for (const slug of input.subjects) {
      const subjectId = subjectIds.get(slug);
      if (!subjectId) {
        throw new Error(
          `[runSubmitProfile] invariant violation: slug ${slug} passed pre-check but not in subjectIds map`,
        );
      }
      await db.insert(tutorSubjects).values({
        tutorUserId: deps.tutorUserId,
        subjectId,
        createdByKind: "user",
        createdByActor: deps.tutorUserId,
      });
    }

    // 4. Re-confirm the intro_video document row (the upload-confirm action
    //    inserted it in pending state already; this UPDATE is idempotent.)
    //    Filter by BOTH r2Key AND tutorUserId so an attacker who learns
    //    another tutor's r2Key cannot flip that tutor's document back to
    //    "pending". The ownership-prefix check at the action layer already
    //    blocks this earlier; the SQL filter is defense in depth.
    //
    //    Row-count guard (code-review patch 2026-05-13): if the UPDATE
    //    matches zero rows, the upload-confirm row was deleted by an admin
    //    action OR moved to approved/rejected status between confirm and
    //    submit. Without this guard the submit would silently succeed but
    //    leave `tutor_profiles.intro_video_r2_key` pointing at a key with
    //    no tutor_documents row — admin queue (Story 2.4) never surfaces
    //    the video for review. Throw so the orchestrator's catch returns
    //    a clear form error and the user re-uploads.
    //
    //    Story 2.11 (2026-05-18): video is optional. Skip this step entirely
    //    when the tutor did not supply one.
    if (input.introVideoR2Key !== null) {
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
          "[runSubmitProfile] intro_video document not found — admin moved it or row was deleted",
        );
      }
    }

    // 5. Mark phase 2 complete on the wizard state. Filter UPDATE by both
    //    userId AND phase=2 so future phase-3+ rows (Stories 2.2+) aren't
    //    clobbered.
    const wizardRows = (await db
      .select({ phase: tutorWizardState.phase })
      .from(tutorWizardState)
      .where(eq(tutorWizardState.userId, deps.tutorUserId))) as { phase: number }[];
    const hasPhase2 = wizardRows.some((row) => row.phase === 2);
    if (hasPhase2) {
      await db
        .update(tutorWizardState)
        .set({
          data: serializeDraftForPersistence(input),
          completedAt: deps.now(),
          updatedAt: deps.now(),
          updatedByKind: "user",
          updatedByActor: deps.tutorUserId,
        })
        .where(
          and(
            eq(tutorWizardState.userId, deps.tutorUserId),
            eq(tutorWizardState.phase, 2),
          ),
        );
    } else {
      await db.insert(tutorWizardState).values({
        userId: deps.tutorUserId,
        phase: 2,
        data: serializeDraftForPersistence(input),
        completedAt: deps.now(),
        createdByKind: "user",
        createdByActor: deps.tutorUserId,
      });
    }

    // 6. Audit-event row (sequential — not same-tx; see header comment).
    await db.insert(auditEvents).values(
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
          hasIntroVideo: input.introVideoR2Key !== null,
          hasPhoto: input.photoR2Key.length > 0,
          highlightCount: input.highlights.length,
          recommendationVisible: input.recommendationVisible,
        },
      }),
    );

    // 7. Analytics on first submit only.
    if (isFirstSubmit) {
      try {
        deps.track({
          event: "tutor_profile_created",
          tutorUserId: deps.tutorUserId,
          subjectCount: input.subjects.length,
          has45MinPrice: input.prices[45] !== null,
          has60MinPrice: input.prices[60] !== null,
          hasIntroVideo: input.introVideoR2Key !== null,
          hasPhoto: input.photoR2Key.length > 0,
          bioLength: input.longBio.length,
        });
      } catch (err) {
        // PostHog is fire-and-forget; never block the redirect on analytics.
        log.error("[runSubmitProfile] track(tutor_profile_created) failed", err);
      }
    }

    return {
      ok: true,
      isFirstSubmit,
      tutorProfileId,
      redirectTo: "/tutor/onboarding/agreement",
    };
  } catch (err) {
    log.error("[runSubmitProfile] sequential writes failed", err);
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

  // Code-review patch (2026-05-12, patch #11): clamp before serializing.
  const clamped = clampDraftForPersistence(raw);
  const data = serializeDraftForPersistence(clamped);
  const savedAt = deps.now();

  // Sequential writes (no transaction) — neon-http does not support tx.
  try {
    const db = deps.db;
    const existingRows = (await db
      .select({ phase: tutorWizardState.phase })
      .from(tutorWizardState)
      .where(eq(tutorWizardState.userId, deps.tutorUserId))) as { phase: number }[];
    const hasPhase2 = existingRows.some((row) => row.phase === 2);

    if (hasPhase2) {
      await db
        .update(tutorWizardState)
        .set({
          data,
          updatedAt: savedAt,
          updatedByKind: "user",
          updatedByActor: deps.tutorUserId,
        })
        .where(
          and(
            eq(tutorWizardState.userId, deps.tutorUserId),
            eq(tutorWizardState.phase, 2),
          ),
        );
    } else {
      await db.insert(tutorWizardState).values({
        userId: deps.tutorUserId,
        phase: 2,
        data,
        completedAt: null,
        createdByKind: "user",
        createdByActor: deps.tutorUserId,
      });
    }

    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "tutor.profile_draft_saved",
        actorKind: "user",
        actorId: deps.tutorUserId,
        targetType: "tutor_profile",
        targetId: deps.tutorUserId,
        payload: { phase: 2, fieldsSaved: Object.keys(data) },
      }),
    );

    return { ok: true, savedAt };
  } catch (err) {
    log.error("[runSaveDraft] sequential writes failed", err);
    return { ok: false, formError: "שמירה אוטומטית נכשלה." };
  }
}

// --- Helpers ---------------------------------------------------------------

function serializeDraftForPersistence(
  raw: ProfileDraftInput | ProfileSubmitInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (raw.displayName !== undefined && raw.displayName !== null) out.displayName = raw.displayName;
  if (raw.gender !== undefined && raw.gender !== null) out.gender = raw.gender;
  if (raw.tagline !== undefined && raw.tagline !== null) out.tagline = raw.tagline;
  if (raw.shortBio !== undefined && raw.shortBio !== null) out.shortBio = raw.shortBio;
  if (raw.longBio !== undefined && raw.longBio !== null) out.longBio = raw.longBio;
  if (raw.highlights && raw.highlights.length > 0) out.highlights = raw.highlights;
  if (raw.recommendationVisible !== undefined)
    out.recommendationVisible = raw.recommendationVisible;
  if (
    raw.recommendationHeadline !== undefined &&
    raw.recommendationHeadline !== null
  )
    out.recommendationHeadline = raw.recommendationHeadline;
  if (raw.recommendationSub !== undefined && raw.recommendationSub !== null)
    out.recommendationSub = raw.recommendationSub;
  if (raw.subjects && raw.subjects.length > 0) out.subjects = raw.subjects;
  if (raw.prices && Object.keys(raw.prices).length > 0) out.prices = raw.prices;
  if (raw.photoR2Key !== undefined && raw.photoR2Key !== null) out.photoR2Key = raw.photoR2Key;
  if (raw.introVideoR2Key !== undefined && raw.introVideoR2Key !== null)
    out.introVideoR2Key = raw.introVideoR2Key;
  return out;
}
