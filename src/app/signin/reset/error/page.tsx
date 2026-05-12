import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "קישור איפוס לא תקף · TeachMe",
  description: "קישור איפוס הסיסמה אינו תקף.",
};

interface PageProps {
  searchParams?: Promise<{ reason?: string | string[] }>;
}

type Reason = "expired" | "not_found" | "user_gone";

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function isReason(value: string | null): value is Reason {
  return value === "expired" || value === "not_found" || value === "user_gone";
}

function copyFor(reason: Reason): { title: string; body: string } {
  if (reason === "expired") {
    return {
      title: "הקישור פג תוקף",
      body: "הקישור לאיפוס הסיסמה תקף ל-15 דקות בלבד. בקשו קישור חדש כדי להמשיך.",
    };
  }
  if (reason === "user_gone") {
    return {
      title: "החשבון לא נמצא",
      body: "לא הצלחנו למצוא את החשבון שאליו הקישור התייחס.",
    };
  }
  // not_found (the default)
  return {
    title: "הקישור לא תקף",
    body: "הקישור לא נמצא או שכבר נעשה בו שימוש. בקשו קישור חדש כדי להמשיך.",
  };
}

export default async function ResetErrorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = firstString(params?.reason);
  const reason: Reason = isReason(raw) ? raw : "not_found";
  const { title, body } = copyFor(reason);

  return (
    <AppShell mainClassName="flex flex-1 items-center justify-center bg-linen px-6 py-16">
      <Card padding="lg" shadow="sm" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-6 text-sm leading-7 text-on-surface-variant">{body}</p>
          <Link href="/signin/forgot" className="block">
            <Button type="button" size="lg" fullWidth>
              בקשו קישור חדש
            </Button>
          </Link>
        </CardBody>
      </Card>
    </AppShell>
  );
}
