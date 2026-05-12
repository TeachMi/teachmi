// Pure orchestrator for the reset-password confirm Server Action (Story 1.15
// FR4). Structural twin of `signin-flow.ts` (Story 1.14) — sequential queries
// (Neon HTTP), pure-function deps. The action wrapper handles redirect / cookie.
//
// Sequence (per story AC4):
//   1. Server-side validation (token non-empty, password validity, confirm match).
//   2. Rate-limit gate (count recent auth.password_reset_confirm_attempt rows
//      for this IP) + always insert the attempt audit row. Rate-limit IS
//      surfaced on the confirm endpoint (unlike forgot) — the attacker already
//      has a valid token here, so enumeration is moot.
//   3. Atomic-ish token lookup: SELECT row by token, evaluate validity.
//   4. User lookup by lower(identifier).
//   5. Hash new password, UPDATE users.password_hash, DELETE token (single-use),
//      DELETE all other reset tokens for this user, DELETE all sessions for
//      this user (forced re-sign-in — per story Dev Notes "Session invalidation:
//      load-bearing security decision"), write completion audit rows.
//   6. Fire password_reset_completed analytics.

import { and, eq, gte } from "drizzle-orm";
import {
  auditEvents,
  passwordResetTokens,
  sessions,
  users,
} from "../../lib/db/schema";
import { toAuditEventValues } from "../../lib/db/audit";
import {
  PASSWORD_MIN_LENGTH,
  validatePassword,
  type PasswordValidationResult,
} from "../../lib/auth/registration";
import { hashPassword } from "../../lib/auth/password-hashing";
import {
  evaluateResetTokenValidity,
  type ResetTokenRow,
} from "../../lib/auth/password-reset";
import {
  RATE_LIMIT_EVENT_TYPES,
  anonymizeIpForAnalytics,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  hashEmailForAudit,
  rateLimitWindowStart,
  thresholdForIp,
} from "../../lib/auth/rate-limit";
import { isAppRole, type AppRole } from "../../lib/auth/roles";
import type { AnalyticsEvent } from "../../lib/analytics";
import type { ResetPasswordActionState } from "./reset-state";

export type ResetFlowResult =
  | { ok: false; state: ResetPasswordActionState }
  | { ok: false; redirectTo: string }
  | { ok: true; redirectTo: string };

interface UsersRowForReset {
  id: string;
  role: string;
  deletedAt: Date | null;
}

interface TokenLookupRow {
  identifier: string;
  expires: Date;
}

interface SelectChain<TRow> {
  from(table: unknown): { where(condition: unknown): Promise<TRow[]> };
}
interface InsertChain {
  values(value: unknown): Promise<unknown>;
}
interface UpdateChain {
  set(set: unknown): { where(condition: unknown): Promise<unknown> };
}
interface DeleteChain {
  where(condition: unknown): Promise<unknown>;
}
export interface DbForReset {
  select<TRow = unknown>(cols: unknown): SelectChain<TRow>;
  insert(table: unknown): InsertChain;
  update(table: unknown): UpdateChain;
  delete(table: unknown): DeleteChain;
}

