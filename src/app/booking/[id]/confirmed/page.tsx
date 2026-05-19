// Approval page rendered after a successful checkout submit.
// Story 4.3 (2026-05-18). Mirrors `mocks/booking.html`.
//
// Auth gate: only the student or tutor on this booking can view it. Anyone
// else (including signed-out visitors) gets a 404. The DB query itself is
// the auth gate via `getBookingByIdForUser` — no fetch-then-check.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CancelLessonModal } from "@/components/booking/CancelLessonModal";
import { auth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";
import { subjects, tutorProfiles, users } from "@/lib/db/schema";
import { getBookingByIdForUser } from "@/lib/booking/booking-flow";
import { formatIlsCurrency } from "@/lib/hebrew/format";
import type { TutorDb } from "@/app/tutor/onboarding/profile/profile-flow";
import { AddToCalendarButtons } from "./_components/AddToCalendarButtons";

export const dynamic = "force-dynamic";

interface ConfirmedPageProps {
  params: Promise<{ id: string }>;
}

// Code review 2026-05-19 (F18): wrap `auth()` so a NextAuth decode failure
// (rotated AUTH_SECRET, malformed cookie) → null instead of a 500. The
// public tutor profile uses the same pattern via `safeAuth()` in
// `/tutor/[slug]/page.tsx`. The confirmed page is authed-only, so the
// degraded outcome is a clean redirect to /signin instead of a crash.
async function safeAuth(): Promise<{ user?: { id?: string } | null } | null> {
  try {
    return (await auth()) as { user?: { id?: string } | null } | null;
  } catch (err) {
    console.error("[booking/confirmed] auth() lookup failed", err);
    return null;
  }
}

export default async function BookingConfirmedPage({ params }: ConfirmedPageProps) {
  const { id } = await params;
  const session = await safeAuth();
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=/booking/${id}/confirmed`);
  }
  const userId = session.user.id;
  const db = getDb() as unknown as TutorDb;

  const booking = await getBookingByIdForUser(id, { db, userId });
  if (booking === null) notFound();

  // Display names + subject — single batched DB pass. Tutor name via the
  // existing tutor-profiles-with-users fallback; student name via the
  // users table; subject from the booked subject_id (nullable).
  const realDb = getDb();
  const [tutorNameRows, studentNameRows, subjectRows] = await Promise.all([
    realDb
      .select({
        tpName: tutorProfiles.displayName,
        uName: users.name,
      })
      .from(users)
      .leftJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
      .where(eq(users.id, booking.tutorUserId))
      .limit(1) as Promise<Array<{ tpName: string | null; uName: string | null }>>,
    realDb
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, booking.studentUserId))
      .limit(1) as Promise<Array<{ name: string | null }>>,
    booking.subjectId
      ? (realDb
          .select({ displayNameHe: subjects.displayNameHe })
          .from(subjects)
          .where(eq(subjects.id, booking.subjectId))
          .limit(1) as Promise<Array<{ displayNameHe: string | null }>>)
      : Promise.resolve([] as Array<{ displayNameHe: string | null }>),
  ]);
  const tutorDisplayName =
    tutorNameRows[0]?.tpName ?? tutorNameRows[0]?.uName ?? "המורה";
  const studentDisplayName = studentNameRows[0]?.name ?? "התלמיד/ה";
  const subjectNameHe = subjectRows[0]?.displayNameHe ?? null;

  const start = booking.startsAt;
  const end = new Date(start.getTime() + booking.durationMinutes * 60 * 1000);

  const dateLabel = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  }).format(start);
  const timeLabel = `${formatTime(start)} — ${formatTime(end)}`;

  // Is this the student or the tutor viewing?
  const isStudent = booking.studentUserId === userId;
  const dashboardHref = isStudent ? "/dashboard" : "/tutor/me";
  const viewerRole = isStudent ? ("student" as const) : ("tutor" as const);
  const counterpartName = isStudent ? tutorDisplayName : studentDisplayName;

  // Cancel button is shown only when the booking is still cancellable —
  // active status AND start is in the future. Past-start cancel is also
  // rejected server-side (cancel-flow's time gate); the UI hides the
  // button so it's not a foot-gun.
  const isActiveBooking =
    booking.status === "confirmed" || booking.status === "pending_payment";
  const isFutureStart = start.getTime() > new Date().getTime();
  const canCancel = isActiveBooking && isFutureStart;
  const isCancelledBooking = booking.status === "cancelled";

  return (
    <AppShell mainClassName="flex-1 bg-linen">
      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Header — adapts to status. Confirmed (or pending) renders the
            success state; cancelled renders a neutral "cancelled" banner
            so the page is still safe to land on after a cancel. */}
        {isCancelledBooking ? (
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-surface-container rounded-full mx-auto flex items-center justify-center mb-4">
              <span
                className="material-symbols-outlined text-secondary text-5xl"
                aria-hidden="true"
              >
                event_busy
              </span>
            </div>
            <h1 className="font-display font-extrabold text-3xl text-on-surface mb-2">
              השיעור בוטל
            </h1>
            <p className="text-on-surface-variant">
              ההזמנה הזו בוטלה. הזיכוי המלא יזוכה אוטומטית. (בטא סגורה — לא בוצע
              חיוב כספי בפועל.)
            </p>
          </div>
        ) : (
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-primary-fixed rounded-full mx-auto flex items-center justify-center mb-4 shadow-md">
              <span
                className="material-symbols-outlined text-primary-container text-5xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                check_circle
              </span>
            </div>
            <h1 className="font-display font-extrabold text-3xl text-primary-container mb-2">
              השיעור הוזמן!
            </h1>
            <p className="text-on-surface-variant">
              שמרנו את ההזמנה במערכת. תזכורת תגיע 24 שעות לפני השיעור.
            </p>
          </div>
        )}

        {/* Booking summary */}
        <section className="bg-white rounded-2xl border border-linen-border shadow-sm overflow-hidden mb-6">
          {/* Tutor strip */}
          <div className="bg-primary-container text-on-primary p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-fixed/40 flex items-center justify-center text-on-primary font-bold text-2xl">
              {tutorDisplayName.slice(0, 1)}
            </div>
            <div className="text-start">
              <h3 className="font-display font-bold text-lg">{tutorDisplayName}</h3>
              <p className="text-on-primary-container text-sm">שיעור פרטי אונליין</p>
            </div>
          </div>

          {/* Lesson details */}
          <div className="p-6 space-y-4 text-start">
            <div className="grid grid-cols-2 gap-4">
              <DetailCell icon="event" label="תאריך" value={dateLabel} />
              <DetailCell icon="schedule" label="שעה" value={timeLabel} />
              <DetailCell
                icon="hourglass_top"
                label="משך"
                value={`${booking.durationMinutes} דקות`}
              />
              <DetailCell icon="videocam" label="פלטפורמה" value="שיעור אונליין" />
            </div>

            <div className="border-t border-linen-border pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary">
                  שיעור {booking.durationMinutes} דק׳
                </span>
                <span className="font-bold">{formatIlsCurrency(booking.priceIls)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">עמלת פלטפורמה</span>
                <span className="font-bold">כלולה</span>
              </div>
              <div className="flex justify-between border-t border-linen-border pt-2 mt-2">
                <span className="font-display font-bold text-base">סה״כ</span>
                <span className="font-display font-extrabold text-2xl text-primary-container">
                  {formatIlsCurrency(booking.priceIls)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Invoice notice */}
        <div className="bg-white rounded-xl border border-primary-fixed-dim p-4 mb-6 flex items-start gap-3 text-start">
          <span
            className="material-symbols-outlined text-primary-container text-2xl shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            receipt_long
          </span>
          <div className="text-sm">
            <p className="font-bold text-primary-container mb-1">חשבונית מס מסודרת</p>
            <p className="text-secondary leading-relaxed">
              חשבונית דיגיטלית תישלח אליך במייל בסיום השיעור. {tutorDisplayName} רשום/ה
              כעוסק/ת זעיר/ה ברשות המסים.
            </p>
          </div>
        </div>

        {/* Add to calendar — only when the booking is still active. */}
        {!isCancelledBooking && (
          <AddToCalendarButtons
            bookingId={booking.id}
            startIso={start.toISOString()}
            endIso={end.toISOString()}
            tutorDisplayName={tutorDisplayName}
            duration={booking.durationMinutes}
          />
        )}

        {/* CTAs */}
        <div className="flex gap-3 mt-6">
          <Button asChild variant="primary" size="lg" fullWidth>
            <Link href={dashboardHref}>
              {isStudent ? "לדשבורד שלי" : "לאזור המורה"}
            </Link>
          </Button>
          {isStudent && (
            <Button asChild variant="outline" size="lg" fullWidth>
              <Link href="/browse">חיפוש מורים נוספים</Link>
            </Button>
          )}
        </div>

        {/* Cancel — only when the booking is still active AND start is
            future. Renders as a low-emphasis ghost-with-destructive-text
            button so it doesn't compete with the primary "back to
            dashboard" CTA above. */}
        {canCancel && (
          <div className="mt-6 flex justify-center">
            <CancelLessonModal
              bookingId={booking.id}
              viewerRole={viewerRole}
              counterpartName={counterpartName}
              startsAt={start}
              durationMinutes={booking.durationMinutes}
              subjectNameHe={subjectNameHe}
            >
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="text-danger hover:text-red-700 hover:bg-danger/5"
              >
                בטל שיעור
              </Button>
            </CancelLessonModal>
          </div>
        )}

        {!isCancelledBooking && (
          <p className="text-center text-xs text-secondary mt-6 leading-relaxed">
            ניתן לבטל את השיעור עד תחילתו ללא עלות.
            <br />
            בטא סגורה — לא בוצע חיוב כספי בפועל.
          </p>
        )}
      </main>
    </AppShell>
  );
}

function DetailCell({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs text-secondary mb-1">{label}</div>
      <div className="font-display font-bold text-lg text-on-surface flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-container" aria-hidden="true">
          {icon}
        </span>
        {value}
      </div>
    </div>
  );
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(d);
}
