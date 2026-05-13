// 7-day × half-hour availability calendar for the public tutor profile
// (Story 3.2). RSC — slot states are computed server-side; the only
// "interactive" element is a <Link> wrapping each available slot.
//
// Forward-link contracts:
// - Anon click  → /signup?callbackUrl=...&intent=book&tutorUserId=...&slotIso=...&duration=...
//                 (Story 3.3 reads these on /signup to show the "return to slot" banner)
// - Signed-in   → /booking-stub?tutor=...&slot=...&duration=...
//                 (Story 4.3 replaces /booking-stub with the real booking route)

import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { formatHebrewWeekday, formatIlsCurrency } from "@/lib/hebrew/format";
import type { SlotState, SlotStatesByDay } from "@/lib/availability/compute-slots";

interface AvailabilityCalendarProps {
  tutorUserId: string;
  slotStates: SlotStatesByDay;
  hourlyPriceIls: number;
  lesson45PriceIls: number | null;
  selectedDuration: 45 | 60;
  /** Whether a session exists. Drives the click-target URL: anon → /signup, signed-in → /booking-stub. */
  isSignedIn: boolean;
  /** UTC instant for the first day. Used for empty-state copy. */
  weekStartUtc: Date;
}

const SLOT_START_HOUR = 14;
const SLOT_END_HOUR = 22;
const HOURS_RANGE = Array.from(
  { length: (SLOT_END_HOUR - SLOT_START_HOUR) * 2 },
  (_, idx) => {
    const hour = SLOT_START_HOUR + Math.floor(idx / 2);
    const minute = idx % 2 === 0 ? "00" : "30";
    return `${String(hour).padStart(2, "0")}:${minute}`;
  },
);

function buildSignupCallbackUrl(
  tutorUserId: string,
  slotIso: string,
  duration: 45 | 60,
): string {
  const callbackUrl = `/tutor/${tutorUserId}?duration=${duration}`;
  const params = new URLSearchParams({
    callbackUrl,
    intent: "book",
    tutorUserId,
    slotIso,
    duration: String(duration),
  });
  return `/signup?${params.toString()}`;
}

function buildBookingStubUrl(
  tutorUserId: string,
  slotIso: string,
  duration: 45 | 60,
): string {
  const params = new URLSearchParams({
    tutor: tutorUserId,
    slot: slotIso,
    duration: String(duration),
  });
  return `/booking-stub?${params.toString()}`;
}

