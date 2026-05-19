// Period helpers for the public booking modal.
//
// The tutor-side editor (`/tutor/me/schedule`) divides the day into 4
// periods over the SCHEDULE_GRID 08:00–23:00 window. The student-facing
// booking modal mirrors those four periods but uses clock-hour ranges
// (not slot-index ranges) because the modal renders time chips, not a
// grid. The two definitions are intentionally separate — keeping the
// editor's slot-index math out of the public surface keeps each side
// readable on its own terms.
//
// The four periods, in display order (top → bottom in modal scroll):
//   בוקר      08:00–12:00
//   צהריים   12:00–17:00
//   ערב       17:00–21:00
//   לילה     21:00–23:00
//
// These four collectively cover the full 08:00–23:00 SCHEDULE_GRID window.
// Times outside that window aren't bookable on the public surface.

export type PeriodKey = "morning" | "afternoon" | "evening" | "night";

export interface PeriodDef {
  key: PeriodKey;
  labelHe: string;
  /** Inclusive start hour (24h, Asia/Jerusalem). */
  startHour: number;
  /** Exclusive end hour. */
  endHour: number;
  /** Material Symbols icon name. */
  icon: string;
}

export const BOOKING_PERIODS: readonly PeriodDef[] = [
  { key: "morning", labelHe: "בוקר", startHour: 8, endHour: 12, icon: "wb_twilight" },
  { key: "afternoon", labelHe: "צהריים", startHour: 12, endHour: 17, icon: "wb_sunny" },
  { key: "evening", labelHe: "ערב", startHour: 17, endHour: 21, icon: "wb_twilight" },
  { key: "night", labelHe: "לילה", startHour: 21, endHour: 23, icon: "bedtime" },
] as const;

/**
 * Return the period a given "HH:MM" local wall-time falls into, or `null`
 * if it sits outside the 08:00–23:00 booking window.
 */
export function periodForLocalTime(localTime: string): PeriodKey | null {
  const colonIdx = localTime.indexOf(":");
  if (colonIdx === -1) return null;
  const hour = parseInt(localTime.slice(0, colonIdx), 10);
  if (Number.isNaN(hour)) return null;
  for (const period of BOOKING_PERIODS) {
    if (hour >= period.startHour && hour < period.endHour) return period.key;
  }
  return null;
}
