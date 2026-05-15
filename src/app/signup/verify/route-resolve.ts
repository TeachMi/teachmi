// Pure helper for the /signup/verify route handler — exists so the redirect
// resolution can be unit-tested without booting Next types or mocking the
// runVerify orchestrator. The route handler (route.ts) is a thin wrapper that
// converts these results into actual NextResponse + cookie writes.
//
// Story 3.3 (FR19): the `next` query param threads the booking-funnel intent
// through the verify hop. On `ok` we land the user on `next`; on
// `verified_no_session` we forward `next` via the /signin callbackUrl so the
// manual signin recovery path still preserves intent; on `error` we drop intent
// (the user has to re-enter the funnel — acceptable for stale / expired tokens).

import { getSafeCallbackUrl } from "@/lib/auth/callback-url";
import { decomposeNextToGateParams } from "@/lib/booking/urls";
import type { VerifyFlowResult } from "../verify-flow";

export interface ResolvedRedirect {
  /** Path to redirect to. */
  path: string;
  /** When non-null, fire signup_intent_book_completed with this tutorUserId. */
  completionTutorUserId: string | null;
  /** True when the cookie must be set before the redirect. */
  setSessionCookie: boolean;
}

/**
 * Decide where /signup/verify should land the user given:
 *   - The runVerify result (ok / verified_no_session / error).
 *   - The raw `next` query param from the magic-link URL.
 *
 * Always sanitizes `next` via `getSafeCallbackUrl` — open-redirect attempts
 * fall back to "/dashboard". When `next` decomposes to a valid gate URL
 * (booking-stub with verified HMAC sig), the caller fires the completion
 * analytics event for funnel attribution.
 */
export function resolveVerifyRedirect(
  result: VerifyFlowResult,
  rawNext: string | null,
): ResolvedRedirect {
  if (result.kind === "error") {
    return {
      path: `/signup/verify-error?reason=${result.reason}`,
      completionTutorUserId: null,
      setSessionCookie: false,
    };
  }

  const safeNext = getSafeCallbackUrl(rawNext, "/dashboard");

  if (result.kind === "verified_no_session") {
    // The user IS verified but session creation failed. Send them to /signin
    // with verified=1. Preserve `next` via callbackUrl so the manual signin
    // can still route to the booking-stub. When safeNext fell back to the
    // default, omit callbackUrl entirely (cleaner /signin URL).
    const path =
      safeNext !== "/dashboard"
        ? `/signin?verified=1&callbackUrl=${encodeURIComponent(safeNext)}`
        : "/signin?verified=1";
    return { path, completionTutorUserId: null, setSessionCookie: false };
  }

  // result.kind === "ok" — session created. Redirect to `next` (or the
  // /dashboard fallback). Fire the completion event if `next` is a valid
  // gate URL.
  const gate = decomposeNextToGateParams(safeNext);
  return {
    path: safeNext,
    completionTutorUserId: gate?.tutorUserId ?? null,
    setSessionCookie: true,
  };
}
