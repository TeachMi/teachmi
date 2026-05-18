"use client";

// Booking modal for the public tutor profile (Story 3.2 follow-up
// 2026-05-18). Replaces the inline `AvailabilityCalendar` grid.
//
// Founder direction 2026-05-18 (Preply-style flow, after looking at
// `mocks/tutor-v2.html`):
//   - Booking is now a MODAL the student opens from the sticky sidebar.
//   - Layout: duration tabs → 7-day strip → single-period view at a
//     time (pagination dots/arrows for morning/afternoon/evening/night).
//   - 30-min universal stagger across all durations (Sally call —
//     prevents the duration switcher from changing what slot times
//     appear, which would otherwise hurt conversion).
//   - "אין זמינות ביום זה" when the day has zero open slots; if the
//     day has slots but not in the active period, the period switcher
//     itself shows the next period naturally.
//   - Strip "שיעור היכרות" (trial-lesson) framing — TeachMe/CLAUDE.md
//     locks "no trial lessons" as a rejected idea (deferred to Phase
//     2). The modal title is just "הזמנת שיעור".
//   - Anon → `/signup?...&intent=book&...` gate URL on continue.
//     Signed-in → inline "בקרוב" toast for closed-beta; Story 4.3
//     will replace with the real booking action.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildGateSignupUrl,
  buildSignedBookingStubUrl,
} from "@/lib/booking/urls";
import { formatHebrewWeekday, formatIlsCurrency } from "@/lib/hebrew/format";
import type { SlotStatesByDay } from "@/lib/availability/compute-slots";
import {
  BOOKING_PERIODS,
  periodForLocalTime,
  type PeriodKey,
} from "./period-helpers";

export type LessonDurationMinutes = 45 | 60 | 75 | 90;

const DURATION_OPTIONS: LessonDurationMinutes[] = [45, 60, 75, 90];

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  tutorUserId: string;
  displayName: string;
  profilePhotoUrl: string | null;
  prices: Record<LessonDurationMinutes, number | null>;
  slotStates: SlotStatesByDay;
  /** UTC instant of the first day in `slotStates` (IL midnight). */
  weekStartUtc: Date;
  isSignedIn: boolean;
  /** Length to preselect on open. */
  initialDuration: LessonDurationMinutes;
}

interface DayEntry {
  dateKey: string; // YYYY-MM-DD
  dateObj: Date; // UTC midnight of that IL day
  /** Slots restricted to status="available" only. */
  availableSlots: { startIsoUtc: string; localTime: string }[];
}

