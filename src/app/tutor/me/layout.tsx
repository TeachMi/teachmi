import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireTutor } from "../onboarding/_lib/require-tutor";
import { TutorTabNav } from "./_components/TutorTabNav";

// Story 2.10. The /tutor/me 3-tab shell (Profile / Schedule / Invoices).
//
// Auth + role gate runs ONCE at the layout level — every child page
// (Profile, Schedule stub, Invoices stub) inherits the guard. `requireTutor`
// (Story 2.1's helper) returns the user on success or redirects:
//   - anonymous → /signin?callbackUrl=/tutor/me
//   - non-tutor (student, admin) → /dashboard
//
// The page header + "View public profile" link live here rather than per-tab
// so the structure stays consistent across the 3 tabs.
//
// RTL: the header uses plain `flex justify-between` and `text-start`. NOT
// `flex-row-reverse` / `text-end` / `justify-end` — those align to END which
// equals LEFT in Hebrew RTL. The first child sits on the right naturally.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "אזור המורה · TeachMe",
  description: "ניהול הפרופיל, הזמינות והחשבוניות שלך.",
  robots: { index: false, follow: false },
};

export default async function TutorMeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireTutor("/tutor/me");

  return (
    <AppShell mainClassName="flex-1 bg-surface">
      <div className="mx-auto w-full max-w-7xl px-6 pt-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="text-start">
            <h1 className="mb-1 font-display text-2xl font-extrabold text-primary-container">
              אזור המורה
            </h1>
            <p className="text-sm text-secondary">
              נהל את הפרופיל, הזמינות והחשבוניות שלך מכאן.
            </p>
          </div>
          <Link
            href={`/tutor/${user.id}`}
            className="shrink-0 rounded border border-primary-fixed-dim px-3 py-1.5 text-xs font-bold text-primary-container hover:bg-primary-fixed/30"
          >
            צפו בפרופיל הציבורי ←
          </Link>
        </div>
      </div>
      <TutorTabNav />
      <div className="mx-auto w-full max-w-7xl px-6 py-6">{children}</div>
    </AppShell>
  );
}
