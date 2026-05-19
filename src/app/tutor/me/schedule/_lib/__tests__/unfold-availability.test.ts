import { describe, expect, it } from "vitest";
import { unfoldAvailability } from "../unfold-availability";

// 2026-05-17 is a Sunday in Asia/Jerusalem (weekday=0). The test fixtures
// below pin to Sunday-anchored dates so weekday math is unambiguous.
const SUN = "2026-05-17";
const MON = "2026-05-18";
const TUE = "2026-05-19";

describe("unfoldAvailability — recurring overlay", () => {
  it("recurring rule for weekday=1 (Mon) fills only Monday in a Sun-Tue range", () => {
    const out = unfoldAvailability({
      recurringRules: [{ weekday: 1, startTime: "10:00:00", endTime: "10:30:00" }],
      exceptionRules: [],
      dateRange: { from: SUN, to: TUE },
    });

    // 10:00 in the 8:00-anchored grid = slot index 4.
    expect(out.get(SUN)?.size ?? 0).toBe(0);
    expect(out.get(MON)?.get(4)).toEqual({
      kind: "available",
      source: "recurring",
    });
    expect(out.get(TUE)?.size ?? 0).toBe(0);
  });

  it("multiple weekdays' recurring rules each fold onto their day", () => {
    const out = unfoldAvailability({
      recurringRules: [
        { weekday: 0, startTime: "09:00:00", endTime: "09:30:00" },
        { weekday: 2, startTime: "20:00:00", endTime: "20:30:00" },
      ],
      exceptionRules: [],
      dateRange: { from: SUN, to: TUE },
    });

    // 9:00 = slot 2; 20:00 = slot 24
    expect(out.get(SUN)?.get(2)?.kind).toBe("available");
    expect(out.get(TUE)?.get(24)?.kind).toBe("available");
  });
});

describe("unfoldAvailability — exception overlay", () => {
  it("exception_blocked overrides a recurring-available slot", () => {
    const out = unfoldAvailability({
      recurringRules: [{ weekday: 1, startTime: "10:00:00", endTime: "10:30:00" }],
      exceptionRules: [
        {
          kind: "exception_blocked",
          date: MON,
          startTime: "10:00:00",
          endTime: "10:30:00",
        },
      ],
      dateRange: { from: MON, to: MON },
    });
    expect(out.get(MON)?.get(4)).toEqual({
      kind: "blocked",
      source: "exception_blocked",
    });
  });

  it("exception_available marks a slot available even when no recurring rule applies", () => {
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [
        {
          kind: "exception_available",
          date: MON,
          startTime: "12:30:00",
          endTime: "13:00:00",
        },
      ],
      dateRange: { from: MON, to: MON },
    });
    // 12:30 = slot 9
    expect(out.get(MON)?.get(9)).toEqual({
      kind: "available",
      source: "exception_available",
    });
  });
});

describe("unfoldAvailability — slot states outside the grid window are ignored", () => {
  it("times before 08:00 don't produce a slot entry", () => {
    const out = unfoldAvailability({
      recurringRules: [{ weekday: 0, startTime: "07:00:00", endTime: "07:30:00" }],
      exceptionRules: [],
      dateRange: { from: SUN, to: SUN },
    });
    expect(out.get(SUN)?.size ?? 0).toBe(0);
  });

  it("times at or past 23:00 don't produce a slot entry", () => {
    const out = unfoldAvailability({
      recurringRules: [{ weekday: 0, startTime: "23:00:00", endTime: "23:30:00" }],
      exceptionRules: [],
      dateRange: { from: SUN, to: SUN },
    });
    expect(out.get(SUN)?.size ?? 0).toBe(0);
  });
});

describe("unfoldAvailability — date range coverage", () => {
  it("a 7-day range yields exactly 7 dated entries", () => {
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [],
      dateRange: { from: SUN, to: "2026-05-23" /* Saturday */ },
    });
    expect(out.size).toBe(7);
    expect(out.has(SUN)).toBe(true);
    expect(out.has("2026-05-23")).toBe(true);
  });
});

