// Read-only unfold helper for the "היומן שלי" (My Calendar) tab — Winston's
// Option (a) from the roundtable 2026-05-18. We do NOT materialize concrete
// per-date rows in the DB; instead, given a date range, we fold the
// tutor's recurring rules onto each date in the range and overlay any
// `exception_*` rows on top. Single source of truth = the `tutor_availability`
// table; the unfold is computed at read time.
//
// SLOT-STATE TYPED UNION (Winston's "poison-pill" guard for Story 4):
// the return shape is a discriminated union with a `booked` variant.
// As of Area 1 (2026-05-19) the booked branch IS emitted when callers
// pass `bookings` to the unfold. Consumers that don't need booked
// overlay simply omit the `bookings` field — backwards compatible.
//
// RULE/REALITY SPLIT (founder direction, party-mode 2026-05-19): the
// recurring grid (Tab 1) is pure rule/template and never reflects
// bookings. Only the 4-week calendar (Tab 2) overlays bookings. This
// helper supports both — the Tab 1 caller doesn't pass `bookings` and
// gets the booking-blind unfold; Tab 2 passes bookings and gets the
// booked variant emitted for any cell a booking covers.

import {
  SCHEDULE_GRID,
  SLOTS_PER_DAY,
  slotTimes,
} from "./schedule-flow";

/** Discriminated union — `kind` is the tag. */
export type SlotState =
  | { kind: "available"; source: "recurring" | "exception_available" }
  | { kind: "blocked"; source: "exception_blocked" }
  // Emitted by `unfoldAvailability` when the caller passes `bookings` in
  // its input AND the cell is covered by at least one active booking.
  // The discriminator only carries the bookingId — the renderer is
  // expected to look up the rich display info (student name, subject,
  // etc.) from the same bookings array it passed in.
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
  /**
   * Optional. Active bookings (status pending_payment | confirmed) that
   * the unfold should overlay as `booked` slots. Each booking covers
   * every 30-min slot it overlaps — a 60-min booking marks 2 cells, a
   * 45-min booking marks 2 cells (the second is partially-covered but
   * displayed as booked for clarity), a 90-min booking marks 3 cells.
   *
   * The `booked` overlay wins over both `available` AND `blocked` — a
   * confirmed lesson is a fact, not subject to availability rules. Orphan
   * bookings (sitting outside the current rule per the orphan-and-leave
   * decision) therefore render correctly even on cells the rule grid
   * would otherwise show as "not available".
   */
  bookings?: Array<{
    id: string;
    startsAt: Date;
    durationMinutes: number;
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

const IL_DATE_PARTS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Convert a UTC `Date` to its Asia/Jerusalem (IL-local) date string +
 * minutes-since-midnight. Booking overlays use this to pick the cell — a
 * lesson at 14:00 IL time on Tuesday lands on Tuesday's 14:00 slot
 * regardless of DST or UTC offset.
 */
function ilDateAndMinutesFromUtc(d: Date): {
  dateIso: string;
  minutesOfDay: number;
} {
  const parts = IL_DATE_PARTS_FMT.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = parseInt(get("hour"), 10);
  // en-CA `hour: '2-digit', hour12: false` returns "24" at midnight in some
  // engines. Normalize to "00" for date alignment.
  if (hour === 24) hour = 0;
  const minute = parseInt(get("minute"), 10);
  return {
    dateIso: `${year}-${month}-${day}`,
    minutesOfDay: hour * 60 + minute,
  };
}

/**
 * Translate a booking's IL-local minutes-of-day + duration → the range of
 * slot indices it covers. Returns `[startIdx, endIdxExclusive)`. Returns
 * an empty range when the booking falls entirely outside the grid window.
 *
 * "Covers" semantics: every 30-min slot the booking overlaps is included,
 * even partial overlaps (e.g. a 45-min lesson from 14:00 covers both
 * 14:00 and 14:30 slots — the second is only half-occupied but visually
 * marked as booked so the cell isn't claimed as "available").
 */
function bookingSlotRange(
  minutesOfDay: number,
  durationMinutes: number,
): { startIdx: number; endIdx: number } {
  const gridStartMin = SCHEDULE_GRID.START_HOUR * 60;
  const gridEndMin = SCHEDULE_GRID.END_HOUR * 60;
  const slotMin = SCHEDULE_GRID.SLOT_MINUTES;

  const startOffset = minutesOfDay - gridStartMin;
  const endOffset = minutesOfDay + durationMinutes - gridStartMin;

  // Booking entirely outside the rendered window.
  if (
    minutesOfDay + durationMinutes <= gridStartMin ||
    minutesOfDay >= gridEndMin
  ) {
    return { startIdx: 0, endIdx: 0 };
  }

  const startIdx = Math.max(0, Math.floor(startOffset / slotMin));
  // endIdx is exclusive — Math.ceil covers any partial-slot overlap at the tail.
  const endIdx = Math.min(SLOTS_PER_DAY, Math.ceil(endOffset / slotMin));
  return { startIdx, endIdx };
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

  // Step 3 — overlay active bookings as `booked`. A booking wins over
  // anything underneath: the cell is a fact, not subject to rule
  // negotiation. Orphan bookings (sitting on cells the rule grid now
  // shows as not-available) still render correctly because of this
  // ordering.
  if (input.bookings && input.bookings.length > 0) {
    for (const booking of input.bookings) {
      const { dateIso, minutesOfDay } = ilDateAndMinutesFromUtc(booking.startsAt);
      const dayMap = result.get(dateIso);
      if (!dayMap) continue;
      const { startIdx, endIdx } = bookingSlotRange(
        minutesOfDay,
        booking.durationMinutes,
      );
      for (let idx = startIdx; idx < endIdx; idx++) {
        dayMap.set(idx, { kind: "booked", bookingId: booking.id });
      }
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
