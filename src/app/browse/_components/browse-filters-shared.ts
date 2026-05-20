// Filter taxonomy + URL-param helpers for `/browse`. Lives in its own
// module (no `"use client"`) so the server page (`page.tsx`) and the
// client filter bar (`BrowseFiltersBar.tsx`) can both import it without
// crossing the server/client boundary.

export const PRICE_BUCKETS = [
  { key: "any", labelHe: "כל הטווחים", min: null, max: null },
  { key: "under-100", labelHe: "עד ₪100", min: null, max: 99 },
  { key: "100-150", labelHe: "₪100–₪150", min: 100, max: 150 },
  { key: "150-200", labelHe: "₪150–₪200", min: 151, max: 200 },
  { key: "200-plus", labelHe: "₪200 ומעלה", min: 201, max: null },
] as const;

export type PriceBucketKey = (typeof PRICE_BUCKETS)[number]["key"];

export function getPriceBucketBounds(
  key: string | undefined,
): { min: number | undefined; max: number | undefined } {
  const bucket = PRICE_BUCKETS.find((b) => b.key === key);
  if (!bucket) return { min: undefined, max: undefined };
  return {
    min: bucket.min ?? undefined,
    max: bucket.max ?? undefined,
  };
}

export const SORT_OPTIONS = [
  { key: "recent", labelHe: "חדשים" },
  { key: "rating", labelHe: "דירוג" },
  { key: "price_asc", labelHe: "מחיר נמוך לגבוה" },
  { key: "price_desc", labelHe: "מחיר גבוה לנמוך" },
] as const;

// ----- Lesson length filter (Story 5.x R3 2026-05-20) --------------------
//
// The four canonical lesson lengths the marketplace supports. Each tutor
// MAY price any subset (one row per length on `tutor_profiles`). The
// filter narrows results to tutors who priced that length, and the row
// card surfaces THAT length's price (instead of the 60-min anchor).

export type LessonLengthMinutes = 45 | 60 | 75 | 90;

export const LESSON_LENGTH_OPTIONS = [
  { key: "all", labelHe: "הכל", minutes: null as LessonLengthMinutes | null },
  { key: "45", labelHe: "45 דק׳", minutes: 45 as LessonLengthMinutes },
  { key: "60", labelHe: "60 דק׳", minutes: 60 as LessonLengthMinutes },
  { key: "75", labelHe: "75 דק׳", minutes: 75 as LessonLengthMinutes },
  { key: "90", labelHe: "90 דק׳", minutes: 90 as LessonLengthMinutes },
] as const;

/**
 * Translate a `?length=45` URL value to the canonical minute number,
 * or `null` for "all" / unknown / missing.
 */
export function parseLessonLength(
  raw: string | undefined,
): LessonLengthMinutes | null {
  if (!raw || raw === "all") return null;
  const n = Number(raw);
  if (n === 45 || n === 60 || n === 75 || n === 90) return n;
  return null;
}

// ----- Time filter (Story 5.x R2 2026-05-20) -----------------------------
//
// 8 fixed 3-hour buckets covering the full day. Persisted in URL as
// `?times=09-12,15-18` (the bucket key IS its hour range — self-documenting).
// Wire-format start/end are 24h "HH:MM" strings, matching how
// `tutor_availability.start_time`/`end_time` come back from the DB.

export interface TimeBucket {
  /** URL-param value AND chip label tail. */
  key: string;
  /** Hebrew chip label (icon comes from the bucket's section). */
  labelHe: string;
  /** Inclusive lower bound, "HH:MM:SS". */
  startTime: string;
  /** Exclusive upper bound, "HH:MM:SS". */
  endTime: string;
}

export interface TimeSection {
  /** Hebrew heading shown above the section's chips in the popover. */
  headingHe: string;
  /** Material Symbols icon name shown on each chip in this section. */
  icon: string;
  /** Whether the icon is the "filled" variant (FILL=1). */
  iconFilled: boolean;
  buckets: TimeBucket[];
}

