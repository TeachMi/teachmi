import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { signOut } from "@/lib/auth/auth";
import { requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { tutorProfiles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";

  await signOut({ redirectTo: "/signin" });
}

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
    // Don't crash the dashboard for tutors — render without the CTA so a Neon
    // outage doesn't break the page. Tutors can navigate directly to
    // /tutor/onboarding/profile if needed.
    return null;
  }
}

export default async function DashboardPage() {
  const user = await requireAuth("/dashboard");
  const displayName = user.name ?? user.email ?? "TeachMe";
  const tutorState = user.role === "tutor" ? await readTutorOnboardingState(user.id) : null;

  return (
    <AppShell
      activeHref="/dashboard"
      headerAction={
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="md">
            יציאה
          </Button>
        </form>
      }
      mainClassName="flex flex-1 px-6 py-16"
    >
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="space-y-3 text-start">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            לוח הבקרה
          </h1>
          <p className="text-base leading-7 text-on-surface-variant">{displayName}</p>
        </div>

        {tutorState && <TutorOnboardingCta state={tutorState} />}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card padding="sm">
            <p className="text-sm text-on-surface-variant">השיעור הבא</p>
            <CardBody className="mt-2 font-display text-xl font-bold text-primary-container">
              מוכן לסיפורי הדשבורד
            </CardBody>
          </Card>
          <Card padding="sm">
            <p className="text-sm text-on-surface-variant">מעטפת</p>
            <CardBody className="mt-2 font-display text-xl font-bold text-primary-container">
              RTL מלא
            </CardBody>
          </Card>
          <Card padding="sm">
            <p className="text-sm text-on-surface-variant">חשבון</p>
            <CardBody className="mt-2 font-display text-xl font-bold text-primary-container">
              מחובר
            </CardBody>
          </Card>
        </div>
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
