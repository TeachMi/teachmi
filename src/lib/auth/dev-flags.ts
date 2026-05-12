// Dev-only configuration flags. NEVER ACTIVE IN PRODUCTION.
//
// Each helper here HARD-REFUSES to return `true` when `NODE_ENV === "production"`.
// The pattern mirrors the e2e signin-fixture refusal from Story 1.14:
// dev-only conveniences must be impossible to flip on accidentally in prod.

/**
 * When `DEV_SKIP_EMAIL_VERIFICATION=1` AND `NODE_ENV !== "production"`,
 * the signup Server Action creates the new user with `emailVerified` set to
 * `now()` and skips the entire email-verification loop (no token issued, no
 * email sent, no `/signup/verify-email-sent` screen). The user is redirected
 * straight to `/signin?verified=1` so they can sign in with the password they
 * just chose.
 *
 * **When to use:** local dev + founder dogfood tests where waiting on a
 * stub-email-outbox roundtrip is friction. **Never** ship to prod — the
 * production guard below makes that impossible regardless of env-var state.
 *
 * **Why an env var, not a feature flag in PostHog:** signup runs server-side
 * before any session exists, so the flag must be readable from the bare
 * Server Action context without any vendor SDK. Env-driven keeps it simple
 * and audit-friendly (visible in Vercel project settings + .env.example).
 */
export function isEmailVerificationSkipEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DEV_SKIP_EMAIL_VERIFICATION === "1";
}
