import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resendVerificationAction } from "../resend-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "שגיאה באימות · TeachMe",
  description: "קישור האימות אינו תקין. שלחו לעצמכם קישור חדש.",
};

type ErrorReason = "expired" | "not_found" | "missing" | "internal";

const REASON_COPY: Record<ErrorReason, { title: string; body: string }> = {
  expired: {
    title: "הקישור פג תוקף",
    body: "קישור האימות בתוקף ל-15 דקות בלבד. שלחו לעצמכם קישור חדש.",
  },
  not_found: {
    title: "הקישור אינו תקין",
    body: "הקישור שלחצתם עליו אינו תקין או נוצל כבר. אם זו הפעם הראשונה שאתם רואים את הדף הזה, נסו לשלוח קישור חדש.",
  },
  missing: {
    title: "הקישור אינו תקין",
    body: "הקישור שלחצתם עליו חסר את אסימון האימות. נסו לשלוח קישור חדש.",
  },
  internal: {
    title: "שגיאה במערכת",
    body: "משהו השתבש. נסו שוב בעוד דקה.",
  },
};

function isErrorReason(value: unknown): value is ErrorReason {
  return value === "expired" || value === "not_found" || value === "missing" || value === "internal";
}

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

interface PageProps {
  searchParams?: Promise<{ reason?: string | string[]; email?: string | string[] }>;
}

export default async function VerifyErrorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawReason = firstString(params?.reason);
  const reason: ErrorReason = isErrorReason(rawReason) ? rawReason : "internal";
  const email = firstString(params?.email);
  const copy = REASON_COPY[reason];

  return (
    <AppShell mainClassName="flex flex-1 items-center justify-center bg-linen px-6 py-16">
      <Card padding="lg" shadow="sm" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{copy.title}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-6 text-sm leading-7 text-on-surface-variant">{copy.body}</p>

          <form action={resendVerificationAction} className="space-y-4">
            <Input
              name="email"
              type="email"
              label="כתובת האימייל לשליחה חוזרת"
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              required
              dir="ltr"
              defaultValue={email ?? ""}
              size="lg"
              surface="linen"
            />
            <Button type="submit" variant="outline" size="lg" fullWidth>
              שלחו קישור חדש
            </Button>
          </form>
        </CardBody>
      </Card>
    </AppShell>
  );
}
