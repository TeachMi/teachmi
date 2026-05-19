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
