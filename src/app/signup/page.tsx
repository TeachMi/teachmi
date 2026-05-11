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

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <AppShell activeHref="/signin" mainClassName="flex-1 bg-linen">
      <SignupForm />
    </AppShell>
  );
}
