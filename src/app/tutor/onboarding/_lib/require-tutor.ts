import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { createAuthGuards, type SessionReader } from "../../../../lib/auth/guards";

/**
 * Tutor-role guard for `/tutor/onboarding/*` routes.
 *
 * Composes the existing `requireAuth` factory from `lib/auth/guards.ts`
 * (read-only — Story 1.15 owns parallel work in `lib/auth/`). Lives in the
 * feature folder deliberately. If/when a cross-cutting `requireTutor` pattern
 * accretes shared logic with `requireAdmin`, promote into `lib/auth/guards.ts`
 * in a future non-parallel-session pass — tracked in `deferred-work.md`.
 *
 * - Unauthenticated → redirects to /signin?callbackUrl=… via `requireAuth`.
 * - Authenticated but role !== "tutor" → redirects to /dashboard.
 * - Authenticated tutor → returns the user object.
 */

interface TutorGuardOptions {
  onUnauthenticated?: (callbackUrl?: string) => never;
  onNonTutor?: () => never;
}

function redirectToDashboard(): never {
  redirect("/dashboard");
}

export function createTutorGuard(
  readSession: SessionReader,
  options: TutorGuardOptions = {},
) {
  const baseGuards = createAuthGuards(readSession, {
    onUnauthenticated: options.onUnauthenticated,
  });
  const onNonTutor = options.onNonTutor ?? redirectToDashboard;

  return async function requireTutor(callbackUrl?: string) {
    const user = await baseGuards.requireAuth(callbackUrl);
    if (user.role !== "tutor") {
      return onNonTutor();
    }
    return user;
  };
}

async function readAuthSession(): Promise<Session | null> {
  const { auth } = await import("../../../../lib/auth/auth");
  return auth();
}

export const requireTutor = createTutorGuard(readAuthSession);
