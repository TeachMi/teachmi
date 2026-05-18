// Read-only unfold helper for the "היומן שלי" (My Calendar) tab — Winston's
// Option (a) from the roundtable 2026-05-18. We do NOT materialize concrete
// per-date rows in the DB; instead, given a date range, we fold the
// tutor's recurring rules onto each date in the range and overlay any
// `exception_*` rows on top. Single source of truth = the `tutor_availability`
// table; the unfold is computed at read time.
//
// SLOT-STATE TYPED UNION (Winston's "poison-pill" guard for Story 4):
// the return shape is a discriminated union with a `booked` variant
// that's never populated today. When the booking flow ships (Story 4.x)
// and consumes specific date-time slots, adding `booked` to the unfold
// becomes a backwards-compatible additive change rather than a rewrite
// of every consumer.

import {
  SCHEDULE_GRID,
  SLOTS_PER_DAY,
  slotTimes,
} from "./schedule-flow";

/** Discriminated union — `kind` is the tag. */
export type SlotState =
  | { kind: "available"; source: "recurring" | "exception_available" }
  | { kind: "blocked"; source: "exception_blocked" }
  // Reserved for Story 4 (booking flow). Never produced today; consumers
  // SHOULD already handle this branch defensively so adoption is additive.
  | { kind: "booked"; bookingId: string };

/** "YYYY-MM-DD" → slot-state map, keyed by slot index. */
export type SlotStateByIdx = Map<number, SlotState>;

/** Date-keyed map of slot-state-by-index. */
export type UnfoldedSchedule = Map<string, SlotStateByIdx>;

/** Inputs the unfold needs — typically built once at the page level. */
export interface UnfoldInput {
  recurringRules: Array<{
    weekday: number;
    startTime: string; // "HH:MM:SS"
    endTime: string;
  }>;
  exceptionRules: Array<{
    kind: "exception_blocked" | "exception_available";
    date: string; // "YYYY-MM-DD"
    startTime: string;
    endTime: string;
  }>;
  /** Inclusive IL-date range (YYYY-MM-DD strings). */
  dateRange: { from: string; to: string };
}

// --- IL-date helpers ------------------------------------------------------

/**
 * Parse "YYYY-MM-DD" → Date at UTC midnight of that calendar day.
 *
 * Why NOT `+03:00`: parsing as IL-midnight produces a UTC instant on the
 * PRIOR UTC calendar day (e.g. "2026-05-18T00:00:00+03:00" = May 17
 * 21:00 UTC). Subsequent `getUTCDay()` then returns the wrong weekday.
 * The unfold only needs the date *components* (year/month/day) to derive
 * weekday and iterate; the timezone is irrelevant. UTC midnight keeps
 * `getUTCDay()` aligned with the date-string's day component.
 */
function parseIlDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function formatIlDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function weekdayOfIlDate(iso: string): number {
  return parseIlDate(iso).getUTCDay(); // 0=Sun..6=Sat
}

/** Inclusive iterator over IL dates from `from` to `to`. */
function* iterIlDates(from: string, to: string): Generator<string> {
  const start = parseIlDate(from);
  const end = parseIlDate(to);
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    yield formatIlDate(d);
  }
}

/** "HH:MM:SS" → slot index within the grid window; -1 if outside. */
function slotIndexFromTime(startTime: string): number {
  const [hh, mm] = startTime.split(":").map((v) => parseInt(v, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
  const offset = hh * 60 + mm - SCHEDULE_GRID.START_HOUR * 60;
  if (offset < 0 || offset % SCHEDULE_GRID.SLOT_MINUTES !== 0) return -1;
  const idx = offset / SCHEDULE_GRID.SLOT_MINUTES;
  return idx >= 0 && idx < SLOTS_PER_DAY ? idx : -1;
}

// --- Unfold ---------------------------------------------------------------

/**
 * Build the full date→slot-state map for the given range. Pure function —
 * call site provides the rules + range, gets the unfolded schedule back.
 */
export function unfoldAvailability(input: UnfoldInput): UnfoldedSchedule {
  const result: UnfoldedSchedule = new Map();

  // Step 1 — for every date in the range, seed an empty map then apply
  // recurring rules matching the date's weekday.
  for (const dateIso of iterIlDates(input.dateRange.from, input.dateRange.to)) {
    const byIdx: SlotStateByIdx = new Map();
    const weekday = weekdayOfIlDate(dateIso);
    for (const rule of input.recurringRules) {
      if (rule.weekday !== weekday) continue;
      const idx = slotIndexFromTime(rule.startTime);
      if (idx === -1) continue;
      byIdx.set(idx, { kind: "available", source: "recurring" });
    }
    result.set(dateIso, byIdx);
  }

  // Step 2 — overlay exceptions. `exception_available` adds availability,
  // `exception_blocked` removes it (or marks as blocked on what would
  // otherwise be recurring-available).
  for (const ex of input.exceptionRules) {
    const dayMap = result.get(ex.date);
    if (!dayMap) continue;
    const idx = slotIndexFromTime(ex.startTime);
    if (idx === -1) continue;
    if (ex.kind === "exception_available") {
      dayMap.set(idx, { kind: "available", source: "exception_available" });
    } else {
      dayMap.set(idx, { kind: "blocked", source: "exception_blocked" });
    }
  }

  return result;
}

/** Today in Asia/Jerusalem as YYYY-MM-DD. */
export function todayIsoIl(): string {
  return formatIlDate(new Date());
}

/**
 * Start-of-Sunday-week for an IL date (Israeli week starts Sunday, weekday=0).
 * Used by the CalendarTab to compute the Sunday→Saturday range of "the
 * current week" when rendering the rolling 4-week view.
 */
export function startOfWeekIl(dateIso: string): string {
  const d = parseIlDate(dateIso);
  const weekday = d.getUTCDay(); // 0=Sun
  d.setUTCDate(d.getUTCDate() - weekday);
  return formatIlDate(d);
}

/** Add N days to an IL-date YYYY-MM-DD. */
export function addDaysIl(dateIso: string, n: number): string {
  const d = parseIlDate(dateIso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatIlDate(d);
}

/** Pretty "17 May" for display headers. */
export function formatIlDayLabel(dateIso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "short",
  }).format(parseIlDate(dateIso));
}

/** Helper for rendering — the slot's time string ("14:00") for the grid axis. */
export function slotTimeLabel(slotIdx: number): string {
  return slotTimes(slotIdx).startTime.slice(0, 5);
}
