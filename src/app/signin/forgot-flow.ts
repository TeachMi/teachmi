// Pure orchestrator for the forgot-password Server Action (Story 1.15 FR4).
// Structural sibling of `src/app/signup/resend-flow.ts` (Story 1.13) — same
// anti-enumeration discipline: regardless of internal branch (no user found,
// OAuth-only user, real user → email sent, rate-limited), the response is a
// redirect to `/signin/forgot/sent?email=...`. Only an ill-formatted email
// returns a field-error (a UX issue, not an enumeration risk).
//
// Sequence (sequential queries — Neon HTTP has no interactive transactions,
// per Story 1.13's Debug Log):
//   1. Server-side email shape validation.
//   2. Rate-limit gate (count recent auth.password_reset_request_attempt rows
//      for this IP) + always insert the attempt audit row.
//   3. Lookup user by lower(email). Three branches:
//      - no user found → silent no-op (audit outcome: "no_user")
//      - user without passwordHash (OAuth-only) → silent no-op (outcome: "oauth_only")
//      - user with passwordHash → delete any prior tokens, issue a new one,
//        write auth.password_reset_requested audit, send email (best-effort),
//        fire password_reset_requested analytics.
//   4. Redirect to the success screen.

import { and, eq, gte } from "drizzle-orm";
import {
  auditEvents,
  passwordResetTokens,
  users,
} from "../../lib/db/schema";
import { toAuditEventValues } from "../../lib/db/audit";
import {
  RATE_LIMIT_EVENT_TYPES,
  anonymizeIpForAnalytics,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  hashEmailForAudit,
  rateLimitWindowStart,
  thresholdForIp,
} from "../../lib/auth/rate-limit";
import {
  buildPasswordResetUrl,
  generatePasswordResetToken,
} from "../../lib/auth/password-reset";
import { isValidEmailShape } from "../../lib/auth/email-validation";
import type { EmailProvider } from "../../lib/providers/email";
import { EMAIL_TEMPLATES } from "../../lib/email-templates";
import type { AnalyticsEvent } from "../../lib/analytics";

export type ForgotFlowResult =
  | { kind: "redirect"; url: string }
  | { kind: "invalid_email"; email: string };

interface UsersRowForForgot {
  id: string;
  name: string | null;
  passwordHash: string | null;
  deletedAt: Date | null;
}

interface SelectChain<TRow> {
  from(table: unknown): { where(condition: unknown): Promise<TRow[]> };
}
interface InsertChain {
  values(value: unknown): Promise<unknown>;
}
interface DeleteChain {
  where(condition: unknown): Promise<unknown>;
}
export interface DbForForgot {
  select<TRow = unknown>(cols: unknown): SelectChain<TRow>;
  insert(table: unknown): InsertChain;
  delete(table: unknown): DeleteChain;
}

