"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "../../../../lib/db/client";
import { track } from "../../../../lib/analytics";
import { anonymizeIpForAnalytics } from "../../../../lib/auth/rate-limit";
import { readIp } from "../../../signup/_lib/origin";
import { requireTutor } from "../_lib/require-tutor";
import { lookupSubjectIdsBySlug } from "../_lib/subject-lookup";
import { checkTutorRateLimit } from "../_lib/tutor-rate-limit";
import { runSaveDraft, runSubmitProfile, type TutorDb } from "./profile-flow";
import {
  parseFormDataIntoDraftInput,
} from "./profile-form-schema";
import type { ProfileActionState } from "./state";

/**
 * Unified Server Action wired into the client form's `useActionState`. The
 * client supplies an `intent` field on the FormData ("save" | "submit") so a
 * single binding covers both auto-save and explicit submit.
 */
export async function profileFormAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const intent = String(formData.get("intent") ?? "submit");
  if (intent === "save") {
    return await saveDraft(formData);
  }
  return await submitProfile(formData);
}

async function saveDraft(formData: FormData): Promise<ProfileActionState> {
  const user = await requireTutor("/tutor/onboarding/profile");
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const draft = parseFormDataIntoDraftInput(formData);
  const db = getDb() as unknown as TutorDb & Parameters<typeof checkTutorRateLimit>[0]["db"];

  const limit = await checkTutorRateLimit({
    db,
    tutorUserId: user.id,
    action: "save_draft",
    ipForAudit: ip,
  });
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: "save_draft",
    });
    return {
      intent: "save",
      ok: false,
      formError: "יותר מדי שמירות. נסו שוב בעוד דקה.",
    };
  }

  const result = await runSaveDraft(draft, {
    db,
    tutorUserId: user.id,
    now: () => new Date(),
  });
  if (!result.ok) {
    return { intent: "save", ok: false, formError: result.formError ?? "השמירה נכשלה." };
  }
  return { intent: "save", ok: true, savedAt: result.savedAt.toISOString() };
}

async function submitProfile(formData: FormData): Promise<ProfileActionState> {
  const user = await requireTutor("/tutor/onboarding/profile");
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const draft = parseFormDataIntoDraftInput(formData);
  const db = getDb() as unknown as TutorDb & Parameters<typeof checkTutorRateLimit>[0]["db"];

  const limit = await checkTutorRateLimit({
    db,
    tutorUserId: user.id,
    action: "submit_profile",
    ipForAudit: ip,
  });
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: "submit_profile",
    });
    return {
      intent: "submit",
      ok: false,
      formError: "יותר מדי ניסיונות שליחה. נסו שוב בעוד דקה.",
      values: draft,
    };
  }

  const result = await runSubmitProfile(draft, {
    db,
    tutorUserId: user.id,
    getSubjectIdsBySlug: (slugs) =>
      lookupSubjectIdsBySlug(
        db as unknown as Parameters<typeof lookupSubjectIdsBySlug>[0],
        slugs,
      ),
    now: () => new Date(),
    track,
  });

  if (!result.ok) {
    return {
      intent: "submit",
      ok: false,
      formError: result.formError,
      fieldErrors: result.fieldErrors,
      values: draft,
    };
  }

  redirect(result.redirectTo);
}

