"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { track } from "@/lib/analytics";
import { readIp } from "../signup/_lib/origin";
import { runResetPassword } from "./reset-flow";
import { RESET_INITIAL_STATE, type ResetPasswordActionState } from "./reset-state";

export async function resetPasswordAction(
  _prevState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));

  const result = await runResetPassword(formData, {
    db: getDb() as unknown as Parameters<typeof runResetPassword>[1]["db"],
    ip,
    track,
  });

  if ("redirectTo" in result) {
    redirect(result.redirectTo);
  }

  // result.ok === false with a state — render the form errors.
  return { ...RESET_INITIAL_STATE, ...result.state };
}
