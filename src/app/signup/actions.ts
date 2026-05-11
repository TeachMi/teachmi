"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditEvents, users, verificationTokens } from "@/lib/db/schema";
import { toAuditEventValues } from "@/lib/db/audit";
import { PASSWORD_MIN_LENGTH, validatePassword } from "@/lib/auth/registration";
import { hashPassword } from "@/lib/auth/password-hashing";
import {
  buildVerificationUrl,
  generateVerificationToken,
} from "@/lib/auth/email-verification";
import {
  RATE_LIMIT_EVENT_TYPES,
  anonymizeIpForAnalytics,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  rateLimitWindowStart,
} from "@/lib/auth/rate-limit";
import { getEmailProvider } from "@/lib/providers/email";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import { isAppRole, type AppRole } from "@/lib/auth/roles";
import { track } from "@/lib/analytics";
import type { RegisterActionState } from "./register-state";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function fieldError(reason: ReturnType<typeof validatePassword>): string {
  if (reason.ok) return "";
  if (reason.reason === "too_short") {
    return `סיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים.`;
  }
  if (reason.reason === "missing_letter") {
    return "סיסמה חייבת להכיל לפחות אות אחת.";
  }
  return "סיסמה חייבת להכיל לפחות ספרה אחת.";
}

function coerceRole(input: string): AppRole {
  if (isAppRole(input) && input !== "admin") {
    return input;
  }
  return "student";
}

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

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw.toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = coerceRole(String(formData.get("role") ?? "student"));
  const tos =
    formData.get("tos") === "on" ||
    formData.get("tos") === "true" ||
    formData.get("tos") === "1";

  const fieldErrors: RegisterActionState["fieldErrors"] = {};
  if (name.length < 2) {
    fieldErrors.name = "שם חייב להכיל לפחות 2 תווים.";
  }
  if (!EMAIL_RE.test(emailRaw)) {
    fieldErrors.email = "כתובת האימייל אינה תקינה.";
  }
  const pw = validatePassword(password);
  if (!pw.ok) {
    fieldErrors.password = fieldError(pw);
  }
  if (!tos) {
    fieldErrors.tos = "יש לאשר את תנאי השימוש.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      values: { name, email: emailRaw, role, tos },
    };
  }

  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const origin = readOrigin(hdrs);
  const db = getDb();

  let userId: string;
  let token: string;

  try {
    // 1. Rate-limit check + attempt audit row.
    //    The Neon HTTP driver does not support interactive transactions, so the
    //    body runs as sequential queries. Order matters: write the attempt row
    //    BEFORE evaluating the limit so a throttled attempt still counts toward
    //    the window. Email collision and user/token inserts run only after.
    const windowStart = rateLimitWindowStart();
    const existingAttempts = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, RATE_LIMIT_EVENT_TYPES.signup),
          eq(auditEvents.actorMeta, ip),
          gte(auditEvents.createdAt, windowStart),
        ),
      );

    const rateLimit = evaluateRateLimit({ recentAttempts: existingAttempts.length });

    await db
      .insert(auditEvents)
      .values(toAuditEventValues(buildAttemptAuditEvent({ ip, action: "signup", email })));

    if (!rateLimit.allowed) {
      track({
        event: "signup_rate_limited",
        anonymizedIp: anonymizeIpForAnalytics(ip),
        action: "signup",
      });
      return {
        ok: false,
        formError: "יותר מדי ניסיונות. נסו שוב בעוד דקה.",
        values: { name, email: emailRaw, role, tos },
      };
    }

    // 2. Email collision check (no enumeration leak in the message).
    const collision = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (collision.length > 0) {
      return {
        ok: false,
        formError: "אימייל זה כבר רשום במערכת. נסו להיכנס.",
        values: { name, email: emailRaw, role, tos },
      };
    }

    // 3. Hash + insert user.
    const passwordHash = await hashPassword(password);
    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
        role,
        createdByKind: "user",
        createdByActor: "self-signup",
      })
      .returning({ id: users.id });

    const insertedId = inserted[0]?.id;
    if (!insertedId) {
      throw new Error("User insert returned no id");
    }
    userId = insertedId;

    // 4. Generate + store verification token.
    const generated = generateVerificationToken();
    token = generated.token;
    await db.insert(verificationTokens).values({
      identifier: email,
      token: generated.token,
      expires: generated.expires,
    });

    // 5. Audit row for the registration (NFR16: actions are auditable).
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "auth.user_registered",
        actorKind: "user",
        actorId: userId,
        targetType: "user",
        targetId: userId,
        payload: { role, hasPassword: true, requiresVerification: true },
      }),
    );
  } catch (err) {
    console.error("[registerAction] sequential write failed", err);
    return {
      ok: false,
      formError: "אירעה שגיאה. נסו שוב בעוד דקה.",
      values: { name, email: emailRaw, role, tos },
    };
  }

  // 6. Send verification email (best-effort, off the critical path).
  try {
    const provider = getEmailProvider();
    await provider.sendTransactional({
      toAddress: email,
      subject: EMAIL_TEMPLATES.AUTH_VERIFY_EMAIL.subject,
      templateId: EMAIL_TEMPLATES.AUTH_VERIFY_EMAIL.templateId,
      payload: {
        verifyUrl: buildVerificationUrl(token, origin),
        expiresInMinutes: 15,
        displayName: name,
      },
    });
  } catch (err) {
    console.error("[registerAction] verification email send failed", err);
  }

  track({ event: "signup_completed", userId, role });

  redirect(`/signup/verify-email-sent?email=${encodeURIComponent(email)}`);
}
