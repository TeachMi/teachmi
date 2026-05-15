import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/AppShell";
import { StudentSubNav } from "@/components/layout/StudentSubNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { getUpcomingBookingsForStudent } from "@/lib/db/queries/booking-queries";
import { tutorProfiles } from "@/lib/db/schema";
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

type TutorVettingStatus =
  | "missing"
  | "pending"
  | "changes-requested"
  | "approved"
  | "rejected"
  | "paused";

interface TutorOnboardingState {
  vettingStatus: TutorVettingStatus;
}

async function readTutorOnboardingState(userId: string): Promise<TutorOnboardingState | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({ vettingStatus: tutorProfiles.vettingStatus })
      .from(tutorProfiles)
      .where(eq(tutorProfiles.userId, userId));
    if (rows.length === 0) return { vettingStatus: "missing" };
    return { vettingStatus: (rows[0]?.vettingStatus ?? "missing") as TutorVettingStatus };
  } catch (err) {
    console.error("[dashboard] tutor profile lookup failed", err);
    return null;
  }
}

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

  // Story 5.0 role gating: admins go to /admin (their existing landing);
  // tutors see only the TutorOnboardingCta (or a placeholder for approved
  // tutors until the real tutor-dashboard ships). Students get the full
  // dashboard chrome. Single-role enum at MVP1; dual-role (FR5) is Phase 2+.
  if (user.role === "admin") {
    redirect("/admin");
  }

  if (user.role === "tutor") {
    const tutorState = await readTutorOnboardingState(user.id);
    return <TutorDashboardPlaceholder userId={user.id} tutorState={tutorState} />;
  }

  const now = new Date();
  const displayName = user.name ?? (user.email ? user.email.split("@")[0] ?? null : null);
  const upcoming = await getUpcomingBookingsForStudent(user.id, { now });
  const hasUpcomingLessons = upcoming.length > 0;

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

function TutorDashboardPlaceholder({
  userId,
  tutorState,
}: {
  userId: string;
  tutorState: TutorOnboardingState | null;
}) {
  // Approved tutor: show a "tutor dashboard is coming" placeholder pointing
  // at the existing profile-edit surface (Story 2.5) until tutor-dashboard
  // ships. Non-approved tutor: TutorOnboardingCta covers the onboarding
  // funnel as it did pre-Story-5.0.
  const isApproved = tutorState?.vettingStatus === "approved";

  return (
    <AppShell activeHref="/dashboard" mainClassName="flex flex-1 px-6 py-16">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="space-y-3 text-start">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            לוח הבקרה — מורה
          </h1>
          <p className="text-base leading-7 text-on-surface-variant">
            {isApproved
              ? "הדשבורד המלא של המורה מגיע בקרוב. בינתיים תוכלו לערוך את הפרופיל ולנהל את החשבון."
              : "השלימו את תהליך ההצטרפות כדי להתחיל ללמד."}
          </p>
        </div>

        {tutorState && <TutorOnboardingCta state={tutorState} />}

        {isApproved && (
          <Card padding="md" tone="highlighted" className="text-start">
            <p className="mb-4 text-sm leading-7 text-on-surface-variant">
              עריכת פרופיל מורה, ניהול זמינות וצפייה בהזמנות תיכנסנה לכאן בסיפורים הבאים.
            </p>
            <Button asChild variant="primary" size="md">
              <Link href={`/tutor/${userId}/edit`}>עריכת פרופיל מורה</Link>
            </Button>
          </Card>
        )}
      </section>
    </AppShell>
  );
}

function TutorOnboardingCta({ state }: { state: TutorOnboardingState }) {
  if (state.vettingStatus === "approved") {
    return null;
  }

  if (state.vettingStatus === "pending") {
    return (
      <Card tone="highlighted" padding="md" className="text-start">
        <p className="mb-2 font-display text-lg font-bold text-primary-container">
          הפרופיל שלכם בבדיקה
        </p>
        <p className="text-sm text-on-surface-variant">
          נחזור אליכם תוך 48 שעות. בינתיים תוכלו לסקור את הפרופיל ולוודא שהכל מעודכן.
        </p>
      </Card>
    );
  }

  if (state.vettingStatus === "rejected" || state.vettingStatus === "paused") {
    return (
      <Card tone="error" padding="md" className="text-start">
        <p className="mb-2 font-display text-lg font-bold text-danger">
          {state.vettingStatus === "rejected" ? "הבקשה נדחתה" : "הפרופיל הושהה"}
        </p>
        <p className="text-sm text-on-surface-variant">
          קיבלתם אימייל עם הפרטים. תוכלו לפנות אלינו אם יש שאלות.
        </p>
      </Card>
    );
  }

  const isChangesRequested = state.vettingStatus === "changes-requested";
  return (
    <Card tone="highlighted" padding="md" className="text-start">
      <p className="mb-2 font-display text-lg font-bold text-primary-container">
        {isChangesRequested ? "השלימו את התיקונים שלכם" : "השלימו את הפרופיל שלכם"}
      </p>
      <p className="mb-4 text-sm text-on-surface-variant">
        נשארו לכם רק כמה דקות כדי להופיע במרקטפלייס.
      </p>
      <Button asChild variant="primary" size="md">
        <Link href="/tutor/onboarding/profile">
          {isChangesRequested ? "המשיכו לתיקונים" : "התחילו לבנות פרופיל"}
        </Link>
      </Button>
    </Card>
  );
}
