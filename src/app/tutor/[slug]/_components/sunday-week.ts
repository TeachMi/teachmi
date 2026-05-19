// Sunday-first week math for the public BookingModal day strip.
// Story 4.3 (founder direction 2026-05-18).
//
// Israeli convention is Sun→Sat. The previous "today + 6" rolling window
// (Sally's Preply-aligned default) was overruled — students expect a
// week-aligned strip with past days disabled, not a rolling cursor.
//
// Pure date-math helper. No React. No availability data — the modal
// composes per-day available slots on top of the array this returns.
//
// Tz handling: we project the input `anchor` into Asia/Jerusalem local
// time to find the most-recent Sunday in IL, then compute 7 IL dates
// starting from that Sunday. Each `Date` returned points at the UTC
// instant that corresponds to IL midnight on that day — the same
// convention `computeSlotStates` uses for its `from` parameter, so
// keying lookups by `getUTCDate` etc. against the SlotStatesByDay Map
// stays consistent.

import {
  getJerusalemWallTime,
  jerusalemWallTimeToUtc,
} from "@/lib/availability/compute-slots";

export interface SundayWeekDay {
  /** UTC instant of IL midnight on this day. */
  date: Date;
  /** `YYYY-MM-DD` (IL local date). Matches SlotStatesByDay keys. */
  dateKey: string;
  /** Hebrew single-letter weekday (א/ב/ג/ד/ה/ו/ש). */
  letter: string;
  /** Day-of-month (1..31). */
  dayOfMonth: number;
  /** `true` when this day is strictly before `now`'s IL date. */
  isPast: boolean;
}

/** Sun → Sat. Index = `getUTCDay()` after projecting into IL midnight. */
export const HEBREW_WEEKDAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;

/**
 * Returns 7 days starting at the most-recent Sunday at or before `anchor`,
 * in Asia/Jerusalem.
 *
 * Past days (strictly before `now`'s IL date) are flagged via `isPast` so
 * the modal can disable them visually without hiding them.
 *
 * `weekOffset` shifts the window by 7-day increments (0 = the week
 * containing `anchor`; 1 = the following Sun→Sat week; etc.).
 */
export function getSundayWeek(
  anchor: Date,
  options: { now?: Date; weekOffset?: number } = {},
): SundayWeekDay[] {
  const now = options.now ?? anchor;
  const weekOffset = options.weekOffset ?? 0;

  // Project anchor into IL wall-time to discover its weekday + date.
  const anchorIL = getJerusalemWallTime(anchor);
  // Sunday = 0 in our convention. `weekday - 0` is the days-since-Sunday count.
  const daysSinceSunday = anchorIL.weekday;
  // Shift to Sunday, then add 7*weekOffset for pagination.
  const sundayDayShift = -daysSinceSunday + weekOffset * 7;

  const out: SundayWeekDay[] = [];
  // Today (in IL) for the isPast comparison.
  const todayIL = getJerusalemWallTime(now);
  const todayKey = formatDateKey(todayIL.year, todayIL.month, todayIL.day);

  for (let i = 0; i < 7; i++) {
    const offset = sundayDayShift + i;
    const utc = jerusalemWallTimeToUtc(
      anchorIL.year,
      anchorIL.month,
      anchorIL.day + offset, // JS Date math handles month/year overflow
      0,
      0,
    );
    const w = getJerusalemWallTime(utc);
    const dateKey = formatDateKey(w.year, w.month, w.day);
    // `w.weekday` should equal `i` since we built from Sunday — but tz
    // arithmetic across DST has rare edge cases. Trust `i` for the
    // letter index (we know what we asked for); fall back to weekday if
    // the table somehow disagreed.
    const letterIdx = i >= 0 && i < 7 ? i : w.weekday;
    out.push({
      date: utc,
      dateKey,
      letter: HEBREW_WEEKDAY_LETTERS[letterIdx]!,
      dayOfMonth: w.day,
      isPast: dateKey < todayKey,
    });
  }
  return out;
}

function formatDateKey(year: number, month: number, day: number): string {
  // Normalize via Date.UTC so day overflow (e.g. 32) wraps to next month
  // correctly. The `getJerusalemWallTime` round-trip already did this
  // for the actual returned days, but the comparison key for `today`
  // needs to match the same format.
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return `${normalized.getUTCFullYear()}-${String(normalized.getUTCMonth() + 1).padStart(2, "0")}-${String(normalized.getUTCDate()).padStart(2, "0")}`;
}
