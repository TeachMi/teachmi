"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "../../../../lib/db/client";
import { track } from "../../../../lib/analytics";
import { anonymizeIpForAnalytics } from "../../../../lib/auth/rate-limit";
import { readIp } from "../../../signup/_lib/origin";
import { requireTutor } from "../../onboarding/_lib/require-tutor";
import { lookupSubjectIdsBySlug } from "../../onboarding/_lib/subject-lookup";
import { checkTutorRateLimit } from "../../onboarding/_lib/tutor-rate-limit";
import { parseFormDataIntoDraftInput } from "../../onboarding/profile/profile-form-schema";
import type { TutorDb } from "../../onboarding/profile/profile-flow";
import type { ProfileActionState } from "../../onboarding/profile/state";
import { runEditProfile } from "./edit-flow";

/**
 * Server Action wired into the edit-mode `<ProfileForm saveAction={...} />`
 * mount via `useActionState`. Mirrors `profileFormAction`'s shape so the form
 * can swap one for the other without changing its state-handling code. The
 * "save" intent is unused in edit mode (there's no debounced auto-save —
 * editing existing profiles isn't a wizard step), so we always treat the
 * action as a submit.
 */
export async function editProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireTutor("/tutor/me");
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const draft = parseFormDataIntoDraftInput(formData);
  const db = getDb() as unknown as TutorDb &
    Parameters<typeof checkTutorRateLimit>[0]["db"];

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

  const result = await runEditProfile(draft, {
    db,
    tutorUserId: user.id,
    getSubjectIdsBySlug: (slugs) =>
      lookupSubjectIdsBySlug(
        db as unknown as Parameters<typeof lookupSubjectIdsBySlug>[0],
        slugs,
      ),
    now: () => new Date(),
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
