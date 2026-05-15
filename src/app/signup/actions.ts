"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { getEmailProvider } from "@/lib/providers/email";
import { track } from "@/lib/analytics";
import { isEmailVerificationSkipEnabled } from "@/lib/auth/dev-flags";
import { getSafeCallbackUrl } from "@/lib/auth/callback-url";
import { runRegister } from "./registration-flow";
import { readIp, readTrustedOrigin } from "./_lib/origin";
import type { RegisterActionState } from "./register-state";

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const origin = readTrustedOrigin(hdrs);
  const userAgent = hdrs.get("user-agent");

  // Story 3.3 — booking-funnel intent target. The /signup page passes the
  // composed `next` (a /booking-stub URL) as a hidden form field. Sanitize via
  // `getSafeCallbackUrl(raw, "")` so:
  //   - Empty / missing / unsafe input → empty-string fallback → null `next`.
  //   - Valid relative path passes through unchanged.
  // Unsafe `next` (open-redirect attempt) silently degrades to "no intent" —
  // upstream sig validation on /signup already caught the real abuse case;
  // this is defense-in-depth.
  const rawNext = String(formData.get("next") ?? "").trim();
  const next: string | null =
    rawNext.length > 0 ? getSafeCallbackUrl(rawNext, "") || null : null;

  const result = await runRegister(formData, {
    db: getDb() as unknown as Parameters<typeof runRegister>[1]["db"],
    emailProvider: getEmailProvider(),
    ip,
    next,
    origin,
    userAgent,
    track,
    // Dev-only: production-guarded inside isEmailVerificationSkipEnabled().
    skipEmailVerification: isEmailVerificationSkipEnabled(),
  });

  if (result.ok) {
    redirect(result.redirectTo);
  }

  return result.state;
}
