// Pure orchestrator for the signin Server Action. Tested via FakeDb pattern in
// signin-flow.test.ts. `actions.ts` ("use server") is the thin Next.js wrapper
// that builds the real dependencies, sets the cookie on success, and converts
// the outcome into a redirect / state return.
//
// Why we don't use Auth.js's signIn("credentials", ...) here:
// Auth.js v5 (next-auth 5.0.0-beta.31, @auth/core 0.41.2) hardcodes a JWT
// cookie for credentials sign-ins regardless of `session.strategy`. See
// node_modules/.pnpm/@auth+core@0.41.2/node_modules/@auth/core/lib/actions/callback/index.js:247-274
// and node_modules/.pnpm/@auth+core@0.41.2/node_modules/@auth/core/providers/credentials.d.ts:74-75
// ("the Credentials provider can only be used if JSON Web Tokens are enabled
// for sessions"). Going through the provider would set a JWT cookie while
// session.strategy: "database" means `auth()` reads from the sessions table —
// the cookie wouldn't validate and the user would be stuck in a sign-in loop.
//
// Resolution: call authorizeWithCredentials() directly, then mirror Story 1.13's
// verify Route Handler (src/app/signup/verify/route.ts) — direct INSERT into
// `sessions` + manual cookie set. Same row shape, same cookie name, same
// attributes — so the session is interchangeable with one from Google OAuth
// or from the post-verify path.
//
// Sequence:
//  1. Server-side validation (email shape + non-empty password).
//  2. Rate-limit: count recent auth.signin_attempt rows for this IP, insert
//     the attempt row regardless of outcome.
//  3. If rate-limited → return generic throttle formError + fire PostHog
//     signin_rate_limited.
//  4. authorizeWithCredentials → null path → wrong creds; user path → success.
//  5. On wrong creds → write auth.signin_failed audit row + fire PostHog
//     signin_failed → return generic formError.
//  6. On success → generate UUID session token → INSERT sessions row →
//     write auth.signin_succeeded audit row → return cookie material.

import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { auditEvents, sessions } from "../../lib/db/schema";
import { toAuditEventValues } from "../../lib/db/audit";
import { isValidEmailShape } from "../../lib/auth/email-validation";
import {
  authorizeWithCredentials,
  type DbForAuthorize,
} from "../../lib/auth/credentials-authorize";
import { verifyPassword } from "../../lib/auth/password-hashing";
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

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SigninFlowResult =
  | { ok: false; state: SignInActionState }
  | {
      ok: true;
      redirectTo: string;
      sessionToken: string;
      expires: Date;
    };

interface SelectChain<TRow> {
  from(table: unknown): { where(condition: unknown): Promise<TRow[]> };
}
interface InsertChain {
  values(value: unknown): Promise<unknown>;
}

export interface DbForSignin extends DbForAuthorize {
  select<TRow = unknown>(cols: unknown): SelectChain<TRow>;
  insert(table: unknown): InsertChain;
}

export interface SigninDeps {
  db: DbForSignin;
  /** Optional override; defaults to `verifyPassword` from password-hashing. */
  verifyPassword?: (plain: string, encoded: string) => Promise<boolean>;
  /** Optional override; defaults to `node:crypto.randomUUID`. */
  generateSessionToken?: () => string;
  /** Optional override; defaults to `new Date()`. */
  now?: () => Date;
  ip: string;
  callbackUrl: string | null;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

const GENERIC_INVALID_CREDS_HE = "אימייל או סיסמה לא נכונים.";
const RATE_LIMITED_HE = "יותר מדי ניסיונות. נסו שוב בעוד דקה.";
const UNEXPECTED_HE = "אירעה שגיאה. נסו שוב בעוד דקה.";

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
  const verify = deps.verifyPassword ?? verifyPassword;
  const generateSessionToken = deps.generateSessionToken ?? (() => randomUUID());
  const nowFn = deps.now ?? (() => new Date());

  // -- Rate-limit --
  try {
    const windowStart = rateLimitWindowStart(nowFn());
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

  // -- authorize: pure check against users.email + verifyPassword --
  let user: Awaited<ReturnType<typeof authorizeWithCredentials>>;
  try {
    user = await authorizeWithCredentials(
      { email, password },
      { db, verifyPassword: verify },
    );
  } catch (err) {
    log.error("[runSignin] authorize() threw unexpectedly", err);
    return {
      ok: false,
      state: {
        ok: false,
        formError: UNEXPECTED_HE,
        values: { email: emailRaw },
      },
    };
  }

  if (!user) {
    // Wrong credentials path. Write the failed audit row (best-effort — do not
    // bubble a write failure to the user as an "unexpected" error; the auth
    // outcome is already determined).
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

  // -- success: mint a session token, insert sessions row, write audit --
  // Mirrors src/app/signup/verify/route.ts so that a Credentials signin and
  // a post-verify signin produce structurally identical rows + cookies.
  const sessionToken = generateSessionToken();
  const now = nowFn();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);

  try {
    await db.insert(sessions).values({
      sessionToken,
      userId: user.id,
      expires,
    });
  } catch (err) {
    log.error("[runSignin] session INSERT failed", err);
    return {
      ok: false,
      state: {
        ok: false,
        formError: UNEXPECTED_HE,
        values: { email: emailRaw },
      },
    };
  }

  try {
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "auth.signin_succeeded",
        actorKind: "user",
        actorId: user.id,
        targetType: "user",
        targetId: user.id,
        payload: { provider: "credentials" },
      }),
    );
  } catch (err) {
    log.error("[runSignin] success-audit write failed", err);
  }

  return {
    ok: true,
    redirectTo: getSafeCallbackUrl(deps.callbackUrl),
    sessionToken,
    expires,
  };
}
