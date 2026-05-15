import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { StudentSubNav } from "@/components/layout/StudentSubNav";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { getPastBookingsForStudent } from "@/lib/db/queries/booking-queries";
import { formatHebrewDate, formatHebrewWeekday } from "@/lib/hebrew/format";
import {
  requirePrivacyConsent,
  type DbForPrivacyConsent,
} from "@/lib/legal/privacy-consent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "היסטוריית שיעורים · TeachMe",
  description: "כל השיעורים שעברו, סיכומים מהמורה וחשבוניות.",
};

// Story 5.0 ships a MINIMAL past-lessons list — tutor name, date, duration,
// status. Filters (mock lines 41–56) and per-lesson summary/invoice links
// land in Stories 5.3 (session summaries) + 5.4 (student notes).
//
// Tutors are redirected back to /dashboard (their landing for the tutor-
// onboarding CTA). Single-role enum at MVP1; dual-role is Phase 2+.

export default async function LessonsHistoryPage() {
  const user = await requireAuth("/lessons/history");
  await requirePrivacyConsent({
    userId: user.id,
    currentPath: "/lessons/history",
    db: getDb() as unknown as DbForPrivacyConsent,
    redirectFn: redirect,
  });

  if (user.role !== "student") {
    redirect("/dashboard");
  }

  const past = await getPastBookingsForStudent(user.id);

  return (
    <AppShell activeHref="/dashboard" mainClassName="flex flex-1 flex-col">
      <StudentSubNav activeTab="history" />

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <div className="text-start">
          <h1 className="font-display text-2xl font-extrabold text-primary-container">
            היסטוריית שיעורים
          </h1>
          <p className="text-sm text-secondary">
            {past.length === 0
              ? "כל השיעורים שעברו, סיכומים מהמורה וחשבוניות."
              : `${past.length} שיעורים בהיסטוריה.`}
          </p>
        </div>

        {past.length === 0 ? (
          <Card tone="highlighted" padding="lg" className="text-start">
            <CardBody className="space-y-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-3xl text-primary-container"
                >
                  history
                </span>
                <div className="flex-1 space-y-2">
                  <h2 className="font-display text-xl font-extrabold text-primary-container">
                    עדיין לא היו לכם שיעורים
                  </h2>
                  <p className="text-sm leading-7 text-on-surface-variant">
                    לאחר השיעור הראשון תוכלו לראות כאן את הסיכום מהמורה,
                    חשבונית המס, ולדרג את השיעור.
                  </p>
                </div>
              </div>
              <div>
                <Button asChild size="lg">
                  <Link href="/browse">חיפוש מורה ←</Link>
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : (
          <ul className="space-y-3">
            {past.map((booking) => (
              <li key={booking.id}>
                <Card padding="md" className="text-start">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <p className="font-display text-base font-bold text-primary-container">
                        {booking.tutorDisplayName ?? "מורה"}
                        {booking.subjectNameHe ? ` · ${booking.subjectNameHe}` : ""}
                      </p>
                      <p className="text-xs text-secondary">
                        {formatHebrewWeekday(booking.startsAt)} ·{" "}
                        {formatHebrewDate(booking.startsAt)} · {booking.durationMinutes} דק׳
                      </p>
                    </div>
                    <span className="rounded-full bg-primary-fixed/40 px-3 py-1 text-xs font-bold text-primary-container">
                      {booking.status === "completed" ? "הושלם" : "לא התקיים"}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
