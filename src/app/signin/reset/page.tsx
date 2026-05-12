import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { passwordResetTokens } from "@/lib/db/schema";
import { evaluateResetTokenValidity } from "@/lib/auth/password-reset";
import { ResetPasswordForm } from "../ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "בחירת סיסמה חדשה · TeachMe",
  description: "הגדרת סיסמה חדשה לחשבון ב-TeachMe.",
};

interface PageProps {
  searchParams?: Promise<{ token?: string | string[] }>;
}

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

async function lookupTokenRow(token: string) {
  // Pre-validate the token server-side so we can redirect to the error screen
  // BEFORE asking the user to type a new password into a form that's about
  // to reject it. Submit-time validation in reset-flow.ts is still authoritative.
  try {
    const db = getDb();
    const rows = await db
      .select({
        identifier: passwordResetTokens.identifier,
        expires: passwordResetTokens.expires,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return rows[0] ?? null;
  } catch (err) {
    console.error("[signin/reset/page] token lookup failed", err);
    return null;
  }
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = firstString(params?.token);

  if (!token) {
    redirect("/signin/reset/error?reason=not_found");
  }

  const tokenRow = await lookupTokenRow(token);
  const validity = evaluateResetTokenValidity(tokenRow);
  if (!validity.valid) {
    redirect(`/signin/reset/error?reason=${encodeURIComponent(validity.reason)}`);
  }

  return (
    <AppShell
      activeHref="/signin"
      mainClassName="flex flex-1 items-center justify-center bg-linen px-6 py-16"
    >
      <Card padding="lg" shadow="sm" className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">בחירת סיסמה חדשה</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-6 text-sm leading-7 text-on-surface-variant">
            הזינו סיסמה חדשה לחשבון. הסיסמה הקודמת תפסיק לפעול מיד, וכל ההתחברויות
            הפעילות יסתיימו.
          </p>
          <ResetPasswordForm token={token} />
        </CardBody>
      </Card>
    </AppShell>
  );
}
