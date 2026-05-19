// Minimal "upcoming lessons" surface for Story 5.0 — renders the next lesson
// as a hero card + a short strip of additional upcoming lessons below.
//
// Story 5.1 will REPLACE the body with the fully-furnished version from
// mocks/dashboard.html lines 84–170 (live countdown + Join button + pre-
// flight check widget). Story 5.0 ships a static placeholder so dogfood
// users can see their seeded bookings reflect on the dashboard.
//
// Why not return null until 5.1 lands: the original spec did. The user
// asked to see seeded bookings reflect on the dashboard, so a minimal
// visible version is shippable now.

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CancelLessonModal } from "@/components/booking/CancelLessonModal";
import { formatHebrewDate, formatHebrewWeekday } from "@/lib/hebrew/format";
import type { UpcomingBookingRow } from "@/lib/db/queries/booking-queries";

interface UpcomingLessonsSlotProps {
  upcoming: UpcomingBookingRow[];
}

export function UpcomingLessonsSlot({ upcoming }: UpcomingLessonsSlotProps) {
  if (upcoming.length === 0) return null;

  const [next, ...rest] = upcoming;
  if (!next) return null;

  return (
    <div className="space-y-6">
      <NextLessonHero booking={next} />
      {rest.length > 0 && <UpcomingStrip bookings={rest} />}
    </div>
  );
}

function NextLessonHero({ booking }: { booking: UpcomingBookingRow }) {
  const tutorName = booking.tutorDisplayName ?? "המורה";
  return (
    <Card tone="highlighted" padding="lg" className="text-start">
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-3xl text-primary-container"
          >
            videocam
          </span>
          <div className="flex-1 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-on-tertiary-fixed-variant">
              השיעור הבא
            </p>
            <h2 className="font-display text-xl font-extrabold text-primary-container">
              {tutorName}
              {booking.subjectNameHe ? ` · ${booking.subjectNameHe}` : ""}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {formatHebrewWeekday(booking.startsAt)} ·{" "}
              {formatHebrewDate(booking.startsAt)} · {booking.durationMinutes} דק׳
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button disabled size="lg" title="הצטרפות לשיעור תפעל בקרוב">
            הצטרפות לשיעור (בקרוב)
          </Button>
          <CancelLessonModal
            bookingId={booking.id}
            viewerRole="student"
            counterpartName={tutorName}
            startsAt={booking.startsAt}
            durationMinutes={booking.durationMinutes}
            subjectNameHe={booking.subjectNameHe}
          >
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="text-danger hover:text-red-700 hover:bg-danger/5"
            >
              ביטול שיעור
            </Button>
          </CancelLessonModal>
          <p className="self-center text-xs text-secondary">
            בדיקת מצלמה ומיקרופון תופיע 5 דקות לפני השיעור.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function UpcomingStrip({ bookings }: { bookings: UpcomingBookingRow[] }) {
  return (
    <section className="text-start">
      <h3 className="mb-3 font-display text-base font-bold text-primary-container">
        השיעורים הבאים
      </h3>
      {/*
        Founder feedback 2026-05-19 r3: the prior `.slice(0, 3)` capped the
        visible strip at 3 cards, leaving future lessons #5+ uncancellable
        from the dashboard. Drop the slice so every upcoming lesson (up to
        the query's MAX=10 cap) shows with a cancel link. Closed-beta scale
        — 10 cards is acceptable; if it grows past that, a paginated
        "all my lessons" page becomes the right answer.
      */}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {bookings.map((b) => {
          const tutorName = b.tutorDisplayName ?? "מורה";
          return (
            <li key={b.id}>
              <Card padding="sm" className="text-start">
                <p className="text-xs font-bold text-secondary">
                  {formatHebrewWeekday(b.startsAt)} ·{" "}
                  {formatHebrewDate(b.startsAt)}
                </p>
                <p className="mt-1 font-display text-sm font-bold text-on-surface">
                  {tutorName}
                </p>
                <p className="text-xs text-secondary">
                  {b.subjectNameHe ? `${b.subjectNameHe} · ` : ""}
                  {b.durationMinutes} דק׳
                </p>
                <div className="mt-2 flex justify-start">
                  <CancelLessonModal
                    bookingId={b.id}
                    viewerRole="student"
                    counterpartName={tutorName}
                    startsAt={b.startsAt}
                    durationMinutes={b.durationMinutes}
                    subjectNameHe={b.subjectNameHe}
                  >
                    {/* Review patch 8: accessible cancel button — proper
                        Button primitive with `size="sm"` (h-8 ≥ 32px,
                        adequate touch target after px-3 padding totalling
                        ~80×32), aria-label naming the specific lesson
                        for screen-reader users, and focus-visible ring
                        from the primitive's CVA defaults. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`ביטול שיעור עם ${tutorName} בתאריך ${formatHebrewDate(b.startsAt)}`}
                      className="text-danger hover:text-red-700 hover:bg-danger/5"
                    >
                      ביטול שיעור
                    </Button>
                  </CancelLessonModal>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
