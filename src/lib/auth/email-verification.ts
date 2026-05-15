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

export function buildVerificationUrl(
  token: string,
  origin: string,
  opts?: { next?: string | null },
): string {
  const trimmed = origin.replace(/\/+$/, "");
  const params = new URLSearchParams({ token });
  // Story 3.3: thread the post-verify redirect target through the magic-link
  // URL so the booking-funnel intent survives the email hop. `next` rides on
  // the URL — no DB persistence — and is hard-sanitized by `getSafeCallbackUrl`
  // on the receiving side at /signup/verify/route.ts before any redirect.
  if (opts?.next) {
    params.set("next", opts.next);
  }
  return `${trimmed}/signup/verify?${params.toString()}`;
}