describe("unfoldAvailability — booked overlay (Area 1 2026-05-19)", () => {
  // Asia/Jerusalem is UTC+03:00 standard / UTC+03:00 daylight (IDT). 2026-05
  // is in IDT; "14:00 IL" = 11:00 UTC. Tests use UTC instants and assert IL
  // slot placement.
  const MON_14_IL_UTC = new Date("2026-05-18T11:00:00.000Z"); // 14:00 IL Mon

  it("60-min booking covers 2 contiguous slots", () => {
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [],
      bookings: [
        { id: "b1", startsAt: MON_14_IL_UTC, durationMinutes: 60 },
      ],
      dateRange: { from: MON, to: MON },
    });
    // 14:00 = slot 12 (08:00 base, 30-min steps). 60min = 2 slots → 12, 13.
    expect(out.get(MON)?.get(12)).toEqual({ kind: "booked", bookingId: "b1" });
    expect(out.get(MON)?.get(13)).toEqual({ kind: "booked", bookingId: "b1" });
    expect(out.get(MON)?.get(14)).toBeUndefined();
  });

  it("45-min booking covers 2 slots (second is partial overlap)", () => {
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [],
      bookings: [
        { id: "b1", startsAt: MON_14_IL_UTC, durationMinutes: 45 },
      ],
      dateRange: { from: MON, to: MON },
    });
    expect(out.get(MON)?.get(12)?.kind).toBe("booked");
    expect(out.get(MON)?.get(13)?.kind).toBe("booked");
    expect(out.get(MON)?.get(14)).toBeUndefined();
  });

  it("90-min booking covers 3 slots", () => {
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [],
      bookings: [
        { id: "b1", startsAt: MON_14_IL_UTC, durationMinutes: 90 },
      ],
      dateRange: { from: MON, to: MON },
    });
    expect(out.get(MON)?.get(12)?.kind).toBe("booked");
    expect(out.get(MON)?.get(13)?.kind).toBe("booked");
    expect(out.get(MON)?.get(14)?.kind).toBe("booked");
    expect(out.get(MON)?.get(15)).toBeUndefined();
  });

  it("booked overlay wins over a recurring-available rule", () => {
    const out = unfoldAvailability({
      recurringRules: [
        { weekday: 1, startTime: "14:00:00", endTime: "14:30:00" },
      ],
      exceptionRules: [],
      bookings: [
        { id: "b1", startsAt: MON_14_IL_UTC, durationMinutes: 60 },
      ],
      dateRange: { from: MON, to: MON },
    });
    expect(out.get(MON)?.get(12)).toEqual({ kind: "booked", bookingId: "b1" });
  });

  it("booked overlay wins over an exception_blocked (orphan-and-leave case)", () => {
    // Tutor removed the rule but the existing booking persists as an orphan.
    // The cell underneath would render as 'blocked' or 'not-available'; the
    // booked overlay must show through regardless.
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [
        {
          kind: "exception_blocked",
          date: MON,
          startTime: "14:00:00",
          endTime: "14:30:00",
        },
      ],
      bookings: [
        { id: "b1", startsAt: MON_14_IL_UTC, durationMinutes: 60 },
      ],
      dateRange: { from: MON, to: MON },
    });
    expect(out.get(MON)?.get(12)).toEqual({ kind: "booked", bookingId: "b1" });
  });

  it("omitting bookings (or empty array) produces no booked cells (Tab 1 contract)", () => {
    const noBookingsField = unfoldAvailability({
      recurringRules: [{ weekday: 1, startTime: "14:00:00", endTime: "14:30:00" }],
      exceptionRules: [],
      dateRange: { from: MON, to: MON },
    });
    expect(noBookingsField.get(MON)?.get(12)?.kind).toBe("available");

    const emptyBookingsArr = unfoldAvailability({
      recurringRules: [{ weekday: 1, startTime: "14:00:00", endTime: "14:30:00" }],
      exceptionRules: [],
      bookings: [],
      dateRange: { from: MON, to: MON },
    });
    expect(emptyBookingsArr.get(MON)?.get(12)?.kind).toBe("available");
  });

  it("booking outside the rendered date range is ignored", () => {
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [],
      bookings: [
        { id: "b1", startsAt: MON_14_IL_UTC, durationMinutes: 60 },
      ],
      dateRange: { from: TUE, to: TUE },
    });
    expect(out.get(TUE)?.size ?? 0).toBe(0);
  });

  it("booking entirely outside grid window (e.g. 06:00 IL) produces no cells", () => {
    const earlyMorning = new Date("2026-05-18T03:00:00.000Z"); // 06:00 IL Mon
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [],
      bookings: [{ id: "b1", startsAt: earlyMorning, durationMinutes: 60 }],
      dateRange: { from: MON, to: MON },
    });
    expect(out.get(MON)?.size ?? 0).toBe(0);
  });

  it("booking straddling the grid start clips to the grid (08:00 onwards)", () => {
    // 07:30 IL + 60min → 07:30–08:30. Only the 08:00 slot is in-range.
    const straddleStart = new Date("2026-05-18T04:30:00.000Z"); // 07:30 IL Mon
    const out = unfoldAvailability({
      recurringRules: [],
      exceptionRules: [],
      bookings: [{ id: "b1", startsAt: straddleStart, durationMinutes: 60 }],
      dateRange: { from: MON, to: MON },
    });
    expect(out.get(MON)?.get(0)?.kind).toBe("booked"); // 08:00 slot
    expect(out.get(MON)?.get(1)).toBeUndefined();
  });
});
