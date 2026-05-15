"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { getEmailProvider } from "@/lib/providers/email";
import { track } from "@/lib/analytics";
import { getSafeCallbackUrl } from "@/lib/auth/callback-url";
import { runResend } from "./resend-flow";
import { readIp, readTrustedOrigin } from "./_lib/origin";

export async function resendVerificationAction(formData: FormData): Promise<void> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const origin = readTrustedOrigin(hdrs);

  // Story 3.3 — booking-funnel intent target. Same sanitization shape as
  // registerAction: empty / missing / unsafe input collapses to null.
  const rawNext = String(formData.get("next") ?? "").trim();
  const next: string | null =
    rawNext.length > 0 ? getSafeCallbackUrl(rawNext, "") || null : null;

  const result = await runResend(formData, {
    db: getDb() as unknown as Parameters<typeof runResend>[1]["db"],
    emailProvider: getEmailProvider(),
    ip,
    next,
    origin,
    track,
  });

  redirect(result.url);
}
