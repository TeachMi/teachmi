import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSafeCallbackUrl } from "@/lib/auth/callback-url";
import { resendVerificationAction } from "../resend-actions";
import { verifyCodeAction } from "../verify-code-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "שלחנו לכם מייל אימות · TeachMe",
  description: "הוראות לאימות כתובת האימייל לפני כניסה ראשונה ל-TeachMe.",
};

interface PageProps {
  searchParams?: Promise<{
    email?: string | string[];
    // Story 3.3 — booking-funnel intent target. Passed through from
    // registerAction's redirect; threaded into the resend form so a resubmit
    // regenerates the verify URL with `next` intact.
    next?: string | string[];
  }>;
}

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function VerifyEmailSentPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const email = firstString(params?.email);
  // Story 3.3: sanitize via getSafeCallbackUrl with empty-string fallback so
  // missing / unsafe input collapses to "" — the hidden form input stays in
  // the DOM with value="" (treated as null by resend-actions.ts).
  const rawNext = firstString(params?.next);
  const safeNext = rawNext ? getSafeCallbackUrl(rawNext, "") : "";

  return (
    <AppShell mainClassName="flex flex-1 items-center justify-center bg-linen px-6 py-16">
      <Card padding="lg" shadow="sm" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">שלחנו לכם מייל אימות</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm leading-7 text-on-surface-variant">
            הזינו את קוד האימות בן 6 הספרות ששלחנו אליכם. הקוד בתוקף ל-15 דקות.
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
            <form action={verifyCodeAction} className="mb-6 space-y-4">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="next" value={safeNext} />
              <Input
                name="code"
                type="text"
                label="קוד אימות"
                placeholder="123456"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                dir="ltr"
                size="lg"
                surface="linen"
              />
              <Button type="submit" size="lg" fullWidth>
                אמתו את החשבון
              </Button>
            </form>
          )}
          {email && (
            <form action={resendVerificationAction} className="space-y-3">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="next" value={safeNext} />
              <Button type="submit" variant="outline" size="lg" fullWidth>
                שלחו קוד חדש
              </Button>
              <p className="text-center text-xs text-on-surface-variant">
                לא קיבלתם? בדקו את תיקיית הספאם או שלחו קוד חדש.
              </p>
            </form>
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}
