// Pure password-validation rules + constants. Safe to import from client components
// (no native binary deps). Password HASHING lives in `./password-hashing.ts` —
// keep that out of client bundles since `@node-rs/argon2` ships native binaries.

export const PASSWORD_MIN_LENGTH = 10;

export type PasswordRejectionReason = "too_short" | "missing_letter" | "missing_digit";

export type PasswordValidationResult = { ok: true } | { ok: false; reason: PasswordRejectionReason };

export function validatePassword(input: string): PasswordValidationResult {
  if (input.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: "too_short" };
  }

  if (!/[A-Za-z]/.test(input)) {
    return { ok: false, reason: "missing_letter" };
  }

  if (!/[0-9]/.test(input)) {
    return { ok: false, reason: "missing_digit" };
  }

  return { ok: true };
}
