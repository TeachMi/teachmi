// Tutor-side mirror of the student dashboard's `UpcomingLessonsSlot`.
// Story 4.3 (2026-05-18). Renders at the top of /tutor/me above the tab
// nav — visible on all 3 tabs so the tutor always sees their next lesson
// without hunting through tab content. Closed-beta scale: ≤10 upcoming
// rows is the expectation.
//
// Per the founder direction, view-only — no Join, no Cancel, no
// Reschedule in this story.

import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import {
  formatHebrewDate,
  formatHebrewWeekday,
  formatIlsCurrency,
} from "@/lib/hebrew/format";
import type { UpcomingTutorBookingRow } from "@/lib/db/queries/booking-queries";

interface UpcomingLessonsStripProps {
  upcoming: UpcomingTutorBookingRow[];
}

export function UpcomingLessonsStrip({ upcoming }: UpcomingLessonsStripProps) {
  if (upcoming.length === 0) return null;

  const [next, ...rest] = upcoming;
  if (!next) return null;

  return (
    <section className="mb-8 space-y-4">
      <NextLessonHero booking={next} />
      {rest.length > 0 && <UpcomingList bookings={rest.slice(0, 3)} />}
    </section>
  );
}

function NextLessonHero({ booking }: { booking: UpcomingTutorBookingRow }) {
  const studentName = booking.studentDisplayName ?? "תלמיד/ה";
  return (
    <Card tone="highlighted" padding="lg" className="text-start">
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-3xl text-primary-container"
          >
            videocam
          </span>
          <div className="flex-1 space-y-1">
            <p className="text-xs font-bold uppercase tracking-wide text-on-tertiary-fixed-variant">
              השיעור הבא שלך
            </p>
            <h2 className="font-display text-xl font-extrabold text-primary-container">
              {studentName}
              {booking.subjectNameHe ? ` · ${booking.subjectNameHe}` : ""}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {formatHebrewWeekday(booking.startsAt)} ·{" "}
              {formatHebrewDate(booking.startsAt)} · {booking.durationMinutes} דק׳ ·{" "}
              {formatIlsCurrency(booking.tutorPayoutIls)} לתשלום
            </p>
          </div>
        </div>
        <Link
          href={`/booking/${booking.id}/confirmed`}
          className="inline-block text-sm font-bold text-primary-container hover:underline"
        >
          לפרטי השיעור ←
        </Link>
      </CardBody>
    </Card>
  );
}

function UpcomingList({ bookings }: { bookings: UpcomingTutorBookingRow[] }) {
  return (
    <div className="text-start">
      <h3 className="mb-3 font-display text-base font-bold text-primary-container">
        שיעורים נוספים השבוע
      </h3>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {bookings.map((b) => (
          <li key={b.id}>
            <Link
              href={`/booking/${b.id}/confirmed`}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-fixed-dim rounded-xl"
            >
              <Card padding="sm" className="text-start hover:border-primary-fixed-dim transition-colors">
                <p className="text-xs font-bold text-secondary">
                  {formatHebrewWeekday(b.startsAt)} ·{" "}
                  {formatHebrewDate(b.startsAt)}
                </p>
                <p className="mt-1 font-display text-sm font-bold text-on-surface">
                  {b.studentDisplayName ?? "תלמיד/ה"}
                </p>
                <p className="text-xs text-secondary">
                  {b.subjectNameHe ? `${b.subjectNameHe} · ` : ""}
                  {b.durationMinutes} דק׳
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
