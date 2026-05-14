// Pure date-math for the public tutor profile's availability calendar.
//
// Given availability rules + active bookings, computes per-half-hour slot
// states for a date range. NO I/O — fully testable with FakeDate inputs.
// Stories 4.1 (tutor availability editor's own-preview) and 4.3 (booking
// flow's slot picker) reuse this module.
//
// Tz handling: native `Intl.DateTimeFormat` with `timeZone: 'Asia/Jerusalem'`.
// No `date-fns` dependency. The inverse direction (wall-time → UTC instant)
// uses an offset-iteration trick that's exact except across DST boundaries.
// IL DST in 2026: starts 2026-03-27, ends 2026-10-25. Production cuts are
// inside IDT (summer) — tests pick non-boundary dates. The Bagrut launch
// window (Sep 2026) is fully inside IDT.

import type {
  ActiveBookingRow,
  TutorAvailabilityRow,
} from "@/lib/db/queries/tutor-queries";

const TZ = "Asia/Jerusalem" as const;

export interface SlotStateInput {
  availability: TutorAvailabilityRow[];
  bookings: ActiveBookingRow[];
  from: Date; // UTC instant — should be "midnight in Asia/Jerusalem" of the first day
  daysAhead: number;
  durationMinutes: 45 | 60;
  /** "Now" reference. Explicit input keeps this module deterministic. */
  now: Date;
  /** Slot grid bounds in Asia/Jerusalem local wall time. */
  startHour?: number;
  endHour?: number;
}

export interface SlotState {
  /** UTC instant when the slot starts. ISO 8601 string. */
  startIsoUtc: string;
  /** Wall time in Asia/Jerusalem — "HH:MM" 24h. */
  localTime: string;
  status: "available" | "booked" | "unavailable";
}

/** Keyed by `YYYY-MM-DD` (date in Asia/Jerusalem). */
export type SlotStatesByDay = Map<string, SlotState[]>;

// ---------------------------------------------------------------------------
// Native Intl-based TZ helpers — no external deps.
// ---------------------------------------------------------------------------

interface JerusalemWallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday, 6 = Saturday (matches Postgres EXTRACT(DOW))
}

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
});

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getJerusalemWallTime(utc: Date): JerusalemWallTime {
  const parts = PARTS_FORMATTER.formatToParts(utc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  // Intl's en-US with hour12: false returns "24" for midnight; normalize to 0.
  if (hour === 24) hour = 0;
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour,
    minute: parseInt(get("minute"), 10),
    weekday: WEEKDAY_MAP[get("weekday")] ?? 0,
  };
}

/**
 * Convert a wall-time tuple in Asia/Jerusalem to the UTC instant it represents.
 *
 * Approach: start from `Date.UTC(...)` of the same field values (the "naive"
 * instant), then compute the IL offset around that instant, then shift.
 * Exact for any wall time outside DST-boundary days. Tests must use
 * non-boundary dates.
 */
export function jerusalemWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const ilHourAtNaive = getJerusalemWallTime(naive);
  // The offset is whatever shift the naive instant would need so that its
  // IL projection lands at the desired wall time.
  const naiveIlMinutes = ilHourAtNaive.hour * 60 + ilHourAtNaive.minute;
  const desiredIlMinutes = hour * 60 + minute;
  // Compute signed minute diff with day-wrap awareness.
  let diffMinutes = naiveIlMinutes - desiredIlMinutes;
  if (diffMinutes > 12 * 60) diffMinutes -= 24 * 60;
  if (diffMinutes < -12 * 60) diffMinutes += 24 * 60;
  return new Date(naive.getTime() - diffMinutes * 60 * 1000);
}

/** Return YYYY-MM-DD for the Asia/Jerusalem date of `utc`. */
function jerusalemDateKey(utc: Date): string {
  const w = getJerusalemWallTime(utc);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** Return "HH:MM" wall-time in Asia/Jerusalem for `utc`. */
function jerusalemTimeKey(utc: Date): string {
  const w = getJerusalemWallTime(utc);
  return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Algorithm.
// ---------------------------------------------------------------------------

/**
 * Parses "HH:MM" or "HH:MM:SS" wall-time strings to minutes since midnight.
 * Drizzle's `time` columns serialise as "HH:MM:SS" by default.
 */
function parseTimeStrToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  return parseInt(parts[0]!, 10) * 60 + parseInt(parts[1]!, 10);
}


function rowIsValidOnDate(
  row: TutorAvailabilityRow,
  dateKey: string,
): boolean {
  if (row.validFrom && dateKey < row.validFrom) return false;
  if (row.validUntil && dateKey > row.validUntil) return false;
  return true;
}

function timeRangeCovers(
  ruleStart: string,
  ruleEnd: string,
  slotStart: string,
  durationMinutes: number,
): boolean {
  const ruleStartMin = parseTimeStrToMinutes(ruleStart);
  const ruleEndMin = parseTimeStrToMinutes(ruleEnd);
  const slotStartMin = parseTimeStrToMinutes(slotStart);
  const slotEndMin = slotStartMin + durationMinutes;
  return slotStartMin >= ruleStartMin && slotEndMin <= ruleEndMin;
}

function timeRangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondDurationMinutes: number,
): boolean {
  const firstStartMin = parseTimeStrToMinutes(firstStart);
  const firstEndMin = parseTimeStrToMinutes(firstEnd);
  const secondStartMin = parseTimeStrToMinutes(secondStart);
  const secondEndMin = secondStartMin + secondDurationMinutes;
  return firstStartMin < secondEndMin && secondStartMin < firstEndMin;
}

