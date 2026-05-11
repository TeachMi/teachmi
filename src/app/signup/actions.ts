"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { getEmailProvider } from "@/lib/providers/email";
import { track } from "@/lib/analytics";
import { runRegister } from "./registration-flow";
import { readIp, readTrustedOrigin } from "./_lib/origin";
import type { RegisterActionState } from "./register-state";

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const origin = readTrustedOrigin(hdrs);

  const result = await runRegister(formData, {
    db: getDb() as unknown as Parameters<typeof runRegister>[1]["db"],
    emailProvider: getEmailProvider(),
    ip,
    origin,
    track,
  });

  if (result.ok) {
    redirect(result.redirectTo);
  }

  return result.state;
}
