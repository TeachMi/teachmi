"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { track } from "@/lib/analytics";
import { getSafeCallbackUrl } from "@/lib/auth/callback-url";
import { isValidEmailShape } from "@/lib/auth/email-validation";
import {
  RATE_LIMIT_EVENT_TYPES,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  rateLimitWindowStart,
  thresholdForIp,
} from "@/lib/auth/rate-limit";
import { auditEvents } from "@/lib/db/schema";
import { toAuditEventValues } from "@/lib/db/audit";
import { runVerifyCode } from "./verify-flow";
import { resolveVerifyRedirect } from "./verify/route-resolve";
import { readIp } from "./_lib/origin";

function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

function buildVerifyErrorUrl(reason: string, email: string): string {
  const params = new URLSearchParams({ reason });
  if (isValidEmailShape(email)) {
    params.set("email", email.trim().toLowerCase());
  }
  return `/signup/verify-error?${params.toString()}`;
}

export async function verifyCodeAction(formData: FormData): Promise<void> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const rawNext = String(formData.get("next") ?? "").trim();
  const next = rawNext.length > 0 ? getSafeCallbackUrl(rawNext, "") || null : null;
  const db = getDb();
  let rateLimited = false;

  try {
    const windowStart = rateLimitWindowStart();
    const existingAttempts = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, RATE_LIMIT_EVENT_TYPES.signup_verify_code),
          eq(auditEvents.actorMeta, ip),
          gte(auditEvents.createdAt, windowStart),
        ),
      );

    await db
      .insert(auditEvents)
      .values(
        toAuditEventValues(
          buildAttemptAuditEvent({ ip, action: "signup_verify_code", email }),
        ),
      );

    const rateLimit = evaluateRateLimit({
      recentAttempts: existingAttempts.length,
      threshold: thresholdForIp(ip),
    });
    rateLimited = !rateLimit.allowed;
  } catch (err) {
    console.error("[verifyCodeAction] rate-limit check failed", err);
    redirect(buildVerifyErrorUrl("internal", email));
  }
  if (rateLimited) {
    redirect(buildVerifyErrorUrl("rate_limited", email));
  }

  const result = await runVerifyCode(
    { email, code },
    {
      db: db as unknown as Parameters<typeof runVerifyCode>[1]["db"],
      generateSessionToken: () => randomUUID(),
      track,
    },
  );

  if (result.kind === "error") {
    redirect(buildVerifyErrorUrl(result.reason, email));
  }

  const resolved = resolveVerifyRedirect(result, next);

  if (resolved.setSessionCookie && result.kind === "ok") {
    const cookieStore = await cookies();
    cookieStore.set({
      name: getSessionCookieName(),
      value: result.sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: result.expires,
    });

    if (resolved.completionTutorUserId) {
      track({
        event: "signup_intent_book_completed",
        userId: result.userId,
        tutorUserId: resolved.completionTutorUserId,
      });
    }
  }

  redirect(resolved.path);
}
