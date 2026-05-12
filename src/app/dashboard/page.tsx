import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { signOut } from "@/lib/auth/auth";
import { requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import {
  requirePrivacyConsent,
  type DbForPrivacyConsent,
} from "@/lib/legal/privacy-consent";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";

  await signOut({ redirectTo: "/signin" });
}

export default async function DashboardPage() {
  const user = await requireAuth("/dashboard");
  // Story 1.21 (FR59): re-prompt users who lack a receipt at the current
  // privacy-policy version. `redirect` throws and never returns when invoked.
  await requirePrivacyConsent({
    userId: user.id,
    currentPath: "/dashboard",
    db: getDb() as unknown as DbForPrivacyConsent,
    redirectFn: redirect,
  });
  const displayName = user.name ?? user.email ?? "TeachMe";

  return (
    <AppShell
      activeHref="/dashboard"
      headerAction={
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="md">
            יציאה
          </Button>
        </form>
      }
      mainClassName="flex flex-1 px-6 py-16"
    >
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="space-y-3 text-start">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            לוח הבקרה
          </h1>
          <p className="text-base leading-7 text-on-surface-variant">{displayName}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card padding="sm">
            <p className="text-sm text-on-surface-variant">השיעור הבא</p>
            <CardBody className="mt-2 font-display text-xl font-bold text-primary-container">
              מוכן לסיפורי הדשבורד
            </CardBody>
          </Card>
          <Card padding="sm">
            <p className="text-sm text-on-surface-variant">מעטפת</p>
            <CardBody className="mt-2 font-display text-xl font-bold text-primary-container">
              RTL מלא
            </CardBody>
          </Card>
          <Card padding="sm">
            <p className="text-sm text-on-surface-variant">חשבון</p>
            <CardBody className="mt-2 font-display text-xl font-bold text-primary-container">
              מחובר
            </CardBody>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
