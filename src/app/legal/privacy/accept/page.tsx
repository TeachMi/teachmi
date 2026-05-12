import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyPolicyBody } from "@/components/legal/PrivacyPolicyBody";
import { requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { getSafeCallbackUrl } from "@/lib/auth/callback-url";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  fetchMostRecentPrivacyConsentReceipt,
  type DbForPrivacyConsent,
} from "@/lib/legal/privacy-consent";
import { AcceptPrivacyForm } from "./AcceptPrivacyForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "אישור מדיניות פרטיות · TeachMe",
  description:
    "אנא קראו ואשרו את הגרסה העדכנית של מדיניות הפרטיות כדי להמשיך לשימוש בפלטפורמה.",
};

interface AcceptPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function PrivacyAcceptPage({
  searchParams,
}: AcceptPageProps) {
  // requireAuth handles the unauthenticated case (redirect to /signin with
  // callbackUrl). We intentionally do NOT call requirePrivacyConsent here —
  // that would loop. The accept page is the loop's exit.
  const user = await requireAuth("/legal/privacy/accept");

  const params = await searchParams;
  const safeNext = getSafeCallbackUrl(params.next);

  // Idempotency / defensive: if the user already has a receipt at the current
  // version, route them onward without re-rendering the accept UI. Handles:
  //  - user has a stale link to /legal/privacy/accept after already accepting,
  //  - two tabs racing on the same accept submission.
  const mostRecent = await fetchMostRecentPrivacyConsentReceipt(
    getDb() as unknown as DbForPrivacyConsent,
    user.id,
  );
  if (mostRecent?.documentVersion === CURRENT_PRIVACY_POLICY_VERSION) {
    redirect(safeNext);
  }

  return (
    <AppShell activeHref={undefined} mainClassName="flex flex-1 bg-linen">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <div className="space-y-2 text-start">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            אישור מדיניות פרטיות מעודכנת
          </h1>
          <p className="text-base leading-7 text-on-surface-variant">
            עדכנו את מדיניות הפרטיות. אנא קראו ואשרו לפני המשך השימוש.
          </p>
        </div>

        <Card padding="lg" shadow="sm">
          <CardHeader>
            <CardTitle className="text-xl">מדיניות פרטיות</CardTitle>
          </CardHeader>
          <CardBody className="space-y-6">
            <div className="max-h-96 overflow-y-auto rounded-lg border border-linen-border bg-surface p-4">
              <PrivacyPolicyBody />
            </div>

            <AcceptPrivacyForm next={safeNext} />
          </CardBody>
        </Card>
      </section>
    </AppShell>
  );
}
