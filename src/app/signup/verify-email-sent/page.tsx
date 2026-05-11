import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { resendVerificationAction } from "../resend-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "שלחנו לכם מייל אימות · TeachMe",
  description: "הוראות לאימות כתובת האימייל לפני כניסה ראשונה ל-TeachMe.",
};

interface PageProps {
  searchParams?: Promise<{ email?: string | string[] }>;
}

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function VerifyEmailSentPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const email = firstString(params?.email);

  return (
    <AppShell mainClassName="flex flex-1 items-center justify-center bg-linen px-6 py-16">
      <Card padding="lg" shadow="sm" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">שלחנו לכם מייל אימות</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm leading-7 text-on-surface-variant">
            לחצו על הקישור בהודעת האימייל ששלחנו אליכם. הקישור בתוקף ל-15 דקות.
          </p>
          {email && (
            <p className="mb-6 rounded-lg border border-linen-border bg-linen px-4 py-2 text-sm text-on-surface">
              <span className="text-on-surface-variant">נשלח אל: </span>
              <span dir="ltr" className="font-bold">
                {email}
              </span>
            </p>
          )}
          {email && (
            <form action={resendVerificationAction} className="space-y-3">
              <input type="hidden" name="email" value={email} />
              <Button type="submit" variant="outline" size="lg" fullWidth>
                שלחו שוב
              </Button>
              <p className="text-center text-xs text-on-surface-variant">
                לא קיבלתם? בדקו את תיקיית הספאם או שלחו שוב.
              </p>
            </form>
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}