function bookingOverlapsSlot(
  booking: ActiveBookingRow,
  slotStartUtc: Date,
  durationMinutes: 45 | 60,
): boolean {
  const slotStartMs = slotStartUtc.getTime();
  const slotEndMs = slotStartMs + durationMinutes * 60 * 1000;
  const bookingStartMs = booking.startsAt.getTime();
  const bookingEndMs = bookingStartMs + booking.durationMinutes * 60 * 1000;
  return bookingStartMs < slotEndMs && slotStartMs < bookingEndMs;
}

export function computeSlotStates(input: SlotStateInput): SlotStatesByDay {
  const startHour = input.startHour ?? 14;
  const endHour = input.endHour ?? 22; // 22:00 exclusive → last slot is 21:30
  const slotsPerDay = (endHour - startHour) * 2;
  const nowMs = input.now.getTime();

  const out: SlotStatesByDay = new Map();

  // Pre-bucket availability rules by kind for tighter per-slot loops.
  const recurring = input.availability.filter((r) => r.kind === "recurring");
  const exceptionBlocked = input.availability.filter(
    (r) => r.kind === "exception_blocked",
  );
  const exceptionAvailable = input.availability.filter(
    (r) => r.kind === "exception_available",
  );

  // Walk days based on the IL date of `from`, not UTC days.
  const firstDay = getJerusalemWallTime(input.from);
  for (let dayOffset = 0; dayOffset < input.daysAhead; dayOffset++) {
    // Build the IL date N days from firstDay by constructing a wall-time
    // midnight on (firstDay + dayOffset) and converting to UTC.
    const dayMidnightUtc = jerusalemWallTimeToUtc(
      firstDay.year,
      firstDay.month,
      firstDay.day + dayOffset, // Date constructor handles month overflow
      0,
      0,
    );
    const dayKey = jerusalemDateKey(dayMidnightUtc);
    const dayWeekday = getJerusalemWallTime(dayMidnightUtc).weekday;

    const slotsForDay: SlotState[] = [];

    for (let slotIdx = 0; slotIdx < slotsPerDay; slotIdx++) {
      const slotHour = startHour + Math.floor(slotIdx / 2);
      const slotMinute = slotIdx % 2 === 0 ? 0 : 30;
      const slotStartUtc = jerusalemWallTimeToUtc(
        firstDay.year,
        firstDay.month,
        firstDay.day + dayOffset,
        slotHour,
        slotMinute,
      );
      const localTime = jerusalemTimeKey(slotStartUtc);
      const slotTimeStr = `${String(slotHour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}:00`;

      // Past-slot guard — overrides everything. A slot whose start instant
      // is before `now` is unbookable; surface as `"unavailable"` so the
      // calendar UI does not render it as a clickable link.
      const slotStartMs = slotStartUtc.getTime();
      if (slotStartMs < nowMs) {
        slotsForDay.push({
          startIsoUtc: slotStartUtc.toISOString(),
          localTime,
          status: "unavailable",
        });
        continue;
      }

      // Booked check next — overrides recurring/exception state but NOT past.
      // Compare full intervals, not just exact half-hour starts: a requested
      // 60-minute slot at 14:00 overlaps an existing 14:30 booking and must
      // not remain clickable.
      if (
        input.bookings.some((booking) =>
          bookingOverlapsSlot(booking, slotStartUtc, input.durationMinutes),
        )
      ) {
        slotsForDay.push({
          startIsoUtc: slotStartUtc.toISOString(),
          localTime,
          status: "booked",
        });
        continue;
      }

      // Is there a base recurring rule covering this slot?
      const recurringMatch = recurring.find(
        (r) =>
          r.weekday === dayWeekday &&
          rowIsValidOnDate(r, dayKey) &&
          timeRangeCovers(
            r.startTime,
            r.endTime,
            slotTimeStr,
            input.durationMinutes,
          ),
      );

      // Is the slot blocked by an exception_blocked?
      const isBlocked = exceptionBlocked.some(
        (r) =>
          r.date === dayKey &&
          rowIsValidOnDate(r, dayKey) &&
          timeRangesOverlap(
            r.startTime,
            r.endTime,
            slotTimeStr,
            input.durationMinutes,
          ),
      );

      // Is there an exception_available covering it?
      const exceptionAvailMatch = exceptionAvailable.find(
        (r) =>
          r.date === dayKey &&
          rowIsValidOnDate(r, dayKey) &&
          timeRangeCovers(
            r.startTime,
            r.endTime,
            slotTimeStr,
            input.durationMinutes,
          ),
      );

      let status: SlotState["status"];
      if (isBlocked) {
        status = "unavailable";
      } else if (recurringMatch) {
        status = "available";
      } else if (exceptionAvailMatch) {
        status = "available";
      } else {
        status = "unavailable";
      }

      slotsForDay.push({
        startIsoUtc: slotStartUtc.toISOString(),
        localTime,
        status,
      });
    }

    out.set(dayKey, slotsForDay);
  }

  return out;
}

/**
 * Convenience: returns the UTC instant of "midnight today in Asia/Jerusalem"
 * starting from a `now` reference. Use for `SlotStateInput.from`.
 */
export function startOfTodayJerusalem(now: Date): Date {
  const w = getJerusalemWallTime(now);
  return jerusalemWallTimeToUtc(w.year, w.month, w.day, 0, 0);
}
