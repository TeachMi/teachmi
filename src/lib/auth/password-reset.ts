// Pure helpers for the password-reset token lifecycle. Structural twin of
// `./email-verification.ts` (Story 1.13) — same token shape, same TTL semantics
// — but lives in its own module to track the separate `password_reset_tokens`
// table (Story 1.15 schema decision; see story Dev Notes for rationale).

import { randomBytes } from "node:crypto";

export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 15;
const PASSWORD_RESET_TOKEN_TTL_MS = PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000;

export interface GeneratedPasswordResetToken {
  token: string;
  expires: Date;
}

export function generatePasswordResetToken(now: Date = new Date()): GeneratedPasswordResetToken {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
  return { token, expires };
}

export type ResetTokenValidity =
  | { valid: true; identifier: string }
  | { valid: false; reason: "not_found" | "expired" };

export interface ResetTokenRow {
  identifier: string;
  expires: Date;
}

export function evaluateResetTokenValidity(
  row: ResetTokenRow | null | undefined,
  now: Date = new Date(),
): ResetTokenValidity {
  if (!row) {
    return { valid: false, reason: "not_found" };
  }
  if (row.expires.getTime() <= now.getTime()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, identifier: row.identifier };
}

export function buildPasswordResetUrl(token: string, origin: string): string {
  const trimmed = origin.replace(/\/+$/, "");
  return `${trimmed}/signin/reset?token=${encodeURIComponent(token)}`;
}
