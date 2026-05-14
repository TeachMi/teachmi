"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { createDataExportToken, buildDataExportUrl } from "@/lib/data-export/data-export";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import { getEmailProvider } from "@/lib/providers/email";
import { readTrustedOrigin } from "@/app/signup/_lib/origin";

export async function requestDataExportAction() {
  const user = await requireAuth("/account/data");
  const hdrs = await headers();
  const origin = readTrustedOrigin(hdrs);
  const { token, expiresAt } = await createDataExportToken({ userId: user.id });
  const downloadUrl = buildDataExportUrl(token, origin);
  const template = EMAIL_TEMPLATES.DATA_EXPORT_READY;

  await getEmailProvider().sendTransactional({
    toAddress: user.email ?? "",
    subject: template.subject,
    templateId: template.templateId,
    payload: {
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInHours: 24,
      displayName: user.name ?? "TeachMe",
    },
  });

  redirect("/account/data?requested=1");
}
