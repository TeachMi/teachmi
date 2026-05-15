// Pure orchestrator for the signup `registerAction`. Tested via the
// FakeDb / FakeEmailProvider / FakeTrack pattern in registration-flow.test.ts.
// `actions.ts` ("use server") is the thin Next.js wrapper that builds the real
// dependencies and converts the outcome into a redirect / state return.

import { and, eq, gte } from "drizzle-orm";
import {
  auditEvents,
  consentReceipts,
  notificationPreferences,
  users,
  verificationTokens,
} from "../../lib/db/schema";
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
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  truncateUserAgent,
} from "../../lib/legal/privacy-consent";
import { CURRENT_MARKETING_OPTIN_VERSION } from "../../lib/legal/marketing-consent";
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
  onConflictDoUpdate(opts: unknown): InsertWithReturning<TReturning>;
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
  /**
   * Raw `User-Agent` header value, captured by the action wrapper from
   * `headers().get("user-agent")`. May be null in non-browser test contexts.
   * Stored on the `consent_receipts` row alongside `ipAddress` for audit
   * traceability under NFR16 / FR59. Truncated to 512 chars at insert.
   */
  userAgent: string | null;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
  /**
   * Dev-only override: when true, the new user is created with
   * `emailVerified: now()`, the verification-email loop is skipped, and the
   * redirect goes to `/signin?verified=1` instead of the verify-email-sent
   * screen. The action wrapper sources this from `isEmailVerificationSkipEnabled()`
   * which hard-refuses in production; tests may override directly.
   */
  skipEmailVerification?: boolean;
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
  const privacyPolicy =
    formData.get("privacyPolicy") === "on" ||
    formData.get("privacyPolicy") === "true" ||
    formData.get("privacyPolicy") === "1";
  // Story 1.22: marketing-comm opt-in. OPTIONAL — no field-level validation,
  // no fieldErrors entry. Absence simply means "do not send marketing".
  const marketingOptIn =
    formData.get("marketingOptIn") === "on" ||
    formData.get("marketingOptIn") === "true" ||
    formData.get("marketingOptIn") === "1";

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
  if (!privacyPolicy) {
    fieldErrors.privacyPolicy = "יש לאשר את מדיניות הפרטיות.";
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
        values: { name, email: emailRaw, role, tos, privacyPolicy, marketingOptIn },
      },
    };
  }

  const { db, emailProvider, ip, origin, track } = deps;
  let userId: string;
  let token: string;
  // Hoisted so the post-tx block (email send + redirect) can branch on it.
  // Sourced from `deps.skipEmailVerification` which the action wrapper feeds
  // via `isEmailVerificationSkipEnabled()` (production-guarded).
  const skipVerification = deps.skipEmailVerification === true;

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
          values: { name, email: emailRaw, role, tos, privacyPolicy, marketingOptIn },
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
        ...(skipVerification ? { emailVerified: new Date() } : {}),
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
          values: { name, email: emailRaw, role, tos, privacyPolicy, marketingOptIn },
        },
      };
    }
    userId = insertedId;

    // From here on, the user row exists. If any subsequent write fails, delete
    // the user row so a retry can succeed (orphan rows would block re-signup).
    try {
      if (skipVerification) {
        // Dev-only path: user is already verified at insert-time; no token, no
        // email. Audit row records the bypass so it shows up in audit-log
        // forensics ("how did this user get here without a verify event?").
        token = "";
        await db.insert(auditEvents).values(
          toAuditEventValues({
            eventType: "auth.user_registered",
            actorKind: "user",
            actorId: userId,
            targetType: "user",
            targetId: userId,
            payload: {
              role,
              hasPassword: true,
              requiresVerification: false,
              devEmailVerificationSkipped: true,
            },
          }),
        );
      } else {
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
      }
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
        values: { name, email: emailRaw, role, tos, privacyPolicy, marketingOptIn },
      },
    };
  }

  if (!skipVerification) {
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
  } else {
    log.error(
      "[runRegister] dev-only skip-email-verification path taken (NODE_ENV=" +
        (process.env.NODE_ENV ?? "undefined") +
        "); user " +
        userId +
        " stamped email_verified at insert — NEVER reach this branch in prod.",
    );
  }

  // FR59 consent capture — moved OUTSIDE the cleanup-protected inner try
  // (Story 1.21 review [H1]). The original spec put these inside the inner
  // try, but the FK from consent_receipts.userId -> users.id (NO ACTION) +
  // the immutability trigger on consent_receipts means: if the audit insert
  // failed AFTER the consent insert succeeded, the cleanup DELETE on users
  // would itself fail, leaving the user permanently orphaned with their
  // email locked out of re-signup. Strictly worse regulatory outcome than
  // "user committed, receipt slightly later via the dashboard gate
  // re-prompt". So we accept the brief window between signup-commit and
  // first-signin where the user has no receipt — the gate at /dashboard
  // (AC3) closes that window the moment the user signs in.
  let privacyConsentLogged = false;
  try {
    const acceptedAt = new Date();
    const ipAddress = ip === "unknown" ? null : ip;
    // ON CONFLICT DO NOTHING against the new unique constraint
    // (userId, documentType, documentVersion) — Story 1.21 round-2 fix.
    // The constraint enforces "one row per (user, type, version)" from the
    // schema comment; under concurrent signup retries (extremely rare —
    // signup uses ON CONFLICT on email earlier in the flow so this would
    // require a parallel sub-millisecond retry) the loser silently no-ops
    // instead of erroring out.
    const consentInsert = (await db
      .insert(consentReceipts)
      .values({
        userId,
        documentType: "privacy_policy",
        documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
        acceptedAt,
        ipAddress,
        userAgent: truncateUserAgent(deps.userAgent),
        signature: null,
        documentSnapshot: null,
        createdByKind: "user",
        createdByActor: userId,
      })
      .onConflictDoNothing({
        target: [
          consentReceipts.userId,
          consentReceipts.documentType,
          consentReceipts.documentVersion,
        ],
      })
      .returning({ id: consentReceipts.id })) as { id: string }[];

    // If a concurrent process wrote the same (user, type, version) row
    // first, our insert returns empty. The receipt still exists at the
    // target version, so the regulatory invariant holds — but skip the
    // audit + analytics writes for this attempt so we don't double-count.
    if (consentInsert.length === 0) {
      privacyConsentLogged = false;
    } else {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.privacy_policy_accepted",
          actorKind: "user",
          actorId: userId,
          actorMeta: ipAddress, // Story 1.21 review [M2]: align shape with accept-flow.
          targetType: "user",
          targetId: userId,
          payload: {
            documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
            source: "signup",
          },
        }),
      );

      privacyConsentLogged = true;
    }
  } catch (consentErr) {
    log.error(
      `[runRegister] privacy-policy consent capture failed for userId=${userId}; dashboard gate will re-prompt on first signin`,
      consentErr,
    );
    // Intentionally do NOT throw. User is fully registered; the gate at
    // /dashboard (requirePrivacyConsent) catches the missing receipt and
    // redirects to /legal/privacy/accept on the user's next authenticated
    // request, closing the FR59 loop.
  }

  if (privacyConsentLogged) {
    track({
      event: "privacy_policy_accepted",
      userId,
      role,
      documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      source: "signup",
    });
  }

  // FR60 marketing-opt-in capture. Out here alongside the privacy block,
  // OUTSIDE the cleanup-protected inner try — same reasoning as the privacy
  // block (Story 1.21 review [H1] comment above). Three writes in sequence
  // form an atomicity unit at the analytics layer: consent receipt → audit
  // event → notification_preferences upsert. Any failure → log, swallow, do
  // NOT roll back the user, do NOT fire the analytics event. Marketing
  // opt-in is OPTIONAL — absence is the default state and a write failure
  // is non-blocking.
  let marketingOptInLogged = false;
  if (marketingOptIn) {
    try {
      const acceptedAt = new Date();
      const ipAddress = ip === "unknown" ? null : ip;

      const marketingConsentInsert = (await db
        .insert(consentReceipts)
        .values({
          userId,
          documentType: "marketing_opt_in",
          documentVersion: CURRENT_MARKETING_OPTIN_VERSION,
          acceptedAt,
          ipAddress,
          userAgent: truncateUserAgent(deps.userAgent),
          signature: null,
          documentSnapshot: null,
          createdByKind: "user",
          createdByActor: userId,
        })
        .onConflictDoNothing({
          target: [
            consentReceipts.userId,
            consentReceipts.documentType,
            consentReceipts.documentVersion,
          ],
        })
        .returning({ id: consentReceipts.id })) as { id: string }[];

      if (marketingConsentInsert.length > 0) {
        await db.insert(auditEvents).values(
          toAuditEventValues({
            eventType: "auth.marketing_optin_accepted",
            actorKind: "user",
            actorId: userId,
            actorMeta: ipAddress,
            targetType: "user",
            targetId: userId,
            payload: {
              documentVersion: CURRENT_MARKETING_OPTIN_VERSION,
              source: "signup",
            },
          }),
        );

        // UPSERT notification_preferences. On INSERT, let the table defaults
        // populate the other 6 booleans (marketingSms/whatsapp default false;
        // transactionalEmail default true per FR42). On UPDATE — defense
        // against a stale row from a future Epic 6 settings UI write (a user
        // who previously toggled marketingSms=true in settings and then signs
        // in again via a re-registration path). Only flip marketingEmail; do
        // NOT clobber other channel booleans the settings UI may have set.
        // (Story 1.17 hard-delete is NOT a relevant scenario here because
        // notification_preferences.userId has ON DELETE CASCADE in the schema,
        // so a user hard-delete removes this row entirely — there is no stale
        // row left over from that path.) See the story Dev Notes "Why a
        // partial update on the UPDATE branch". [Code review round 1, P-1.]
        await db
          .insert(notificationPreferences)
          .values({
            userId,
            marketingEmail: true,
            createdByKind: "user",
            createdByActor: userId,
          })
          .onConflictDoUpdate({
            target: notificationPreferences.userId,
            set: {
              marketingEmail: true,
              updatedAt: new Date(),
              updatedByKind: "user",
              updatedByActor: userId,
            },
          });

        marketingOptInLogged = true;
      }
    } catch (marketingErr) {
      log.error(
        `[runRegister] marketing-opt-in capture failed for userId=${userId}; user remains registered, marketing analytics skipped`,
        marketingErr,
      );
      // Intentionally do NOT throw. Marketing opt-in is OPTIONAL — a write
      // failure is non-blocking. The user can re-opt-in via the future
      // Epic 6 settings UI.
      //
      // Known partial-failure mode (code review round 1, DN-1): if the
      // consent_receipts insert succeeds but the auditEvents insert OR the
      // notification_preferences UPSERT fails, the user ends up with a
      // marketing_opt_in receipt at CURRENT_MARKETING_OPTIN_VERSION but
      // `marketing_email = false`. Subsequent submits hit ON CONFLICT DO
      // NOTHING on the receipt and skip this entire block, so the preference
      // flip is never retried inside `runRegister`. Accepted for MVP1
      // because (a) the failure rate is very low on Neon HTTP, (b) the
      // user-INSERT's ON CONFLICT on email already gates true concurrency
      // here, (c) Epic 6 / Story 6.3's settings UI will self-heal by
      // re-running the UPSERT on any visit (idempotent). Logged for ops
      // visibility; tracked in deferred-work.md.
    }
  }

  if (marketingOptInLogged) {
    track({
      event: "marketing_optin_accepted",
      userId,
      role,
      documentVersion: CURRENT_MARKETING_OPTIN_VERSION,
      source: "signup",
    });
  }

  track({ event: "signup_completed", userId, role });

  return {
    ok: true,
    redirectTo: skipVerification
      ? "/signin?verified=1"
      : `/signup/verify-email-sent?email=${encodeURIComponent(email)}`,
  };
}