export function BookingModal({
  open,
  onClose,
  tutorUserId,
  displayName,
  profilePhotoUrl,
  prices,
  slotStates,
  weekStartUtc,
  isSignedIn,
  initialDuration,
}: BookingModalProps) {
  const offeredDurations = useMemo(
    () => DURATION_OPTIONS.filter((d) => prices[d] !== null),
    [prices],
  );
  const fallbackDuration =
    offeredDurations.find((d) => d === initialDuration) ??
    offeredDurations[0] ??
    initialDuration;

  const [duration, setDuration] = useState<LessonDurationMinutes>(fallbackDuration);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = first 7 days, 1 = next 7
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<PeriodKey>("afternoon");
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null);
  const [bookingToast, setBookingToast] = useState<string | null>(null);

  // Per-render derived-state: detect open transition (false→true) and
  // reset transient selection state in render rather than an effect.
  // React 19 lint forbids setState-inside-useEffect; the supported
  // pattern is setState-during-render guarded by a state-tracked seed.
  const [openSeed, setOpenSeed] = useState<boolean>(open);
  if (openSeed !== open) {
    setOpenSeed(open);
    if (open) {
      // Modal just opened — reset transient picks (carry duration over
      // because the duration toggle is purely UI-driven by the user).
      setWeekOffset(0);
      setSelectedSlotIso(null);
      setBookingToast(null);
    }
  }

  // Escape closes; body scroll lock while open. (No setState inside, so
  // useEffect is fine here.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Build per-day entries (all 14 days from slotStates).
  const allDays: DayEntry[] = useMemo(() => {
    const entries: DayEntry[] = [];
    const keys = Array.from(slotStates.keys());
    keys.forEach((dateKey, idx) => {
      const allSlots = slotStates.get(dateKey) ?? [];
      const availableSlots = allSlots
        .filter((s) => s.status === "available")
        .map((s) => ({ startIsoUtc: s.startIsoUtc, localTime: s.localTime }));
      const dateObj = new Date(
        weekStartUtc.getTime() + idx * 24 * 60 * 60 * 1000,
      );
      entries.push({ dateKey, dateObj, availableSlots });
    });
    return entries;
  }, [slotStates, weekStartUtc]);

  // Per-render derived-state: when `allDays` identity changes (new
  // slotStates Map from the parent) and the currently selected day is
  // no longer in it, auto-pick the first day with availability — or
  // the first day overall if none have slots.
  const [allDaysSeed, setAllDaysSeed] = useState<typeof allDays | null>(null);
  if (allDaysSeed !== allDays) {
    setAllDaysSeed(allDays);
    const stillValid =
      selectedDateKey !== null &&
      allDays.some((d) => d.dateKey === selectedDateKey);
    if (!stillValid) {
      const firstAvailable = allDays.find((d) => d.availableSlots.length > 0);
      setSelectedDateKey(firstAvailable?.dateKey ?? allDays[0]?.dateKey ?? null);
    }
  }

  // The 7-day window for the day strip.
  const visibleDays = useMemo(
    () => allDays.slice(weekOffset * 7, weekOffset * 7 + 7),
    [allDays, weekOffset],
  );

  // Selected day's slots, bucketed by period.
  const selectedDay = useMemo(
    () => allDays.find((d) => d.dateKey === selectedDateKey) ?? null,
    [allDays, selectedDateKey],
  );

  const slotsByPeriod = useMemo(() => {
    const buckets: Record<PeriodKey, { startIsoUtc: string; localTime: string }[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };
    if (!selectedDay) return buckets;
    for (const slot of selectedDay.availableSlots) {
      const period = periodForLocalTime(slot.localTime);
      if (period) buckets[period].push(slot);
    }
    return buckets;
  }, [selectedDay]);

  // Per-render derived-state: when the active period has no slots but
  // another period does, swap to the first non-empty period. Keyed on
  // the selected day's identity so this re-fires when the user picks a
  // different day.
  const [periodSeed, setPeriodSeed] = useState<DayEntry | null>(null);
  if (selectedDay && periodSeed !== selectedDay) {
    setPeriodSeed(selectedDay);
    if (slotsByPeriod[activePeriod]?.length === 0) {
      const nextPeriod = BOOKING_PERIODS.find(
        (p) => slotsByPeriod[p.key].length > 0,
      );
      if (nextPeriod) setActivePeriod(nextPeriod.key);
    }
  }

  const totalAvailableSlots = selectedDay?.availableSlots.length ?? 0;
  const activeSlots = slotsByPeriod[activePeriod] ?? [];

  const continueHref = useMemo(() => {
    if (!selectedSlotIso) return null;
    if (isSignedIn) {
      return buildSignedBookingStubUrl({
        tutorUserId,
        slotIso: selectedSlotIso,
        duration,
      });
    }
    return buildGateSignupUrl({
      tutorUserId,
      slotIso: selectedSlotIso,
      duration,
    });
  }, [selectedSlotIso, isSignedIn, tutorUserId, duration]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-linen-border flex items-start gap-3">
          {profilePhotoUrl ? (
            <img
              src={profilePhotoUrl}
              alt={displayName}
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center text-primary-container font-bold text-lg">
              {displayName.slice(0, 1)}
            </div>
          )}
          <div className="flex-1 text-start">
            <h3
              id="booking-modal-title"
              className="font-display font-bold text-lg text-on-surface leading-tight"
            >
              הזמנת שיעור
            </h3>
            <p className="text-xs text-secondary mt-0.5">{displayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center -mt-1"
          >
            <span className="material-symbols-outlined text-secondary">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-6">
          {/* Duration toggle */}
          {offeredDurations.length > 0 && (
            <div
              role="group"
              aria-label="משך השיעור"
              className={`grid gap-0 bg-surface-container rounded-lg p-1`}
              style={{
                gridTemplateColumns: `repeat(${offeredDurations.length}, minmax(0, 1fr))`,
              }}
            >
              {offeredDurations.map((d) => {
                const isActive = duration === d;
                const price = prices[d];
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    aria-pressed={isActive}
                    className={
                      isActive
                        ? "py-2.5 rounded-md font-bold text-sm bg-white text-primary-container shadow-sm"
                        : "py-2.5 rounded-md font-bold text-sm text-secondary hover:text-primary-container"
                    }
                  >
                    {d} דק׳
                    {price !== null && (
                      <span className="block text-[10px] font-normal text-secondary mt-0.5">
                        {formatIlsCurrency(price)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Week nav + day strip */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                disabled={weekOffset === 0}
                onClick={() => setWeekOffset((v) => Math.max(0, v - 1))}
                aria-label="שבוע קודם"
                className="w-8 h-8 rounded-lg bg-surface-low border border-linen-border hover:bg-surface-container flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {/* In RTL, "previous" arrow visually points right */}
                <span className="material-symbols-outlined text-base">
                  chevron_right
                </span>
              </button>
              <div className="font-display font-bold text-sm text-on-surface">
                {formatWindowLabel(visibleDays)}
              </div>
              <button
                type="button"
                disabled={(weekOffset + 1) * 7 >= allDays.length}
                onClick={() =>
                  setWeekOffset((v) =>
                    (v + 1) * 7 >= allDays.length ? v : v + 1,
                  )
                }
                aria-label="שבוע הבא"
                className="w-8 h-8 rounded-lg bg-surface-low border border-linen-border hover:bg-surface-container flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base">
                  chevron_left
                </span>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {visibleDays.map((day) => {
                const isSelected = day.dateKey === selectedDateKey;
                const isEmpty = day.availableSlots.length === 0;
                const weekdayLabel = formatHebrewWeekday(day.dateObj)
                  .replace("יום ", "")
                  .slice(0, 2);
                const dayNum = day.dateObj.getUTCDate();
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    disabled={isEmpty}
                    onClick={() => {
                      setSelectedDateKey(day.dateKey);
                      setSelectedSlotIso(null);
                    }}
                    aria-pressed={isSelected}
                    className={[
                      "rounded-lg py-2.5 text-center border transition-colors",
                      isSelected
                        ? "bg-primary-container text-on-primary border-primary-container"
                        : isEmpty
                          ? "bg-transparent border-transparent opacity-50 cursor-not-allowed"
                          : "bg-transparent border-transparent hover:bg-surface-low",
                    ].join(" ")}
                  >
                    <div
                      className={
                        isSelected
                          ? "text-[11px] font-bold"
                          : "text-[11px] text-secondary font-bold"
                      }
                    >
                      {weekdayLabel}
                    </div>
                    <div
                      className={
                        isSelected
                          ? "text-lg font-display font-bold"
                          : "text-lg font-display font-bold text-on-surface"
                      }
                    >
                      {dayNum}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-secondary mt-3">
              באזור הזמן שלך, ישראל (GMT+3)
            </p>
          </div>

          {/* Period switcher (single-period view at a time) */}
          {totalAvailableSlots === 0 ? (
            <div className="bg-linen border border-linen-border rounded-xl p-6 text-center">
              <span
                className="material-symbols-outlined text-secondary text-3xl mb-2 inline-block"
                aria-hidden="true"
              >
                event_busy
              </span>
              <p className="text-sm text-on-surface-variant">
                אין זמינות ביום זה
              </p>
              <p className="text-xs text-secondary mt-1">
                בחרו יום אחר בשבוע
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <PeriodPaginator
                  active={activePeriod}
                  onChange={setActivePeriod}
                  slotsByPeriod={slotsByPeriod}
                />
              </div>

              {activeSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {activeSlots.map((slot) => {
                    const isSelected = selectedSlotIso === slot.startIsoUtc;
                    return (
                      <button
                        key={slot.startIsoUtc}
                        type="button"
                        onClick={() => setSelectedSlotIso(slot.startIsoUtc)}
                        aria-pressed={isSelected}
                        className={
                          isSelected
                            ? "border bg-primary-container text-on-primary border-primary-container rounded-lg py-2.5 font-bold text-sm"
                            : "border border-linen-border bg-white rounded-lg py-2.5 font-bold text-sm hover:border-primary-container hover:bg-linen transition-colors"
                        }
                      >
                        {slot.localTime}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-secondary text-center py-4">
                  אין זמינות בתקופה זו
                </p>
              )}
            </div>
          )}

          {bookingToast && (
            <div
              role="status"
              className="bg-primary-fixed/40 border border-primary-fixed rounded-xl p-3 text-sm text-primary-container text-center"
            >
              {bookingToast}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-linen-border bg-white">
          {continueHref && !isSignedIn ? (
            <Link
              href={continueHref}
              className="block w-full bg-primary-container hover:bg-primary text-on-primary font-bold py-3 rounded-xl text-base text-center transition-colors"
            >
              המשך
            </Link>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              disabled={!selectedSlotIso}
              onClick={() => {
                if (!selectedSlotIso) return;
                if (isSignedIn) {
                  // Closed-beta: real booking-confirmation route lands in
                  // Story 4.3. For now, surface a positive ack and keep
                  // the modal open so the student can adjust.
                  setBookingToast("בקרוב — עמוד אישור ההזמנה ייפתח כאן");
                }
              }}
            >
              המשך
            </Button>
          )}
          <p className="text-[10px] text-secondary text-center mt-2">
            לא יבוצע חיוב כרגע — בטא סגורה
          </p>
        </div>
      </div>
    </div>
  );
}

// ----- Period paginator ---------------------------------------------------

interface PeriodPaginatorProps {
  active: PeriodKey;
  onChange: (p: PeriodKey) => void;
  slotsByPeriod: Record<PeriodKey, { startIsoUtc: string; localTime: string }[]>;
}

function PeriodPaginator({
  active,
  onChange,
  slotsByPeriod,
}: PeriodPaginatorProps) {
  const activeDef = BOOKING_PERIODS.find((p) => p.key === active);
  if (!activeDef) return null;

  // Find prev / next period in display order that have at least one slot.
  // If none, fall back to neighbors regardless (so the arrows always work
  // when there's more than one period to cycle through).
  const order = BOOKING_PERIODS.map((p) => p.key);
  const activeIdx = order.indexOf(active);
  const nonEmptyKeys = order.filter((k) => slotsByPeriod[k].length > 0);
  const hasMultiple = nonEmptyKeys.length > 1;

  const stepIdx = (delta: number): PeriodKey => {
    const n = order.length;
    let i = activeIdx;
    for (let step = 0; step < n; step++) {
      i = (i + delta + n) % n;
      if (slotsByPeriod[order[i]!].length > 0) return order[i]!;
    }
    return active;
  };

  return (
    <>
      <button
        type="button"
        disabled={!hasMultiple}
        onClick={() => onChange(stepIdx(-1))}
        aria-label="תקופה קודמת"
        className="w-8 h-8 rounded-lg bg-surface-low border border-linen-border hover:bg-surface-container flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-base">chevron_right</span>
      </button>
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-tertiary-accent text-lg"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          {activeDef.icon}
        </span>
        <h4 className="font-display font-bold text-sm text-on-surface">
          {activeDef.labelHe}
        </h4>
        <span className="text-xs text-secondary">
          ({slotsByPeriod[active].length})
        </span>
      </div>
      <button
        type="button"
        disabled={!hasMultiple}
        onClick={() => onChange(stepIdx(1))}
        aria-label="תקופה הבאה"
        className="w-8 h-8 rounded-lg bg-surface-low border border-linen-border hover:bg-surface-container flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
      </button>
    </>
  );
}

// ----- Window-label helper ------------------------------------------------

function formatWindowLabel(days: DayEntry[]): string {
  if (days.length === 0) return "";
  const first = days[0]!.dateObj;
  const last = days[days.length - 1]!.dateObj;
  const fmt = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jerusalem",
  });
  return `${fmt.format(first)} – ${fmt.format(last)}`;
}
