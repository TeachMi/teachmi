import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "בדקו את תיבת הדואר · TeachMe",
  description: "הוראות לאיפוס סיסמה ב-TeachMe.",
};

interface PageProps {
  searchParams?: Promise<{ email?: string | string[] }>;
}

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function ForgotPasswordSentPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const email = firstString(params?.email);

  return (
    <AppShell mainClassName="flex flex-1 items-center justify-center bg-linen px-6 py-16">
      <Card padding="lg" shadow="sm" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">בדקו את תיבת הדואר</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm leading-7 text-on-surface-variant">
            אם הכתובת רשומה במערכת, שלחנו אליה קישור לאיפוס סיסמה. הקישור תקף
            15 דקות.
          </p>
          {email && (
            <p className="mb-6 rounded-lg border border-linen-border bg-linen px-4 py-2 text-sm text-on-surface">
              <span className="text-on-surface-variant">נשלח אל: </span>
              <span dir="ltr" className="font-bold">
                {email}
              </span>
            </p>
          )}
          <p className="text-center text-sm text-on-surface-variant">
            <Link
              className="font-bold text-primary-container hover:underline"
              href="/signin/forgot"
            >
              לא קיבלתי את האימייל
            </Link>
          </p>
        </CardBody>
      </Card>
    </AppShell>
  );
}
