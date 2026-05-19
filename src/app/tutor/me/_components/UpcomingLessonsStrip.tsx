// Tutor-side mirror of the student dashboard's `UpcomingLessonsSlot`.
// Story 4.3 (2026-05-18). Renders at the top of /tutor/me above the tab
// nav — visible on all 3 tabs so the tutor always sees their next lesson
// without hunting through tab content. Closed-beta scale: ≤10 upcoming
// rows is the expectation.
//
// Area 1 (2026-05-19): the strip rows are now wrapped in
// `<BookingPeekModal>` — the canonical "I tapped a booking" interaction
// across the tutor surface (calendar + strip). Per John's call, one
// grammar for one object — not nav-on-click in the strip + peek-on-click
// in the calendar. The "next lesson" hero card keeps its
// `לפרטי השיעור ←` link as a secondary affordance, but the card itself
// is also tap-to-peek so the gesture is consistent with the smaller rows.

"use client";

import { Card, CardBody } from "@/components/ui/card";
import { BookingPeekModal } from "@/components/booking/BookingPeekModal";
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
    <BookingPeekModal
      bookingId={booking.id}
      studentUserId={booking.studentUserId}
      studentName={studentName}
      startsAt={booking.startsAt}
      durationMinutes={booking.durationMinutes}
      subjectNameHe={booking.subjectNameHe}
    >
      <button
        type="button"
        className="block w-full text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-fixed-dim rounded-2xl cursor-pointer"
      >
        <Card tone="highlighted" padding="lg" className="text-start hover:border-primary-fixed-dim transition-colors">
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
          </CardBody>
        </Card>
      </button>
    </BookingPeekModal>
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
            <BookingPeekModal
              bookingId={b.id}
              studentUserId={b.studentUserId}
              studentName={b.studentDisplayName ?? "תלמיד/ה"}
              startsAt={b.startsAt}
              durationMinutes={b.durationMinutes}
              subjectNameHe={b.subjectNameHe}
            >
              <button
                type="button"
                className="block w-full text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-fixed-dim rounded-xl cursor-pointer"
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
              </button>
            </BookingPeekModal>
          </li>
        ))}
      </ul>
    </div>
  );
}
