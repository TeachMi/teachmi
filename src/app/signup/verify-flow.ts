// Pure orchestrator for the email-verification Route Handler. Tested via the
// FakeDb pattern in verify-flow.test.ts. `verify/route.ts` is the thin Next.js
// wrapper that constructs the real dependencies and emits the NextResponse +
// cookie based on this result.

import { eq, sql } from "drizzle-orm";
import { auditEvents, sessions, users, verificationTokens } from "../../lib/db/schema";
import { toAuditEventValues } from "../../lib/db/audit";
import { evaluateTokenValidity } from "../../lib/auth/email-verification";
import { isValidEmailShape } from "../../lib/auth/email-validation";
import { isAppRole, type AppRole } from "../../lib/auth/roles";
import type { AnalyticsEvent } from "../../lib/analytics";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type VerifyFlowResult =
  | {
      kind: "ok";
      sessionToken: string;
      expires: Date;
      userId: string;
      role: AppRole;
    }
  | { kind: "verified_no_session"; userId: string; role: AppRole }
  | { kind: "error"; reason: "missing" | "not_found" | "expired" | "internal" };

interface UpdateSetChain<TRow> {
  where(condition: unknown): { returning(columns: unknown): Promise<TRow[]> };
}
interface UpdateChain {
  set(values: unknown): UpdateSetChain<{ id: string; role: string }>;
}
interface DeleteWithReturning<TRow> extends Promise<unknown> {
  returning(columns: unknown): Promise<TRow[]>;
}
interface DeleteChain {
  where(condition: unknown): DeleteWithReturning<{ identifier: string; expires: Date }>;
}
interface InsertChain {
  values(value: unknown): Promise<unknown>;
}
interface SelectChain<TRow> {
  from(table: unknown): { where(condition: unknown): Promise<TRow[]> };
}

interface VerificationCodeTokenRow {
  identifier: string;
  token: string;
  expires: Date;
}

export interface DbForVerify {
  delete(table: unknown): DeleteChain;
  update(table: unknown): UpdateChain;
  insert(table: unknown): InsertChain;
}

export interface DbForVerifyCode extends DbForVerify {
  select<TRow = VerificationCodeTokenRow>(cols: unknown): SelectChain<TRow>;
}

export interface VerifyDeps {
  db: DbForVerify;
  generateSessionToken: () => string;
  now?: () => Date;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

export interface VerifyCodeInput {
  email: string;
  code: string;
}

export async function runVerify(
  rawToken: string | null,
  deps: VerifyDeps,
): Promise<VerifyFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };

  if (!rawToken) {
    return { kind: "error", reason: "missing" };
  }
  const token = rawToken.trim();
  // base64url alphabet only — generator emits exactly this set, so anything
  // else can only be mail-client mangling or someone fuzzing. Reject before
  // the SQL lookup so the error surface is deterministic (`not_found` for an
  // unknown-but-well-formed token; `missing` for malformed).
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token) || token.length > 256) {
    return { kind: "error", reason: "missing" };
  }

  const now = deps.now?.() ?? new Date();

  let verifiedUserId: string | null = null;
  let verifiedRole: AppRole | null = null;

  try {
    // Atomic consume: a single DELETE ... RETURNING. Concurrent clicks (or
    // an email-prefetcher + a real click) only one of them gets the row;
    // the loser sees an empty array and lands on `not_found`.
    const consumed = await deps.db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, token))
      .returning({
        identifier: verificationTokens.identifier,
        expires: verificationTokens.expires,
      });

    const row = consumed[0] ?? null;
    const validity = evaluateTokenValidity(row, now);
    if (!validity.valid) {
      return { kind: "error", reason: validity.reason };
    }

    const updated = await deps.db
      .update(users)
      .set({
        emailVerified: sql`now()`,
        updatedAt: sql`now()`,
        updatedByKind: "system",
        updatedByActor: "email-verification",
      })
      .where(eq(users.email, validity.identifier))
      .returning({ id: users.id, role: users.role });

    const userRow = updated[0];
    if (!userRow) {
      throw new Error(
        `verify-email: token matched identifier ${validity.identifier} but user row not found`,
      );
    }

    const role: AppRole = isAppRole(userRow.role) ? userRow.role : "student";
    verifiedUserId = userRow.id;
    verifiedRole = role;

    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "auth.email_verified",
        actorKind: "user",
        actorId: userRow.id,
        targetType: "user",
        targetId: userRow.id,
        payload: {},
      }),
    );
  } catch (err) {
    log.error("[runVerify] verify-step write failed", err);
    return { kind: "error", reason: "internal" };
  }

  // Session creation is a separate failure surface. If it fails AFTER the
  // user is verified + audit row written, return `verified_no_session` so the
  // caller can redirect to `/signin?verified=1` rather than show a generic
  // error (the user IS verified — they just need to sign in manually).
  try {
    const sessionToken = deps.generateSessionToken();
    const expires = new Date(now.getTime() + SESSION_TTL_MS);

    await deps.db.insert(sessions).values({
      sessionToken,
      userId: verifiedUserId,
      expires,
    });

    deps.track({
      event: "email_verified",
      userId: verifiedUserId,
      role: verifiedRole,
    });

    return {
      kind: "ok",
      sessionToken,
      expires,
      userId: verifiedUserId,
      role: verifiedRole,
    };
  } catch (err) {
    log.error("[runVerify] session-create failed; user is verified but no session", err);
    deps.track({
      event: "email_verified",
      userId: verifiedUserId,
      role: verifiedRole,
    });
    return { kind: "verified_no_session", userId: verifiedUserId, role: verifiedRole };
  }
}

export async function runVerifyCode(
  input: VerifyCodeInput,
  deps: Omit<VerifyDeps, "db"> & { db: DbForVerifyCode },
): Promise<VerifyFlowResult> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };
  const emailRaw = input.email.trim();
  const email = emailRaw.toLowerCase();
  const code = input.code.trim();

  if (!isValidEmailShape(emailRaw) || !/^[0-9]{6}$/.test(code)) {
    return { kind: "error", reason: "missing" };
  }

  let rows: VerificationCodeTokenRow[];
  try {
    rows = await deps.db
      .select({
        identifier: verificationTokens.identifier,
        token: verificationTokens.token,
        expires: verificationTokens.expires,
      })
      .from(verificationTokens)
      .where(eq(verificationTokens.identifier, email));
  } catch (err) {
    log.error("[runVerifyCode] token lookup failed", err);
    return { kind: "error", reason: "internal" };
  }

  const matched = rows.find(
    (row) => row.token === code || row.token.startsWith(`${code}_`),
  );
  if (!matched) {
    return { kind: "error", reason: "not_found" };
  }

  return runVerify(matched.token, deps);
}
