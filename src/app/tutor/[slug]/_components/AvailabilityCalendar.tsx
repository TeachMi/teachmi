"use client";

// 7-day half-hour availability calendar on the public tutor profile.
//
// Founder direction 2026-05-18:
//   - 2 colors only — open (green) vs not-open (gray). We DELIBERATELY
//     do not distinguish "tutor doesn't work then" / "tutor explicitly
//     blocked" / "someone else booked it." A student should not be able
//     to infer a tutor's working pattern from their public profile.
//   - Default window 14:00–22:00 (prime tutoring time in IL). Toggles
//     above + below the grid let the student expand to morning
//     (08:00–14:00) or late evening (22:00–23:00) on demand.
//   - All offered lesson lengths (45/60/75/90) render as duration tabs.
//   - 2-week horizon (extended from 1) — the parent page fetches +
//     navigates within that range.
//
// Window constants imported from the SAME `SCHEDULE_GRID` the tutor
// editor uses (`src/app/tutor/me/schedule/_lib/schedule-flow.ts`) so
// the editor and the public calendar can never drift apart again.
//
// Forward-link contracts (unchanged):
//   - Anon click   → /signup?callbackUrl=...&intent=book&...
//   - Signed-in    → /booking-stub?tutor=...&slot=...&duration=...
//   Story 4.x replaces /booking-stub with the real booking route.

import Link from "next/link";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { formatHebrewWeekday, formatIlsCurrency } from "@/lib/hebrew/format";
import type { SlotState, SlotStatesByDay } from "@/lib/availability/compute-slots";
import { SCHEDULE_GRID } from "@/app/tutor/me/schedule/_lib/schedule-flow";
import {
  buildGateSignupUrl,
  buildSignedBookingStubUrl,
} from "@/lib/booking/urls";

// Default "prime tutoring time" — what students see without any expand.
// 14:00–22:00 matches the IL afternoon/evening tutoring rhythm Sally
// flagged. The user can expand to the full SCHEDULE_GRID window.
const DEFAULT_VISIBLE_START_HOUR = 14;
const DEFAULT_VISIBLE_END_HOUR = 22;

export type LessonDurationMinutes = 45 | 60 | 75 | 90;

interface AvailabilityCalendarProps {
  tutorUserId: string;
  slotStates: SlotStatesByDay;
  /** Per-length pricing (null = length not offered). */
  prices: Record<LessonDurationMinutes, number | null>;
  selectedDuration: LessonDurationMinutes;
  /** `false` → anon links go to `/signup`; `true` → signed-in stub. */
  isSignedIn: boolean;
  /** UTC instant of the first visible day (Sunday at IL midnight). */
  weekStartUtc: Date;
}

interface SlotRow {
  hour: number;
  minute: number;
  timeLabel: string;
}

function buildSlotRows(startHour: number, endHour: number): SlotRow[] {
  const out: SlotRow[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 30]) {
      out.push({
        hour: h,
        minute: m,
        timeLabel: `${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`,
      });
    }
  }
  return out;
}

const DURATION_OPTIONS: LessonDurationMinutes[] = [45, 60, 75, 90];

