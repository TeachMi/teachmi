import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { SignupPanel } from "./SignupPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "הרשמה · TeachMe",
  description: "פתיחת חשבון ב-TeachMe — חיפוש מורים מומחים או הצטרפות כמורה.",
};

interface SignupPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// Full-page `/signup`. This renders on a direct visit or hard refresh; an
// in-app navigation to `/signup` is intercepted by `@modal/(.)signup` and
// shown as an overlay instead. Both render the shared <SignupPanel>.
export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = (await searchParams) ?? {};

  return (
    <AppShell activeHref="/signin" mainClassName="flex-1 bg-linen">
      <SignupPanel params={params} />
    </AppShell>
  );
}
