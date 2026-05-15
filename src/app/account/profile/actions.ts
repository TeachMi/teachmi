"use server";

import { getDb } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/guards";
import { runUpdateProfile } from "./profile-flow";
import type { ProfileActionState } from "./profile-state";

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireAuth("/account/profile");

  const result = await runUpdateProfile(formData, {
    db: getDb() as unknown as Parameters<typeof runUpdateProfile>[1]["db"],
    userId: user.id,
  });

  if (result.ok) {
    return {
      ok: true,
      values: {
        name: String(formData.get("name") ?? "").trim(),
        dateOfBirth: String(formData.get("dateOfBirth") ?? "").trim(),
      },
      savedAt: result.updatedAt.toISOString(),
    };
  }

  if ("fieldErrors" in result) {
    return {
      ok: false,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }
  return {
    ok: false,
    formError: result.formError,
    values: result.values,
  };
}
