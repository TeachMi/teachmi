import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { getSafeCallbackUrl } from "./callback-url";

export type SessionReader = () => Promise<Session | null>;

export class AdminForbiddenError extends Error {
  readonly status = 403;

  constructor() {
    super("Admin access is required.");
    this.name = "AdminForbiddenError";
  }
}

interface GuardOptions {
  onUnauthenticated?: (callbackUrl?: string) => never;
  onForbidden?: () => never;
}

function redirectToSignIn(callbackUrl?: string): never {
  if (!callbackUrl) {
    redirect("/signin");
  }

  redirect(`/signin?callbackUrl=${encodeURIComponent(getSafeCallbackUrl(callbackUrl))}`);
}

function throwForbidden(): never {
  throw new AdminForbiddenError();
}

export function createAuthGuards(readSession: SessionReader, options: GuardOptions = {}) {
  const onUnauthenticated = options.onUnauthenticated ?? redirectToSignIn;
  const onForbidden = options.onForbidden ?? throwForbidden;

  async function requireAuth(callbackUrl?: string) {
    const session = await readSession();

    const user = session?.user;

    if (!user?.id) {
      return onUnauthenticated(callbackUrl);
    }

    return user;
  }

  async function requireAdmin(callbackUrl?: string) {
    const user = await requireAuth(callbackUrl);

    if (user.role !== "admin") {
      return onForbidden();
    }

    return user;
  }

  return {
    requireAuth,
    requireAdmin,
  };
}

async function readAuthSession() {
  const { auth } = await import("./auth");
  return auth();
}

const guards = createAuthGuards(readAuthSession);

export const requireAuth = guards.requireAuth;
export const requireAdmin = guards.requireAdmin;
