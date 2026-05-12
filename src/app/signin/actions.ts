"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { track } from "@/lib/analytics";
import { readIp } from "../signup/_lib/origin";
import { runSignin } from "./signin-flow";
import type { SignInActionState } from "./signin-state";

// Match Story 1.13's verify Route Handler cookie-name resolution exactly
// (see node_modules/.pnpm/@auth+core@0.41.2/node_modules/@auth/core/lib/utils/cookie.js
// line 49 for the upstream constant). Keep this name selector identical to
// `src/app/signup/verify/route.ts` so a Credentials signin and a verify-link
// signin produce identical cookies.
function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export async function signInAction(
  _prevState: SignInActionState,
  formData: FormData,
): Promise<SignInActionState> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const callbackUrl = String(formData.get("callbackUrl") ?? "") || null;

  const result = await runSignin(formData, {
    db: getDb() as unknown as Parameters<typeof runSignin>[1]["db"],
    ip,
    callbackUrl,
    track,
  });

  if (result.ok) {
    const cookieStore = await cookies();
    cookieStore.set({
      name: getSessionCookieName(),
      value: result.sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: result.expires,
    });
    redirect(result.redirectTo);
  }

  return result.state;
}
