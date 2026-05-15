// Time-of-day-aware Hebrew greeting for the student dashboard. Pure helper —
// accepts `now` as input (not Date.now()) so tests are deterministic.
//
// Windows (Asia/Jerusalem local hour, 24h):
//   05:00–11:59 → "בוקר טוב"
//   12:00–16:59 → "צהריים טובים"
//   17:00–21:59 → "ערב טוב"
//   22:00–04:59 → "לילה טוב"
//
// `displayName` first-word convention matches src/app/tutor/[slug]/page.tsx:301.

const DEFAULT_TZ = "Asia/Jerusalem";

function extractHourInTz(now: Date, tz: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  });
  // formatter.format(now) returns e.g. "08" or "23". Some Node versions emit
  // "24" for 00:00; coerce via mod 24.
  return Number(formatter.format(now)) % 24;
}

function timeOfDayGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "בוקר טוב";
  if (hour >= 12 && hour < 17) return "צהריים טובים";
  if (hour >= 17 && hour < 22) return "ערב טוב";
  return "לילה טוב";
}

function firstWord(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "";
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

export function getHebrewGreeting(
  now: Date,
  displayName: string | null,
  tz: string = DEFAULT_TZ,
): string {
  const base = timeOfDayGreeting(extractHourInTz(now, tz));
  if (!displayName) return base;
  const name = firstWord(displayName);
  if (!name) return base;
  return `${base}, ${name}`;
}
