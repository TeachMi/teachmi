import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth/auth";
import { ForgotPasswordForm } from "../ForgotPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "איפוס סיסמה · TeachMe",
  description: "בקשת קישור לאיפוס סיסמה ב-TeachMe.",
};

async function tryReadSession() {
  // Same defensive pattern as /signin/page.tsx — degrade gracefully if
  // DATABASE_URL is unset (CI / E2E) instead of crashing the page.
  try {
    return await auth();
  } catch (err) {
    console.error("[signin/forgot/page] auth() failed; rendering as signed-out", err);
    return null;
  }
}

export default async function ForgotPasswordPage() {
  const session = await tryReadSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      activeHref="/signin"
      mainClassName="flex flex-1 items-center justify-center bg-linen px-6 py-16"
    >
      <Card padding="lg" shadow="sm" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">איפוס סיסמה</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-6 text-sm leading-7 text-on-surface-variant">
            הזינו את כתובת האימייל של החשבון. אם החשבון קיים, נשלח אליו קישור
            לאיפוס סיסמה. הקישור תקף 15 דקות.
          </p>
          <ForgotPasswordForm />
        </CardBody>
      </Card>
    </AppShell>
  );
}
