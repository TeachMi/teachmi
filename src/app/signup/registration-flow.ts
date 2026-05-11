// Pure orchestrator for the signup `registerAction`. Tested via the
// FakeDb / FakeEmailProvider / FakeTrack pattern in registration-flow.test.ts.
// `actions.ts` ("use server") is the thin Next.js wrapper that builds the real
// dependencies and converts the outcome into a redirect / state return.

import { and, eq, gte } from "drizzle-orm";
import { auditEvents, users, verificationTokens } from "../../lib/db/schema";
import { toAuditEventValues } from "../../lib/db/audit";
import { PASSWORD_MIN_LENGTH, validatePassword } from "../../lib/auth/registration";
import { hashPassword } from "../../lib/auth/password-hashing";
import { isValidEmailShape } from "../../lib/auth/email-validation";
import {
  buildVerificationUrl,
  generateVerificationToken,
} from "../../lib/auth/email-verification";
import {
  RATE_LIMIT_EVENT_TYPES,
  anonymizeIpForAnalytics,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  rateLimitWindowStart,
  thresholdForIp,
} from "../../lib/auth/rate-limit";
import type { EmailProvider } from "../../lib/providers/email";
import { EMAIL_TEMPLATES } from "../../lib/email-templates";
import { isAppRole, type AppRole } from "../../lib/auth/roles";
import type { AnalyticsEvent } from "../../lib/analytics";
import type { RegisterActionState } from "./register-state";

export type RegisterFlowResult =
  | { ok: false; state: RegisterActionState }
  | { ok: true; redirectTo: string };

// Minimal Drizzle-compatible surface so tests can pass a hand-rolled fake
// without re-typing the entire Drizzle query builder. Real `getDb()` is
// structurally compatible.
interface SelectChain {
  from(table: unknown): { where(condition: unknown): Promise<{ id: string }[]> };
}
interface InsertWithReturning<TReturning = unknown> extends Promise<unknown> {
  returning(columns: unknown): Promise<TReturning[]>;
  onConflictDoNothing(opts?: unknown): InsertWithReturning<TReturning>;
}
interface InsertChain {
  values(value: unknown): InsertWithReturning;
}
interface DeleteChain {
  where(condition: unknown): Promise<unknown>;
}
export interface DbForRegister {
  select(cols: unknown): SelectChain;
  insert(table: unknown): InsertChain;
  delete(table: unknown): DeleteChain;
}

export interface RegisterDeps {
  db: DbForRegister;
  emailProvider: EmailProvider;
  ip: string;
  origin: string;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

function fieldErrorMessage(reason: ReturnType<typeof validatePassword>): string {
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

export async function runRegister(
  formData: FormData,
  deps: RegisterDeps,
): Promise<RegisterFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };

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
  if (!isValidEmailShape(emailRaw)) {
    fieldErrors.email = "כתובת האימייל אינה תקינה.";
  }
  const pw = validatePassword(password);
  if (!pw.ok) {
    fieldErrors.password = fieldErrorMessage(pw);
  }
  if (!tos) {
    fieldErrors.tos = "יש לאשר את תנאי השימוש.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: {
        ok: false,
        fieldErrors,
        values: { name, email: emailRaw, role, tos },
      },
    };
  }

  const { db, emailProvider, ip, origin, track } = deps;
  let userId: string;
  let token: string;

  try {
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

    const rateLimit = evaluateRateLimit({
      recentAttempts: existingAttempts.length,
      threshold: thresholdForIp(ip),
    });

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
        state: {
          ok: false,
          formError: "יותר מדי ניסיונות. נסו שוב בעוד דקה.",
          values: { name, email: emailRaw, role, tos },
        },
      };
    }

    const passwordHash = await hashPassword(password);

    // Atomic email-collision check + insert. ON CONFLICT DO NOTHING returns no
    // rows if the email already exists — no TOCTOU race between SELECT and INSERT.
    const inserted = (await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
        role,
        createdByKind: "user",
        createdByActor: "self-signup",
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id })) as { id: string }[];

    const insertedId = inserted[0]?.id;
    if (!insertedId) {
      // ON CONFLICT fired — the email is already registered. Generic error so
      // we don't enumerate which method (OAuth vs password) owns the account.
      return {
        ok: false,
        state: {
          ok: false,
          formError: "אימייל זה כבר רשום במערכת. נסו להיכנס.",
          values: { name, email: emailRaw, role, tos },
        },
      };
    }
    userId = insertedId;

    // From here on, the user row exists. If any subsequent write fails, delete
    // the user row so a retry can succeed (orphan rows would block re-signup).
    try {
      const generated = generateVerificationToken();
      token = generated.token;
      await db.insert(verificationTokens).values({
        identifier: email,
        token: generated.token,
        expires: generated.expires,
      });

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
    } catch (innerErr) {
      log.error("[runRegister] post-user write failed; cleaning up user row", innerErr);
      try {
        await db.delete(users).where(eq(users.id, userId));
      } catch (cleanupErr) {
        log.error("[runRegister] cleanup DELETE failed", cleanupErr);
      }
      throw innerErr;
    }
  } catch (err) {
    log.error("[runRegister] sequential write failed", err);
    return {
      ok: false,
      state: {
        ok: false,
        formError: "אירעה שגיאה. נסו שוב בעוד דקה.",
        values: { name, email: emailRaw, role, tos },
      },
    };
  }

  try {
    await emailProvider.sendTransactional({
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
    log.error("[runRegister] verification email send failed", err);
  }

  track({ event: "signup_completed", userId, role });

  return {
    ok: true,
    redirectTo: `/signup/verify-email-sent?email=${encodeURIComponent(email)}`,
  };
}