export interface ForgotDeps {
  db: DbForForgot;
  emailProvider: EmailProvider;
  ip: string;
  origin: string;
  track: (event: AnalyticsEvent) => void;
  /** Override for tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  logger?: { error: (message: string, err?: unknown) => void };
}

export async function runForgotPassword(
  formData: FormData,
  deps: ForgotDeps,
): Promise<ForgotFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };
  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw.toLowerCase();

  if (!isValidEmailShape(emailRaw)) {
    return { kind: "invalid_email", email: emailRaw };
  }

  const { db, emailProvider, ip, origin, track } = deps;
  const nowFn = deps.now ?? (() => new Date());

  // The success redirect URL is the same for every internal branch.
  const successUrl = `/signin/forgot/sent?email=${encodeURIComponent(email)}`;

  let outcome:
    | { kind: "rate_limited" }
    | { kind: "no_user" }
    | { kind: "oauth_only" }
    | { kind: "sent"; token: string; userId: string; displayName: string | null };

  try {
    const windowStart = rateLimitWindowStart(nowFn());
    const existingAttempts = await db
      .select<{ id: string }>({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, RATE_LIMIT_EVENT_TYPES.password_reset_request),
          eq(auditEvents.actorMeta, ip),
          gte(auditEvents.createdAt, windowStart),
        ),
      );

    const rateLimit = evaluateRateLimit({
      recentAttempts: existingAttempts.length,
      threshold: thresholdForIp(ip),
    });

    // Always insert the attempt audit row (monotonic counter — same pattern
    // as signup/signin rate-limit accounting).
    await db
      .insert(auditEvents)
      .values(
        toAuditEventValues(
          buildAttemptAuditEvent({
            ip,
            action: "password_reset_request",
            email,
          }),
        ),
      );

    if (!rateLimit.allowed) {
      outcome = { kind: "rate_limited" };
    } else {
      const matched = await db
        .select<UsersRowForForgot>({
          id: users.id,
          name: users.name,
          passwordHash: users.passwordHash,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.email, email));

      const user = matched[0];
      if (!user || user.deletedAt !== null) {
        outcome = { kind: "no_user" };
      } else if (!user.passwordHash) {
        outcome = { kind: "oauth_only" };
      } else {
        // Invalidate any older un-consumed tokens for this email before issuing
        // a new one (defense against an attacker holding a previously-leaked
        // link still being able to use it after the user re-requests).
        await db
          .delete(passwordResetTokens)
          .where(eq(passwordResetTokens.identifier, email));

        const generated = generatePasswordResetToken(nowFn());
        await db.insert(passwordResetTokens).values({
          identifier: email,
          token: generated.token,
          expires: generated.expires,
        });

        outcome = {
          kind: "sent",
          token: generated.token,
          userId: user.id,
          displayName: user.name,
        };
      }
    }

    // Write the per-outcome audit event row (separate from the attempt row so
    // a counter-by-eventType query distinguishes "real sends" from raw attempts).
    if (outcome.kind === "no_user") {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.password_reset_request_attempt",
          actorKind: "system",
          actorId: null,
          actorMeta: ip,
          targetType: "user",
          targetId: null,
          payload: { emailHash: hashEmailForAudit(email), outcome: "no_user" },
        }),
      );
    } else if (outcome.kind === "oauth_only") {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.password_reset_request_attempt",
          actorKind: "system",
          actorId: null,
          actorMeta: ip,
          targetType: "user",
          targetId: null,
          payload: { emailHash: hashEmailForAudit(email), outcome: "oauth_only" },
        }),
      );
    } else if (outcome.kind === "sent") {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.password_reset_requested",
          actorKind: "user",
          actorId: outcome.userId,
          targetType: "user",
          targetId: outcome.userId,
          payload: { emailHash: hashEmailForAudit(email) },
        }),
      );
    }
    // For rate_limited, the attempt row above already captures it; no extra row.
  } catch (err) {
    log.error("[runForgotPassword] DB write failed", err);
    // Still redirect to the success screen — the user must not learn whether
    // the failure happened on the real-send branch vs the no-user branch.
    return { kind: "redirect", url: successUrl };
  }

  if (outcome.kind === "rate_limited") {
    track({
      event: "password_reset_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: "password_reset_request",
    });
  } else if (outcome.kind === "sent") {
    try {
      await emailProvider.sendTransactional({
        toAddress: email,
        subject: EMAIL_TEMPLATES.AUTH_PASSWORD_RESET.subject,
        templateId: EMAIL_TEMPLATES.AUTH_PASSWORD_RESET.templateId,
        payload: {
          resetUrl: buildPasswordResetUrl(outcome.token, origin),
          expiresInMinutes: 15,
          displayName: outcome.displayName,
        },
      });
    } catch (err) {
      log.error("[runForgotPassword] reset email send failed", err);
    }
    track({
      event: "password_reset_requested",
      anonymizedIp: anonymizeIpForAnalytics(ip),
    });
  }

  return { kind: "redirect", url: successUrl };
}
