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

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { checkoutHandoffAction } from "@/lib/booking/handoff-action";
import { formatIlsCurrency } from "@/lib/hebrew/format";
import type { SlotStatesByDay } from "@/lib/availability/compute-slots";
import {
  BOOKING_PERIODS,
  periodForLocalTime,
  type PeriodKey,
} from "./period-helpers";
import { getSundayWeek } from "./sunday-week";

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
  /**
   * Empty-state escape used when the modal is summoned from `/browse`
   * (Story 5.x 2026-05-19). When ALL days in `slotStates` have zero
   * available slots, the footer's "המשך" CTA is replaced with a link to
   * this href ("ראו פרופיל מלא") so the student isn't dead-ended on a
   * modal floating over a tutor list. Unset on the profile-page mount —
   * the sidebar there already disables the CTA when there's no
   * availability, so the modal never opens in that case.
   */
  fallbackProfileHref?: string;
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
  fallbackProfileHref,
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

  const router = useRouter();
  const [handoffPending, startHandoff] = useTransition();

  // "המשך" — hand off to the server action (it signs the slot payload
  // server-side), then do a SOFT navigation to the URL it returns. The soft
  // `router.push` lets the `(.)signup` intercepting route open the anon gate
  // as a modal; signed-in users land on /checkout. The booking modal closes
  // so the two overlays don't stack.
  function handleContinue() {
    if (!selectedSlotIso) return;
    const formData = new FormData();
    formData.set("tutorUserId", tutorUserId);
    formData.set("slotIso", selectedSlotIso);
    formData.set("duration", String(duration));
    startHandoff(async () => {
      const { url } = await checkoutHandoffAction(formData);
      router.push(url);
      onClose();
    });
  }

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

  // Build per-day entries from slotStates (every day in the computed window —
  // typically today + N. Each entry has just the available slots so the
  // period bucketing below stays O(slots) instead of O(all-slots).
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

  // Sunday-aligned week strip (founder direction 2026-05-18). The strip
  // ALWAYS shows Sun→Sat for the current week + paginates 7-at-a-time.
  // Past days within the current week stay visible but disabled — they
  // intentionally have no slots in `allDays` (computeSlotStates filters
  // past) so they read as "אין זמינות" by construction.
  const sundayWeek = useMemo(
    () =>
      getSundayWeek(weekStartUtc, { now: weekStartUtc, weekOffset }),
    [weekStartUtc, weekOffset],
  );
  // Stitch the Sunday-aligned strip with the available-slots data.
  const allDaysByKey = useMemo(() => {
    const map = new Map<string, DayEntry>();
    for (const d of allDays) map.set(d.dateKey, d);
    return map;
  }, [allDays]);

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

  // The 7-day Sun→Sat window for the day strip, decorated with the
  // available-slot count from `allDays`. Days outside the
  // computed-slots horizon (past or far-future) just get an empty
  // availableSlots array and render disabled.
  const visibleDays = useMemo(
    () =>
      sundayWeek.map((sd) => {
        const data = allDaysByKey.get(sd.dateKey);
        return {
          dateKey: sd.dateKey,
          dateObj: sd.date,
          letter: sd.letter,
          dayOfMonth: sd.dayOfMonth,
          isPast: sd.isPast,
          availableSlots: data?.availableSlots ?? [],
        };
      }),
    [sundayWeek, allDaysByKey],
  );

  // Pagination: how many future weeks the slotStates horizon covers.
  // CALENDAR_DAYS_AHEAD on the page is 14, so we have at most 2-3 visible
  // Sun→Sat weeks (depending on what weekday "today" falls on). Keep the
  // limit derived from data, not hard-coded.
  const lastSlotsKey = allDays.length > 0 ? allDays[allDays.length - 1]!.dateKey : null;
  const canPaginateForward =
    lastSlotsKey !== null &&
    visibleDays[6]!.dateKey < lastSlotsKey;

  // Code review 2026-05-19 (F16): when the user clicks "next week", the
  // strip rebases to a new Sun→Sat window — but `selectedDateKey` from the
  // PREVIOUS window stays set, so the period switcher shows "אין זמינות
  // ביום זה" until the user manually picks a day in the new strip.
  // Reseed the selection per-render when the visible window changes and
  // the current selection isn't visible anymore. Keyed on `weekOffset`
  // (identity changes per week-navigate) rather than `visibleDays`
  // (rebuilt every render).
  const [weekOffsetSeed, setWeekOffsetSeed] = useState<number>(weekOffset);
  if (open && weekOffsetSeed !== weekOffset) {
    setWeekOffsetSeed(weekOffset);
    const selectionVisible =
      selectedDateKey !== null &&
      visibleDays.some((d) => d.dateKey === selectedDateKey);
    if (!selectionVisible) {
      const firstAvailable = visibleDays.find(
        (d) => !d.isPast && d.availableSlots.length > 0,
      );
      setSelectedDateKey(
        firstAvailable?.dateKey ??
          visibleDays.find((d) => !d.isPast)?.dateKey ??
          null,
      );
      setSelectedSlotIso(null);
    }
  }

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

  // True when the visible window has no bookable slot anywhere. Two
  // cases satisfy this — both should fall through to the empty-state
  // escape:
  //   (a) `allDays` is populated but every day has zero slots
  //       (recurring rules + bookings happen to fully overlap).
  //   (b) `allDays` is empty — happens when the modal is summoned from
  //       `/browse` and `getTutorBookingContext` returned `null` (tutor
  //       went non-discoverable between listing and click). Without
  //       this branch the modal silently rendered a "המשך" CTA over
  //       an empty calendar — looks broken, says nothing.
  // The profile page itself never hits either case because
  // `BookingSidebar` disables the CTA in the no-availability state
  // and the modal never opens. (Story 5.x R2 2026-05-20.)
  const noAvailabilityAnywhere =
    allDays.length === 0 ||
    allDays.every((d) => d.availableSlots.length === 0);

  // Signing is done in a Server Action (`checkoutHandoffAction`) — NOT
  // here in the client component. `AUTH_SECRET` is not shipped to the
  // client bundle, so client-side `signSlotPayload` would silently fall
  // back to the dev-only secret and produce a sig the server can't
  // verify. The "המשך" button is a form that posts to the action; the
  // action picks the right URL branch (signed-in → /checkout, anon →
  // /signup gate) and `redirect()`s. `isSignedIn` IS still consumed —
  // it drives the "אורח — נדרשת הרשמה קצרה להמשך" subtext under the CTA.

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
            // Explicit width/height to avoid CLS while the presigned R2 URL
            // loads — `Hero.tsx` already does the same for the 96px variant.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profilePhotoUrl}
              alt={displayName}
              width={48}
              height={48}
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
                disabled={!canPaginateForward}
                onClick={() => setWeekOffset((v) => v + 1)}
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
                const isDisabled = day.isPast || isEmpty;
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      setSelectedDateKey(day.dateKey);
                      setSelectedSlotIso(null);
                    }}
                    aria-pressed={isSelected}
                    className={[
                      "rounded-lg py-2.5 text-center border transition-colors",
                      isSelected
                        ? "bg-primary-container text-on-primary border-primary-container"
                        : isDisabled
                          ? "bg-transparent border-transparent opacity-40 cursor-not-allowed"
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
                      {day.letter}&#39;
                    </div>
                    <div
                      className={
                        isSelected
                          ? "text-lg font-display font-bold"
                          : "text-lg font-display font-bold text-on-surface"
                      }
                    >
                      {day.dayOfMonth}
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

        </div>

        {/* Footer — form posts to the Server Action that signs server-side
            and redirects to /checkout (signed-in) or /signup gate (anon).
            Story 5.x escape: if the modal was summoned from `/browse` and
            the tutor has NO availability in the visible window, swap the
            CTA for a "ראו פרופיל מלא" link. The user lands on the profile
            page where the empty state has more recovery surfaces (bio,
            reviews) than a floating modal over a list. */}
        {fallbackProfileHref && noAvailabilityAnywhere ? (
          <div className="p-4 border-t border-linen-border bg-white">
            <Button
              asChild
              variant="primary"
              size="lg"
              fullWidth
            >
              <Link href={fallbackProfileHref}>ראו פרופיל מלא</Link>
            </Button>
            <p className="text-[11px] text-secondary text-center mt-2">
              אין זמינות בשבועיים הקרובים — בקרו בפרופיל לעדכונים
            </p>
          </div>
        ) : (
          <div className="p-4 border-t border-linen-border bg-white">
            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              disabled={!selectedSlotIso || handoffPending}
              loading={handoffPending}
              onClick={handleContinue}
            >
              המשך
            </Button>
            {!isSignedIn && (
              <p className="text-[11px] text-on-surface-variant text-center mt-2">
                אורח — נדרשת הרשמה קצרה להמשך
              </p>
            )}
            <p className="text-[10px] text-secondary text-center mt-2">
              תשלום פיקטיבי — לא יבוצע חיוב כספי בפועל
            </p>
          </div>
        )}
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

function formatWindowLabel(days: ReadonlyArray<{ dateObj: Date }>): string {
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
