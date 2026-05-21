"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { getEmailProvider } from "@/lib/providers/email";
import { track } from "@/lib/analytics";
import { isEmailVerificationSkipEnabled } from "@/lib/auth/dev-flags";
import { getSafeCallbackUrl } from "@/lib/auth/callback-url";
import { signIn } from "@/lib/auth/auth";
import {
  PENDING_SIGNUP_ROLE_COOKIE,
  PENDING_SIGNUP_ROLE_MAX_AGE_SEC,
} from "@/lib/auth/pending-signup-role";
import { runRegister } from "./registration-flow";
import { readIp, readTrustedOrigin } from "./_lib/origin";
import type { RegisterActionState } from "./register-state";

// Auth.js database-strategy session cookie name — must match the name
// next-auth reads. `src/app/signup/verify/route.ts` sets the same cookie
// after a magic-link verification.
function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const origin = readTrustedOrigin(hdrs);
  const userAgent = hdrs.get("user-agent");

  // Story 3.3 — booking-funnel intent target. The /signup page passes the
  // composed `next` (a /booking-stub URL) as a hidden form field. Sanitize via
  // `getSafeCallbackUrl(raw, "")` so:
  //   - Empty / missing / unsafe input → empty-string fallback → null `next`.
  //   - Valid relative path passes through unchanged.
  // Unsafe `next` (open-redirect attempt) silently degrades to "no intent" —
  // upstream sig validation on /signup already caught the real abuse case;
  // this is defense-in-depth.
  const rawNext = String(formData.get("next") ?? "").trim();
  const next: string | null =
    rawNext.length > 0 ? getSafeCallbackUrl(rawNext, "") || null : null;

  const result = await runRegister(formData, {
    db: getDb() as unknown as Parameters<typeof runRegister>[1]["db"],
    emailProvider: getEmailProvider(),
    ip,
    next,
    origin,
    userAgent,
    track,
    generateSessionToken: () => randomUUID(),
    // Dev-only: production-guarded inside isEmailVerificationSkipEnabled().
    skipEmailVerification: isEmailVerificationSkipEnabled(),
  });

  if (result.ok) {
    // The skip-verification path returns a freshly-minted session — set it as
    // the Auth.js session cookie so the user lands signed in (no /signin hop).
    if (result.session) {
      const cookieStore = await cookies();
      cookieStore.set({
        name: getSessionCookieName(),
        value: result.session.token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: result.session.expires,
      });
    }
    // Hand the destination to the client to HARD-navigate to (see
    // RegisterActionState.redirectTo) — a server-action redirect() out of the
    // signup modal crashes the multi-hop /dashboard redirect chain.
    return { ok: true, redirectTo: result.redirectTo };
  }

  return result.state;
}

/**
 * Google OAuth signup. A Google-created account lands as `student` by default
 * (the `users.role` column default). When the signup came from the
 * become-a-tutor flow, we leave a one-shot cookie that the `events.createUser`
 * hook in `auth.ts` reads to promote the freshly-created account to `tutor`.
 * Existing accounts signing in are unaffected — no `createUser` event fires.
 */
export async function signInWithGoogle(formData: FormData) {
  const redirectTo = getSafeCallbackUrl(formData.get("callbackUrl"));
  const cookieStore = await cookies();
  if (formData.get("role") === "tutor") {
    cookieStore.set({
      name: PENDING_SIGNUP_ROLE_COOKIE,
      value: "tutor",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PENDING_SIGNUP_ROLE_MAX_AGE_SEC,
    });
  } else {
    // Student signup — clear any stale tutor intent from an abandoned flow.
    cookieStore.delete(PENDING_SIGNUP_ROLE_COOKIE);
  }
  await signIn("google", { redirectTo });
}
