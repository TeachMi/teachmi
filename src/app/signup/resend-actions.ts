"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditEvents, users, verificationTokens } from "@/lib/db/schema";
import { toAuditEventValues } from "@/lib/db/audit";
import {
  RATE_LIMIT_EVENT_TYPES,
  anonymizeIpForAnalytics,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  rateLimitWindowStart,
} from "@/lib/auth/rate-limit";
import {
  buildVerificationUrl,
  generateVerificationToken,
} from "@/lib/auth/email-verification";
import { getEmailProvider } from "@/lib/providers/email";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import { track } from "@/lib/analytics";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function readIp(forwardedFor: string | null): string {
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

function readOrigin(headerStore: Headers): string {
  return (
    headerStore.get("origin") ||
    (headerStore.get("x-forwarded-host")
      ? `${headerStore.get("x-forwarded-proto") ?? "https"}://${headerStore.get("x-forwarded-host")}`
      : null) ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  );
}

export async function resendVerificationAction(formData: FormData): Promise<void> {
  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw.toLowerCase();

  if (!EMAIL_RE.test(emailRaw)) {
    redirect(`/signup/verify-error?reason=missing`);
  }

  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const origin = readOrigin(hdrs);
  const db = getDb();

  let outcome: "sent" | "already_verified" | "no_account" | "rate_limited";
  let token: string | null = null;

  try {
    const windowStart = rateLimitWindowStart();
    const existingAttempts = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, RATE_LIMIT_EVENT_TYPES.signup_resend),
          eq(auditEvents.actorMeta, ip),
          gte(auditEvents.createdAt, windowStart),
        ),
      );

    const rateLimit = evaluateRateLimit({ recentAttempts: existingAttempts.length });

    await db
      .insert(auditEvents)
      .values(
        toAuditEventValues(
          buildAttemptAuditEvent({ ip, action: "signup_resend", email }),
        ),
      );

    if (!rateLimit.allowed) {
      outcome = "rate_limited";
    } else {
      const matched = await db
        .select({ id: users.id, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.email, email));

      const user = matched[0];
      if (!user) {
        outcome = "no_account";
      } else if (user.emailVerified) {
        outcome = "already_verified";
      } else {
        const generated = generateVerificationToken();
        token = generated.token;
        await db.insert(verificationTokens).values({
          identifier: email,
          token: generated.token,
          expires: generated.expires,
        });
        outcome = "sent";
      }
    }
  } catch (err) {
    console.error("[resendVerificationAction] DB write failed", err);
    redirect(`/signup/verify-error?reason=internal`);
  }

  if (outcome === "rate_limited") {
    track({
      event: "signup_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: "signup_resend",
    });
  } else if (outcome === "sent" && token) {
    try {
      const provider = getEmailProvider();
      await provider.sendTransactional({
        toAddress: email,
        subject: EMAIL_TEMPLATES.AUTH_VERIFY_EMAIL.subject,
        templateId: EMAIL_TEMPLATES.AUTH_VERIFY_EMAIL.templateId,
        payload: {
          verifyUrl: buildVerificationUrl(token, origin),
          expiresInMinutes: 15,
        },
      });
    } catch (err) {
      console.error("[resendVerificationAction] email send failed", err);
    }
  }

  redirect(`/signup/verify-email-sent?email=${encodeURIComponent(email)}`);
}
