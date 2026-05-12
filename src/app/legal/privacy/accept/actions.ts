"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { track } from "@/lib/analytics";
import { getDb } from "@/lib/db/client";
import { readIp } from "@/app/signup/_lib/origin";
import type { AppRole } from "@/lib/auth/roles";
import { runAcceptPrivacyPolicy, type DbForAcceptFlow } from "./accept-flow";
import type { AcceptActionState } from "./accept-state";

export async function acceptPrivacyPolicyAction(
  _prevState: AcceptActionState,
  formData: FormData,
): Promise<AcceptActionState> {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.id) {
    redirect("/signin");
  }

  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const userAgent = hdrs.get("user-agent");
  const nextRaw = formData.get("next");
  const next = typeof nextRaw === "string" ? nextRaw : "";

  const result = await runAcceptPrivacyPolicy(
    {
      userId: sessionUser.id,
      role: (sessionUser.role as AppRole | undefined) ?? "student",
      ip,
      userAgent,
      next,
    },
    {
      db: getDb() as unknown as DbForAcceptFlow,
      track,
    },
  );

  if (result.ok) {
    redirect(result.redirectTo);
  }

  return { ok: false, formError: result.formError };
}
