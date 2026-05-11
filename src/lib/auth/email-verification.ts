import { randomBytes } from "node:crypto";

export const VERIFICATION_TOKEN_TTL_MINUTES = 15;
const VERIFICATION_TOKEN_TTL_MS = VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000;

export interface GeneratedVerificationToken {
  token: string;
  expires: Date;
}

export function generateVerificationToken(now: Date = new Date()): GeneratedVerificationToken {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS);
  return { token, expires };
}

export type TokenValidity =
  | { valid: true; identifier: string }
  | { valid: false; reason: "not_found" | "expired" };

export interface TokenRow {
  identifier: string;
  expires: Date;
}

export function evaluateTokenValidity(
  row: TokenRow | null | undefined,
  now: Date = new Date(),
): TokenValidity {
  if (!row) {
    return { valid: false, reason: "not_found" };
  }
  if (row.expires.getTime() <= now.getTime()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, identifier: row.identifier };
}

export function buildVerificationUrl(token: string, origin: string): string {
  const trimmed = origin.replace(/\/+$/, "");
  return `${trimmed}/signup/verify?token=${encodeURIComponent(token)}`;
}