export const TIME_SECTIONS: readonly TimeSection[] = [
  {
    headingHe: "בוקר",
    icon: "wb_twilight",
    iconFilled: false,
    buckets: [
      { key: "06-09", labelHe: "6:00–9:00", startTime: "06:00:00", endTime: "09:00:00" },
      { key: "09-12", labelHe: "9:00–12:00", startTime: "09:00:00", endTime: "12:00:00" },
    ],
  },
  {
    headingHe: "צהריים",
    icon: "wb_sunny",
    iconFilled: false,
    buckets: [
      { key: "12-15", labelHe: "12:00–15:00", startTime: "12:00:00", endTime: "15:00:00" },
      { key: "15-18", labelHe: "15:00–18:00", startTime: "15:00:00", endTime: "18:00:00" },
    ],
  },
  {
    headingHe: "ערב ולילה",
    icon: "bedtime",
    iconFilled: true,
    buckets: [
      { key: "18-21", labelHe: "18:00–21:00", startTime: "18:00:00", endTime: "21:00:00" },
      // `endTime` capped at 23:59:59 — `tutor_availability` rows are
      // wall-clock `time` columns, never wrap midnight, and the
      // `ck_tutor_availability_time_order` check enforces `start < end`.
      // Storing literal "24:00:00" parses but doesn't survive a round
      // trip if anyone ever inserts a rule with this exact bucket as
      // end_time.
      { key: "21-24", labelHe: "21:00–24:00", startTime: "21:00:00", endTime: "23:59:59" },
      { key: "00-03", labelHe: "00:00–03:00", startTime: "00:00:00", endTime: "03:00:00" },
      { key: "03-06", labelHe: "03:00–06:00", startTime: "03:00:00", endTime: "06:00:00" },
    ],
  },
] as const;

export const TIME_BUCKETS: readonly TimeBucket[] = TIME_SECTIONS.flatMap(
  (s) => s.buckets,
);

const TIME_BUCKET_BY_KEY: ReadonlyMap<string, TimeBucket> = new Map(
  TIME_BUCKETS.map((b) => [b.key, b]),
);

export function getTimeBucket(key: string): TimeBucket | undefined {
  return TIME_BUCKET_BY_KEY.get(key);
}

/** Parse `?times=09-12,15-18` into known buckets, dropping garbage values. */
export function parseTimeBuckets(raw: string | undefined): TimeBucket[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: TimeBucket[] = [];
  for (const part of raw.split(",")) {
    const key = part.trim();
    if (!key || seen.has(key)) continue;
    const bucket = TIME_BUCKET_BY_KEY.get(key);
    if (!bucket) continue;
    seen.add(key);
    out.push(bucket);
  }
  return out;
}

// ----- Day filter --------------------------------------------------------

export interface DayOfWeek {
  /** 0=Sunday … 6=Saturday — matches `tutor_availability.weekday`. */
  index: number;
  /** URL-param value (3-letter slug). */
  key: string;
  /** Hebrew chip label (single Hebrew letter — same as the BookingModal day strip). */
  labelHe: string;
  /** Full Hebrew name for SR text + tooltips. */
  fullLabelHe: string;
}

export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  { index: 0, key: "sun", labelHe: "א", fullLabelHe: "ראשון" },
  { index: 1, key: "mon", labelHe: "ב", fullLabelHe: "שני" },
  { index: 2, key: "tue", labelHe: "ג", fullLabelHe: "שלישי" },
  { index: 3, key: "wed", labelHe: "ד", fullLabelHe: "רביעי" },
  { index: 4, key: "thu", labelHe: "ה", fullLabelHe: "חמישי" },
  { index: 5, key: "fri", labelHe: "ו", fullLabelHe: "שישי" },
  { index: 6, key: "sat", labelHe: "ש", fullLabelHe: "שבת" },
] as const;

const DAY_BY_KEY: ReadonlyMap<string, DayOfWeek> = new Map(
  DAYS_OF_WEEK.map((d) => [d.key, d]),
);

/** Parse `?days=sun,wed` into day indexes, dropping garbage. */
export function parseDays(raw: string | undefined): DayOfWeek[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: DayOfWeek[] = [];
  for (const part of raw.split(",")) {
    const key = part.trim();
    if (!key || seen.has(key)) continue;
    const day = DAY_BY_KEY.get(key);
    if (!day) continue;
    seen.add(key);
    out.push(day);
  }
  return out;
}