export function AvailabilityCalendar({
  tutorUserId,
  slotStates,
  hourlyPriceIls,
  lesson45PriceIls,
  selectedDuration,
  isSignedIn,
  weekStartUtc,
}: AvailabilityCalendarProps) {
  const dayKeys = Array.from(slotStates.keys());
  const hasAnyAvailability = Array.from(slotStates.values()).some((slots) =>
    slots.some((s) => s.status !== "unavailable"),
  );

  if (!hasAnyAvailability) {
    return (
      <section id="schedule" aria-labelledby="schedule-heading" className="mb-12">
        <h2
          id="schedule-heading"
          className="font-display font-bold text-xl text-primary-container mb-4"
        >
          בחרו זמן שיעור
        </h2>
        <Card tone="default" padding="lg">
          <CardBody className="text-start space-y-3">
            <p className="text-on-surface-variant">
              המורה עדיין לא הגדיר/ה זמינות. בקרו שוב בקרוב.
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex items-center gap-2 rounded-lg bg-surface-high px-4 py-2 text-sm font-bold text-on-surface-variant cursor-not-allowed opacity-60"
            >
              צרו קשר עם המורה
            </button>
          </CardBody>
        </Card>
      </section>
    );
  }

  return (
    <section id="schedule" aria-labelledby="schedule-heading" className="mb-12">
      <div className="bg-white rounded-xl border border-linen-border overflow-hidden">
        {/* Header row: heading + duration toggle + (disabled) week nav */}
        <div className="flex flex-col md:flex-row-reverse md:justify-between md:items-center gap-4 p-4 border-b border-linen-border">
          <h2
            id="schedule-heading"
            className="font-display font-bold text-lg text-primary-container"
          >
            בחרו זמן שיעור
          </h2>
          <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
            {/* Duration toggle — query string driven, no client JS */}
            <div
              className="flex flex-row-reverse gap-1 bg-surface-container rounded-md p-0.5"
              role="group"
              aria-label="משך השיעור"
            >
              <Link
                href={`/tutor/${tutorUserId}?duration=60`}
                aria-pressed={selectedDuration === 60}
                scroll={false}
                className={
                  selectedDuration === 60
                    ? "px-3 py-1 rounded bg-white shadow-sm text-primary-container text-xs font-bold"
                    : "px-3 py-1 rounded text-secondary text-xs font-bold"
                }
              >
                60 דק׳ — {formatIlsCurrency(hourlyPriceIls)}
              </Link>
              {lesson45PriceIls !== null && (
                <Link
                  href={`/tutor/${tutorUserId}?duration=45`}
                  aria-pressed={selectedDuration === 45}
                  scroll={false}
                  className={
                    selectedDuration === 45
                      ? "px-3 py-1 rounded bg-white shadow-sm text-primary-container text-xs font-bold"
                      : "px-3 py-1 rounded text-secondary text-xs font-bold"
                  }
                >
                  45 דק׳ — {formatIlsCurrency(lesson45PriceIls)}
                </Link>
              )}
            </div>
            {/* Week nav — disabled at MVP 1; current-week only */}
            <div
              className="flex flex-row-reverse items-center gap-2"
              aria-label="ניווט בין שבועות"
            >
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="ניווט בין שבועות יתאפשר בקרוב"
                className="w-8 h-8 rounded-lg bg-linen border border-linen-border flex items-center justify-center opacity-50 cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  chevron_right
                </span>
              </button>
              <span className="text-sm font-bold text-primary-container">השבוע</span>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="ניווט בין שבועות יתאפשר בקרוב"
                className="w-8 h-8 rounded-lg bg-linen border border-linen-border flex items-center justify-center opacity-50 cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  chevron_left
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="overflow-x-auto">
          <div
            className="min-w-[640px] grid text-xs"
            style={{
              gridTemplateColumns: `60px repeat(${dayKeys.length}, 1fr)`,
            }}
          >
            {/* Header row: empty cell + 7 day headers */}
            <div className="border-b border-linen-border p-2" />
            {dayKeys.map((dayKey, idx) => {
              const dayDate = new Date(
                weekStartUtc.getTime() + idx * 24 * 60 * 60 * 1000,
              );
              const [, mm, dd] = dayKey.split("-");
              return (
                <div
                  key={dayKey}
                  className="border-b border-s border-linen-border p-2 text-center"
                >
                  <div className="font-bold text-primary-container">
                    {formatHebrewWeekday(dayDate)}
                  </div>
                  <div className="text-secondary">
                    {parseInt(dd!, 10)}.{parseInt(mm!, 10)}
                  </div>
                </div>
              );
            })}

            {/* Time-slot rows */}
            {HOURS_RANGE.map((timeLabel) => (
              <CalendarRow
                key={timeLabel}
                timeLabel={timeLabel}
                dayKeys={dayKeys}
                slotStates={slotStates}
                tutorUserId={tutorUserId}
                selectedDuration={selectedDuration}
                isSignedIn={isSignedIn}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="p-3 border-t border-linen-border flex flex-row-reverse items-center gap-4 text-xs text-secondary">
          <span className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded bg-tertiary-fixed"
              aria-hidden="true"
            />
            זמין
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded bg-surface-high"
              aria-hidden="true"
            />
            תפוס
          </span>
        </div>
      </div>
    </section>
  );
}

interface CalendarRowProps {
  timeLabel: string;
  dayKeys: string[];
  slotStates: SlotStatesByDay;
  tutorUserId: string;
  selectedDuration: 45 | 60;
  isSignedIn: boolean;
}

function CalendarRow({
  timeLabel,
  dayKeys,
  slotStates,
  tutorUserId,
  selectedDuration,
  isSignedIn,
}: CalendarRowProps) {
  return (
    <>
      <div className="p-2 text-center text-secondary text-[11px] border-s border-linen-border">
        {timeLabel}
      </div>
      {dayKeys.map((dayKey) => {
        const daySlots = slotStates.get(dayKey) ?? [];
        const slot = daySlots.find((s) => s.localTime === timeLabel);
        return (
          <SlotCell
            key={`${dayKey}-${timeLabel}`}
            slot={slot}
            tutorUserId={tutorUserId}
            selectedDuration={selectedDuration}
            isSignedIn={isSignedIn}
          />
        );
      })}
    </>
  );
}

interface SlotCellProps {
  slot: SlotState | undefined;
  tutorUserId: string;
  selectedDuration: 45 | 60;
  isSignedIn: boolean;
}

function SlotCell({
  slot,
  tutorUserId,
  selectedDuration,
  isSignedIn,
}: SlotCellProps) {
  if (!slot || slot.status === "unavailable") {
    return (
      <div className="h-10 border-s border-linen-border" aria-hidden="true" />
    );
  }
  if (slot.status === "booked") {
    return (
      <div
        className="h-10 border-s border-linen-border bg-surface-high opacity-60"
        aria-label="תפוס"
      />
    );
  }
  // available
  const href = isSignedIn
    ? buildBookingStubUrl(tutorUserId, slot.startIsoUtc, selectedDuration)
    : buildSignupCallbackUrl(tutorUserId, slot.startIsoUtc, selectedDuration);
  return (
    <Link
      href={href}
      aria-label={`הזמינו את הזמן ${slot.localTime}`}
      className="h-10 border-s border-linen-border bg-tertiary-fixed hover:bg-tertiary-accent/40 transition-colors flex items-center justify-center text-[10px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container"
    />
  );
}
