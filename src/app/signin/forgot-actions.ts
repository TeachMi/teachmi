"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getEmailProvider } from "@/lib/providers/email";
import { track } from "@/lib/analytics";
import { readIp, readTrustedOrigin } from "../signup/_lib/origin";
import { runForgotPassword } from "./forgot-flow";
import { FORGOT_INITIAL_STATE, type ForgotPasswordActionState } from "./forgot-state";

export async function forgotPasswordAction(
  _prevState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const origin = readTrustedOrigin(hdrs);

  const result = await runForgotPassword(formData, {
    db: getDb() as unknown as Parameters<typeof runForgotPassword>[1]["db"],
    emailProvider: getEmailProvider(),
    ip,
    origin,
    track,
  });

  if (result.kind === "redirect") {
    redirect(result.url);
  }

  // invalid_email — return a field-error WITHOUT redirecting. This is the one
  // exception to anti-enumeration (per story AC2 step 2): an ill-formatted
  // email is a UX issue, not a registration-status leak.
  return {
    ...FORGOT_INITIAL_STATE,
    fieldErrors: { email: "כתובת האימייל אינה תקינה." },
    values: { email: result.email },
  };
}
