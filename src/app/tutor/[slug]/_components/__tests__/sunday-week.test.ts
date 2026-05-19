// Sunday-week helper tests — Story 4.3 (2026-05-18).
// Covers: Sunday-alignment, isPast flagging, weekOffset pagination, day
// letters. Uses non-DST-boundary dates so the IL offset arithmetic is
// stable.

import { describe, expect, it } from "vitest";
import { getSundayWeek, HEBREW_WEEKDAY_LETTERS } from "../sunday-week";

describe("getSundayWeek — Sunday alignment", () => {
  it("starts on the most-recent Sunday when anchor is mid-week", () => {
    // 2026-05-20 is a Wednesday in IL (UTC+3 IDT).
    const wednesday = new Date("2026-05-20T08:00:00.000Z");
    const week = getSundayWeek(wednesday, { now: wednesday });

    expect(week).toHaveLength(7);
    // First entry's letter is "א" (Sunday).
    expect(week[0]!.letter).toBe(HEBREW_WEEKDAY_LETTERS[0]);
    // First entry's day-of-month is May 17 (the Sunday before May 20).
    expect(week[0]!.dayOfMonth).toBe(17);
    expect(week[0]!.dateKey).toBe("2026-05-17");
    // Last entry is Saturday (Sat = "ש" in our table).
    expect(week[6]!.letter).toBe(HEBREW_WEEKDAY_LETTERS[6]);
    expect(week[6]!.dayOfMonth).toBe(23);
  });

  it("treats Sunday itself as the start day (offset = 0)", () => {
    const sunday = new Date("2026-05-17T12:00:00.000Z");
    const week = getSundayWeek(sunday, { now: sunday });
    expect(week[0]!.dayOfMonth).toBe(17);
    expect(week[0]!.letter).toBe(HEBREW_WEEKDAY_LETTERS[0]);
  });

  it("marks past days within the current week as isPast=true", () => {
    // Tuesday 2026-05-19 → strip is Sun 17 / Mon 18 / Tue 19 / Wed 20 / …
    // 17 and 18 are past, 19 (today) and onward are not.
    const tuesday = new Date("2026-05-19T10:00:00.000Z");
    const week = getSundayWeek(tuesday, { now: tuesday });
    expect(week[0]!.isPast).toBe(true); // Sun May 17
    expect(week[1]!.isPast).toBe(true); // Mon May 18
    expect(week[2]!.isPast).toBe(false); // Tue May 19 (today)
    expect(week[3]!.isPast).toBe(false); // Wed May 20
  });
});

describe("getSundayWeek — pagination", () => {
  it("weekOffset=1 returns the following Sun→Sat week", () => {
    const wednesday = new Date("2026-05-20T08:00:00.000Z");
    const week = getSundayWeek(wednesday, { now: wednesday, weekOffset: 1 });

    expect(week[0]!.dayOfMonth).toBe(24);
    expect(week[0]!.letter).toBe(HEBREW_WEEKDAY_LETTERS[0]);
    expect(week[6]!.dayOfMonth).toBe(30);
  });

  it("weekOffset=2 returns two weeks ahead", () => {
    const wednesday = new Date("2026-05-20T08:00:00.000Z");
    const week = getSundayWeek(wednesday, { now: wednesday, weekOffset: 2 });
    expect(week[0]!.dayOfMonth).toBe(31);
    expect(week[6]!.dayOfMonth).toBe(6); // June 6
  });

  it("no day is flagged past when weekOffset > 0 (always future weeks)", () => {
    const wednesday = new Date("2026-05-20T08:00:00.000Z");
    const week = getSundayWeek(wednesday, { now: wednesday, weekOffset: 1 });
    for (const day of week) expect(day.isPast).toBe(false);
  });
});

describe("getSundayWeek — day letters", () => {
  it("uses א/ב/ג/ד/ה/ו/ש in Sun→Sat order", () => {
    const sunday = new Date("2026-05-17T12:00:00.000Z");
    const week = getSundayWeek(sunday, { now: sunday });
    expect(week.map((d) => d.letter)).toEqual(["א", "ב", "ג", "ד", "ה", "ו", "ש"]);
  });
});
