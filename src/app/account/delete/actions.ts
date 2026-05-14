"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import {
  softDeleteAccount,
  validateDeleteConfirmation,
} from "@/lib/account-deletion/account-deletion";
import { getEmailProvider } from "@/lib/providers/email";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import { readTrustedOrigin } from "@/app/signup/_lib/origin";

export interface DeleteAccountState {
  ok: boolean;
  error?: string;
}

export async function deleteAccountAction(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireAuth("/account/delete");
  const confirmation = String(formData.get("confirmation") ?? "");
  const validated = validateDeleteConfirmation({ confirmation, email: user.email });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const hdrs = await headers();
  const result = await softDeleteAccount({
    userId: user.id,
    origin: readTrustedOrigin(hdrs),
  });

  const template = EMAIL_TEMPLATES.ACCOUNT_RESTORE;
  await getEmailProvider().sendTransactional({
    toAddress: validated.email,
    subject: template.subject,
    templateId: template.templateId,
    payload: {
      restoreUrl: result.restoreUrl,
      expiresAt: result.expiresAt.toISOString(),
      expiresInDays: 30,
      displayName: user.name ?? "TeachMe",
    },
  });

  redirect("/signin?deleted=1");
}
