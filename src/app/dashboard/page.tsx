import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { StudentSubNav } from "@/components/layout/StudentSubNav";
import { AddAllUpcomingButton } from "@/components/booking/AddAllUpcomingButton";
import { requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { getUpcomingBookingsForStudent } from "@/lib/db/queries/booking-queries";
import {
  requirePrivacyConsent,
  type DbForPrivacyConsent,
} from "@/lib/legal/privacy-consent";
import { EmptyStateHero } from "./_components/EmptyStateHero";
import { Greeting } from "./_components/Greeting";
import { QuickLinks } from "./_components/QuickLinks";
import { RatePreviousLessonSlot } from "./_components/RatePreviousLessonSlot";
import { UpcomingLessonsSlot } from "./_components/UpcomingLessonsSlot";
import { WeeklySummary } from "./_components/WeeklySummary";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireAuth("/dashboard");
  // Story 1.21 (FR59): re-prompt users who lack a receipt at the current
  // privacy-policy version. `redirect` throws and never returns when invoked.
  await requirePrivacyConsent({
    userId: user.id,
    currentPath: "/dashboard",
    db: getDb() as unknown as DbForPrivacyConsent,
    redirectFn: redirect,
  });

  // Role-based redirects (single-role enum at MVP1; dual-role FR5 is Phase 2+):
  //   admin → /admin (their existing landing)
  //   tutor → /tutor/me (Story 2.10's self-service surface — the Profile tab
  //           page handles "no tutor_profiles row" by redirecting onward to
  //           /tutor/onboarding/profile, so this single redirect covers every
  //           tutor state including missing/pending/approved)
  //   student → falls through to the full student dashboard below
  if (user.role === "admin") {
    redirect("/admin");
  }

  if (user.role === "tutor") {
    redirect("/tutor/me");
  }

  const now = new Date();
  const displayName = user.name ?? (user.email ? user.email.split("@")[0] ?? null : null);
  const upcoming = await getUpcomingBookingsForStudent(user.id, { now });
  const hasUpcomingLessons = upcoming.length > 0;

  // Serialize the upcoming bookings for the "add all to calendar" button.
  // Student view: counterpart is the tutor.
  const upcomingForCalendar = upcoming.map((b) => ({
    id: b.id,
    startIso: b.startsAt.toISOString(),
    endIso: new Date(
      b.startsAt.getTime() + b.durationMinutes * 60 * 1000,
    ).toISOString(),
    counterpartName: b.tutorDisplayName ?? "המורה",
    subjectNameHe: b.subjectNameHe,
    durationMinutes: b.durationMinutes,
  }));

  return (
    <AppShell activeHref="/dashboard" mainClassName="flex flex-1 flex-col">
      <StudentSubNav activeTab="schedule" />

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8">
        <Greeting
          now={now}
          displayName={displayName}
          hasUpcomingLessons={hasUpcomingLessons}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {hasUpcomingLessons ? <UpcomingLessonsSlot upcoming={upcoming} /> : <EmptyStateHero />}
            {hasUpcomingLessons && (
              <div className="flex justify-start">
                <AddAllUpcomingButton bookings={upcomingForCalendar} />
              </div>
            )}
          </div>
          <aside className="space-y-6">
            <WeeklySummary />
            <RatePreviousLessonSlot />
            <QuickLinks />
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