export function AvailabilityCalendar({
  tutorUserId,
  slotStates,
  prices,
  selectedDuration,
  isSignedIn,
  weekStartUtc,
}: AvailabilityCalendarProps) {
  const [showMorning, setShowMorning] = useState(false);
  const [showLate, setShowLate] = useState(false);

  // Visible window in hours.
  const visibleStartHour = showMorning
    ? SCHEDULE_GRID.START_HOUR
    : DEFAULT_VISIBLE_START_HOUR;
  const visibleEndHour = showLate
    ? SCHEDULE_GRID.END_HOUR
    : DEFAULT_VISIBLE_END_HOUR;
  const rows = buildSlotRows(visibleStartHour, visibleEndHour);

  const dayKeys = Array.from(slotStates.keys());
  const hasAnyAvailability = Array.from(slotStates.values()).some((slots) =>
    slots.some((s) => s.status === "available"),
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

  // Render duration tabs only for lengths the tutor offers (non-null price).
  // Auto-fallback: if the selected duration was hidden by the tutor's
  // pricing config, fall back to the first offered length so we never
  // render an empty tab strip.
  const offeredDurations = DURATION_OPTIONS.filter((d) => prices[d] !== null);
  const effectiveSelected = offeredDurations.includes(selectedDuration)
    ? selectedDuration
    : (offeredDurations[0] ?? selectedDuration);

  return (
    <section id="schedule" aria-labelledby="schedule-heading" className="mb-12">
      <div className="bg-white rounded-xl border border-linen-border overflow-hidden">
        {/* Header — heading + duration toggle */}
        <div className="flex flex-col gap-4 p-4 border-b border-linen-border md:flex-row md:items-center md:justify-between">
          <h2
            id="schedule-heading"
            className="font-display font-bold text-lg text-primary-container"
          >
            בחרו זמן שיעור
          </h2>
          {offeredDurations.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1 bg-surface-container rounded-md p-0.5"
              role="group"
              aria-label="משך השיעור"
            >
              {offeredDurations.map((dur) => {
                const isActive = effectiveSelected === dur;
                const price = prices[dur];
                return (
                  <Link
                    key={dur}
                    href={`/tutor/${tutorUserId}?duration=${dur}`}
                    aria-pressed={isActive}
                    scroll={false}
                    className={
                      isActive
                        ? "px-3 py-1 rounded bg-white shadow-sm text-primary-container text-xs font-bold"
                        : "px-3 py-1 rounded text-secondary text-xs font-bold hover:text-primary-container"
                    }
                  >
                    {dur} דק׳ — {price !== null ? formatIlsCurrency(price) : "—"}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Morning expand toggle */}
        {visibleStartHour > SCHEDULE_GRID.START_HOUR ? (
          <button
            type="button"
            onClick={() => setShowMorning(true)}
            className="w-full border-b border-linen-border bg-linen px-4 py-2 text-xs font-bold text-primary-container hover:bg-linen-border/40"
          >
            ▼ הצגת שעות בוקר ({String(SCHEDULE_GRID.START_HOUR).padStart(2, "0")}:00–{String(DEFAULT_VISIBLE_START_HOUR).padStart(2, "0")}:00)
          </button>
        ) : visibleStartHour < DEFAULT_VISIBLE_START_HOUR ? (
          <button
            type="button"
            onClick={() => setShowMorning(false)}
            className="w-full border-b border-linen-border bg-linen px-4 py-2 text-xs font-bold text-primary-container hover:bg-linen-border/40"
          >
            ▲ הסתרת שעות בוקר
          </button>
        ) : null}

        {/* Grid */}
        <div className="overflow-x-auto">
          <div
            className="min-w-[640px] grid text-xs"
            style={{
              gridTemplateColumns: `60px repeat(${dayKeys.length}, 1fr)`,
            }}
          >
            {/* Day headers */}
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

            {/* Slot rows */}
            {rows.map((row) => (
              <CalendarRow
                key={row.timeLabel}
                timeLabel={row.timeLabel}
                dayKeys={dayKeys}
                slotStates={slotStates}
                tutorUserId={tutorUserId}
                selectedDuration={effectiveSelected}
                isSignedIn={isSignedIn}
              />
            ))}
          </div>
        </div>

        {/* Late-evening expand toggle */}
        {visibleEndHour < SCHEDULE_GRID.END_HOUR ? (
          <button
            type="button"
            onClick={() => setShowLate(true)}
            className="w-full border-t border-linen-border bg-linen px-4 py-2 text-xs font-bold text-primary-container hover:bg-linen-border/40"
          >
            ▼ הצגת שעות ערב מאוחרות ({String(DEFAULT_VISIBLE_END_HOUR).padStart(2, "0")}:00–{String(SCHEDULE_GRID.END_HOUR).padStart(2, "0")}:00)
          </button>
        ) : visibleEndHour > DEFAULT_VISIBLE_END_HOUR ? (
          <button
            type="button"
            onClick={() => setShowLate(false)}
            className="w-full border-t border-linen-border bg-linen px-4 py-2 text-xs font-bold text-primary-container hover:bg-linen-border/40"
          >
            ▲ הסתרת שעות ערב מאוחרות
          </button>
        ) : null}

        {/* Legend — 2 colors only (founder direction 2026-05-18) */}
        <div className="border-t border-linen-border flex items-center gap-4 p-3 text-xs text-secondary">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-success" aria-hidden="true" />
            פנוי
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-surface-container" aria-hidden="true" />
            לא פנוי
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
  selectedDuration: LessonDurationMinutes;
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
  selectedDuration: LessonDurationMinutes;
  isSignedIn: boolean;
}

function SlotCell({
  slot,
  tutorUserId,
  selectedDuration,
  isSignedIn,
}: SlotCellProps) {
  // 2-color rule (founder 2026-05-18): everything that's not "available"
  // renders identically — privacy-preserving, students can't infer
  // booking patterns or blocked days.
  if (!slot || slot.status !== "available") {
    return (
      <div className="h-10 border-s border-linen-border bg-surface-container" aria-hidden="true" />
    );
  }
  const href = isSignedIn
    ? buildSignedBookingStubUrl({
        tutorUserId,
        slotIso: slot.startIsoUtc,
        duration: selectedDuration,
      })
    : buildGateSignupUrl({
        tutorUserId,
        slotIso: slot.startIsoUtc,
        duration: selectedDuration,
      });
  return (
    <Link
      href={href}
      aria-label={`הזמינו את הזמן ${slot.localTime}`}
      className="h-10 border-s border-linen-border bg-success hover:bg-success/85 transition-colors flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container"
    />
  );
}
