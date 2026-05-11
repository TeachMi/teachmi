// Pure orchestrator for the signin Server Action. Tested via FakeDb pattern in
// signin-flow.test.ts. `actions.ts` ("use server") is the thin Next.js wrapper
// that builds the real dependencies and converts the outcome into a redirect /
// state return.
//
// Sequence (mirrors Story 1.13's registration-flow.ts):
//  1. Server-side validation (email shape + non-empty password).
//  2. Rate-limit: count recent auth.signin_attempt rows for this IP, insert the
//     attempt row regardless of outcome.
//  3. If rate-limited → return generic throttle formError + fire PostHog
//     signin_rate_limited.
//  4. Call signIn("credentials", { ..., redirect: false }). Auth.js throws
//     `CredentialsSignin` (subclass of AuthError) when authorize() returns null;
//     any other throw is treated as an unexpected error.
//  5. On success → look up the userId (post-signIn) → write auth.signin_succeeded
//     audit row → return { ok: true, redirectTo }.
//  6. On CredentialsSignin → write auth.signin_failed audit row + fire PostHog
//     signin_failed → return generic formError.
//  7. On unexpected error → log + generic formError (no PostHog signin_failed —
//     it's not a credentials-rejection signal).

import { and, eq, gte } from "drizzle-orm";
import { auditEvents, users } from "../../lib/db/schema";
import { toAuditEventValues } from "../../lib/db/audit";
import { isValidEmailShape } from "../../lib/auth/email-validation";
import {
  RATE_LIMIT_EVENT_TYPES,
  anonymizeIpForAnalytics,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  hashEmailForAudit,
  rateLimitWindowStart,
  thresholdForIp,
} from "../../lib/auth/rate-limit";
import { getSafeCallbackUrl } from "../../lib/auth/callback-url";
import type { AnalyticsEvent } from "../../lib/analytics";
import type { SignInActionState } from "./signin-state";

export type SigninFlowResult =
  | { ok: false; state: SignInActionState }
  | { ok: true; redirectTo: string };

interface SelectChain<TRow> {
  from(table: unknown): { where(condition: unknown): Promise<TRow[]> };
}
interface InsertChain {
  values(value: unknown): Promise<unknown>;
}

export interface DbForSignin {
  select<TRow = unknown>(cols: unknown): SelectChain<TRow>;
  insert(table: unknown): InsertChain;
}

export type SignInDelegate = (
  provider: "credentials",
  params: { email: string; password: string; redirect: false },
) => Promise<unknown>;

export interface SigninDeps {
  db: DbForSignin;
  signIn: SignInDelegate;
  ip: string;
  callbackUrl: string | null;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

const GENERIC_INVALID_CREDS_HE = "אימייל או סיסמה לא נכונים.";
const RATE_LIMITED_HE = "יותר מדי ניסיונות. נסו שוב בעוד דקה.";
const UNEXPECTED_HE = "אירעה שגיאה. נסו שוב בעוד דקה.";

function isCredentialsSigninError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; type?: unknown };
  return e.name === "CredentialsSignin" || e.type === "CredentialsSignin";
}

export async function runSignin(
  formData: FormData,
  deps: SigninDeps,
): Promise<SigninFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };

  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw.toLowerCase();
  const password = String(formData.get("password") ?? "");

  const fieldErrors: NonNullable<SignInActionState["fieldErrors"]> = {};
  if (!isValidEmailShape(emailRaw)) {
    fieldErrors.email = "כתובת האימייל אינה תקינה.";
  }
  if (password.length === 0) {
    fieldErrors.password = "יש להזין סיסמה.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: { ok: false, fieldErrors, values: { email: emailRaw } },
    };
  }

  const { db, ip, track } = deps;

  // -- Rate-limit --
  try {
    const windowStart = rateLimitWindowStart();
    const existingAttempts = await db
      .select<{ id: string }>({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, RATE_LIMIT_EVENT_TYPES.signin),
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
        toAuditEventValues(buildAttemptAuditEvent({ ip, action: "signin", email })),
      );

    if (!rateLimit.allowed) {
      track({
        event: "signin_rate_limited",
        anonymizedIp: anonymizeIpForAnalytics(ip),
        action: "signin",
      });
      return {
        ok: false,
        state: {
          ok: false,
          formError: RATE_LIMITED_HE,
          values: { email: emailRaw },
        },
      };
    }
  } catch (err) {
    log.error("[runSignin] rate-limit write failed", err);
    return {
      ok: false,
      state: {
        ok: false,
        formError: UNEXPECTED_HE,
        values: { email: emailRaw },
      },
    };
  }

  // -- signIn --
  try {
    await deps.signIn("credentials", { email, password, redirect: false });
  } catch (err) {
    // Duck-typed check: any CredentialsSignin (AuthError subclass from
     // @auth/core) sets `name === "CredentialsSignin"` AND `type === "CredentialsSignin"`
     // via its constructor. Avoiding `instanceof AuthError` here sidesteps a
     // vitest-time module-resolution issue with `next-auth`'s entry-point
     // pulling in `next/server` and lets tests construct lookalike errors.
    if (isCredentialsSigninError(err)) {
      // Wrong credentials path: write the failed audit + fire PostHog +
      // return the generic copy. Do NOT bubble the AuthError further.
      try {
        await db.insert(auditEvents).values(
          toAuditEventValues({
            eventType: "auth.signin_failed",
            actorKind: "user",
            actorId: null,
            actorMeta: ip,
            targetType: "user",
            targetId: null,
            payload: {
              emailHash: hashEmailForAudit(email),
              reason: "invalid_credentials",
            },
          }),
        );
      } catch (auditErr) {
        log.error("[runSignin] failed-audit write failed", auditErr);
      }
      track({
        event: "signin_failed",
        anonymizedIp: anonymizeIpForAnalytics(ip),
      });
      return {
        ok: false,
        state: {
          ok: false,
          formError: GENERIC_INVALID_CREDS_HE,
          values: { email: emailRaw },
        },
      };
    }

    // Any other thrown error: log, return generic formError, do NOT fire
    // PostHog signin_failed (this isn't a credentials-rejection signal).
    log.error("[runSignin] signIn() threw unexpected error", err);
    return {
      ok: false,
      state: {
        ok: false,
        formError: UNEXPECTED_HE,
        values: { email: emailRaw },
      },
    };
  }

  // -- success path: look up userId for the audit row, then write it --
  try {
    const rows = await db
      .select<{ id: string }>({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    const userId = rows[0]?.id ?? null;

    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "auth.signin_succeeded",
        actorKind: "user",
        actorId: userId,
        targetType: "user",
        targetId: userId,
        payload: { provider: "credentials" },
      }),
    );
  } catch (err) {
    // Non-fatal: the user is signed in (cookie + sessions row set by signIn).
    // Audit-row write failure is logged but doesn't roll back the success.
    log.error("[runSignin] success-audit write failed", err);
  }

  return {
    ok: true,
    redirectTo: getSafeCallbackUrl(deps.callbackUrl),
  };
}