export interface ResetDeps {
  db: DbForReset;
  /** Optional override; defaults to `hashPassword` from password-hashing. */
  hashPassword?: (plain: string) => Promise<string>;
  /** Optional override; defaults to `new Date()`. */
  now?: () => Date;
  ip: string;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

const RATE_LIMITED_HE = "יותר מדי ניסיונות. נסו שוב בעוד דקה.";
const UNEXPECTED_HE = "אירעה שגיאה. נסו שוב.";

function fieldErrorForPassword(result: PasswordValidationResult): string {
  if (result.ok) return "";
  if (result.reason === "too_short") {
    return `סיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים.`;
  }
  if (result.reason === "missing_letter") {
    return "סיסמה חייבת להכיל לפחות אות אחת.";
  }
  return "סיסמה חייבת להכיל לפחות ספרה אחת.";
}

export async function runResetPassword(
  formData: FormData,
  deps: ResetDeps,
): Promise<ResetFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };
  const { db, ip, track } = deps;
  const hashFn = deps.hashPassword ?? hashPassword;
  const nowFn = deps.now ?? (() => new Date());

  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  // -- Rate-limit gate (FIRST so we capture even ill-formed input as an attempt). --
  try {
    const windowStart = rateLimitWindowStart(nowFn());
    const existingAttempts = await db
      .select<{ id: string }>({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, RATE_LIMIT_EVENT_TYPES.password_reset_confirm),
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
          buildAttemptAuditEvent({ ip, action: "password_reset_confirm" }),
        ),
      );

    if (!rateLimit.allowed) {
      track({
        event: "password_reset_rate_limited",
        anonymizedIp: anonymizeIpForAnalytics(ip),
        action: "password_reset_confirm",
      });
      return {
        ok: false,
        state: { ok: false, formError: RATE_LIMITED_HE },
      };
    }
  } catch (err) {
    log.error("[runResetPassword] rate-limit write failed", err);
    return { ok: false, state: { ok: false, formError: UNEXPECTED_HE } };
  }

  // -- Field validation --
  const fieldErrors: NonNullable<ResetPasswordActionState["fieldErrors"]> = {};
  if (!token) {
    fieldErrors.token = "קישור לא תקף.";
  }
  const pw = validatePassword(password);
  if (!pw.ok) {
    fieldErrors.password = fieldErrorForPassword(pw);
  }
  if (password !== passwordConfirm) {
    fieldErrors.passwordConfirm = "הסיסמאות אינן זהות.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    // Audit invalid input (so brute-force attempts to enumerate token validity
    // via field-shape leave a trail).
    try {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.password_reset_confirm_attempt",
          actorKind: "user",
          actorId: null,
          actorMeta: ip,
          targetType: "user",
          targetId: null,
          payload: { outcome: "invalid_input" },
        }),
      );
    } catch (err) {
      log.error("[runResetPassword] invalid-input audit write failed", err);
    }
    return { ok: false, state: { ok: false, fieldErrors } };
  }

  // -- Token lookup + validity --
  let tokenRow: ResetTokenRow | null = null;
  try {
    const rows = await db
      .select<TokenLookupRow>({
        identifier: passwordResetTokens.identifier,
        expires: passwordResetTokens.expires,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    tokenRow = rows[0] ?? null;
  } catch (err) {
    log.error("[runResetPassword] token lookup failed", err);
    return { ok: false, state: { ok: false, formError: UNEXPECTED_HE } };
  }

  const validity = evaluateResetTokenValidity(tokenRow, nowFn());
  if (!validity.valid) {
    try {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.password_reset_confirm_attempt",
          actorKind: "user",
          actorId: null,
          actorMeta: ip,
          targetType: "user",
          targetId: null,
          payload: { outcome: validity.reason },
        }),
      );
    } catch (err) {
      log.error("[runResetPassword] invalid-token audit write failed", err);
    }
    return {
      ok: false,
      redirectTo: `/signin/reset/error?reason=${encodeURIComponent(validity.reason)}`,
    };
  }

  const identifier = validity.identifier;

  // -- User lookup --
  let user: UsersRowForReset | null = null;
  try {
    const rows = await db
      .select<UsersRowForReset>({
        id: users.id,
        role: users.role,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.email, identifier));
    user = rows[0] ?? null;
  } catch (err) {
    log.error("[runResetPassword] user lookup failed", err);
    return { ok: false, state: { ok: false, formError: UNEXPECTED_HE } };
  }

  if (!user || user.deletedAt !== null) {
    try {
      await db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.password_reset_confirm_attempt",
          actorKind: "user",
          actorId: null,
          actorMeta: ip,
          targetType: "user",
          targetId: null,
          payload: { emailHash: hashEmailForAudit(identifier), outcome: "user_gone" },
        }),
      );
    } catch (err) {
      log.error("[runResetPassword] user-gone audit write failed", err);
    }
    return {
      ok: false,
      redirectTo: `/signin/reset/error?reason=user_gone`,
    };
  }

  const userId = user.id;
  const role: AppRole = isAppRole(user.role) ? user.role : "student";

  // -- Hash + apply --
  let passwordHash: string;
  try {
    passwordHash = await hashFn(password);
  } catch (err) {
    log.error("[runResetPassword] hashPassword failed", err);
    return { ok: false, state: { ok: false, formError: UNEXPECTED_HE } };
  }

  try {
    // 7a. Update the password hash.
    await db
      .update(users)
      .set({
        passwordHash,
        updatedByKind: "user",
        updatedByActor: userId,
      })
      .where(eq(users.id, userId));

    // 7b. Consume the used token.
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));

    // 7c. Best-effort: invalidate any OTHER un-consumed reset tokens for this
    //     identifier. Defense against a parallel-token race.
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.identifier, identifier));

    // 7d. Invalidate ALL existing sessions for this user (forced re-sign-in
    //     everywhere — see story Dev Notes "Session invalidation").
    await db.delete(sessions).where(eq(sessions.userId, userId));

    // 7e. Audit the attempt outcome.
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "auth.password_reset_confirm_attempt",
        actorKind: "user",
        actorId: userId,
        targetType: "user",
        targetId: userId,
        payload: { outcome: "completed" },
      }),
    );

    // 7f. Audit the completion as a discrete event (mirrors the
    //     attempt / requested split on the forgot side).
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "auth.password_reset_completed",
        actorKind: "user",
        actorId: userId,
        targetType: "user",
        targetId: userId,
        payload: { role },
      }),
    );
  } catch (err) {
    log.error("[runResetPassword] sequential write failed", err);
    return { ok: false, state: { ok: false, formError: UNEXPECTED_HE } };
  }

  track({ event: "password_reset_completed", userId, role });

  return { ok: true, redirectTo: "/signin?reset=1" };
}
