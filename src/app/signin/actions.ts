"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { track } from "@/lib/analytics";
import { signIn } from "@/lib/auth/auth";
import { readIp } from "../signup/_lib/origin";
import { runSignin } from "./signin-flow";
import type { SignInActionState } from "./signin-state";

export async function signInAction(
  _prevState: SignInActionState,
  formData: FormData,
): Promise<SignInActionState> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const callbackUrl = String(formData.get("callbackUrl") ?? "") || null;

  const result = await runSignin(formData, {
    db: getDb() as unknown as Parameters<typeof runSignin>[1]["db"],
    // Re-shape the actual next-auth signIn to the orchestrator's narrow type.
    // The real `signIn` accepts (provider, params, authorizationParams) — we
    // only ever pass the first two with `redirect: false`.
    signIn: ((provider, params) =>
      signIn(provider, params)) as Parameters<typeof runSignin>[1]["signIn"],
    ip,
    callbackUrl,
    track,
  });

  if (result.ok) {
    redirect(result.redirectTo);
  }

  return result.state;
}
