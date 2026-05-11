import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { auth } from "@/lib/auth/auth";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "הרשמה · TeachMe",
  description: "פתיחת חשבון ב-TeachMe — חיפוש מורים מומחים או הצטרפות כמורה.",
};

async function tryReadSession() {
  // `auth()` lazily initializes the DrizzleAdapter, which calls `getDb()` —
  // that throws when DATABASE_URL is unset (e.g., CI E2E runner). The
  // already-signed-in redirect is a UX convenience, not a security boundary,
  // so degrade to "no session" rather than crashing the whole page.
  try {
    return await auth();
  } catch {
    return null;
  }
}

export default async function SignupPage() {
  const session = await tryReadSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <AppShell activeHref="/signin" mainClassName="flex-1 bg-linen">
      <SignupForm />
    </AppShell>
  );
}
