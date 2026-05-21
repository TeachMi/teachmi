// One-shot cookie that carries "this Google signup should create a tutor"
// across the OAuth round-trip. Set by `signInWithGoogle` (signup actions)
// before redirecting to Google; read + cleared by the `events.createUser`
// hook in `auth.ts`. The email/password path doesn't need this — `runRegister`
// receives `role` directly on the form.
export const PENDING_SIGNUP_ROLE_COOKIE = "tm_pending_signup_role";

// Short-lived — only needs to survive a single OAuth redirect round-trip.
export const PENDING_SIGNUP_ROLE_MAX_AGE_SEC = 600;
