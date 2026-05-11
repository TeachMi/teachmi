// Pure orchestrator for the resend-verification action. Tested via the FakeDb
// pattern in resend-flow.test.ts.

import { and, eq, gte } from "drizzle-orm";
import { auditEvents, users, verificationTokens } from "../../lib/db/schema";
import { toAuditEventValues } from "../../lib/db/audit";
import {
  RATE_LIMIT_EVENT_TYPES,
  anonymizeIpForAnalytics,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  rateLimitWindowStart,
  thresholdForIp,
} from "../../lib/auth/rate-limit";
import {
  buildVerificationUrl,
  generateVerificationToken,
} from "../../lib/auth/email-verification";
import type { EmailProvider } from "../../lib/providers/email";
import { EMAIL_TEMPLATES } from "../../lib/email-templates";
import type { AnalyticsEvent } from "../../lib/analytics";
import { isValidEmailShape } from "../../lib/auth/email-validation";

export type ResendFlowResult =
  | { kind: "redirect"; url: string }
  | { kind: "invalid_email"; url: string };

interface SelectChain {
  from(table: unknown): {
    where(condition: unknown): Promise<Array<{ id: string; emailVerified?: Date | null }>>;
  };
}
interface InsertChain {
  values(value: unknown): Promise<unknown>;
}
interface DeleteChain {
  where(condition: unknown): Promise<unknown>;
}
export interface DbForResend {
  select(cols: unknown): SelectChain;
  insert(table: unknown): InsertChain;
  delete(table: unknown): DeleteChain;
}

export interface ResendDeps {
  db: DbForResend;
  emailProvider: EmailProvider;
  ip: string;
  origin: string;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

export async function runResend(
  formData: FormData,
  deps: ResendDeps,
): Promise<ResendFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };
  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw.toLowerCase();

  if (!isValidEmailShape(emailRaw)) {
    return { kind: "invalid_email", url: `/signup/verify-error?reason=missing` };
  }

  const { db, emailProvider, ip, origin, track } = deps;

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

    const rateLimit = evaluateRateLimit({
      recentAttempts: existingAttempts.length,
      threshold: thresholdForIp(ip),
    });

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
        // Invalidate any pre-existing tokens for this identifier before
        // issuing a new one. Without this, an older token (delivered out of
        // order, e.g. spam-folder shake-out) would still work for the
        // remainder of its 15-min TTL alongside the new one.
        await db
          .delete(verificationTokens)
          .where(eq(verificationTokens.identifier, email));

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
    log.error("[runResend] DB write failed", err);
    return { kind: "redirect", url: `/signup/verify-error?reason=internal` };
  }

  if (outcome === "rate_limited") {
    track({
      event: "signup_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: "signup_resend",
    });
  } else if (outcome === "sent" && token) {
    try {
      await emailProvider.sendTransactional({
        toAddress: email,
        subject: EMAIL_TEMPLATES.AUTH_VERIFY_EMAIL.subject,
        templateId: EMAIL_TEMPLATES.AUTH_VERIFY_EMAIL.templateId,
        payload: {
          verifyUrl: buildVerificationUrl(token, origin),
          expiresInMinutes: 15,
        },
      });
    } catch (err) {
      log.error("[runResend] email send failed", err);
    }
  }

  return {
    kind: "redirect",
    url: `/signup/verify-email-sent?email=${encodeURIComponent(email)}`,
  };
}
