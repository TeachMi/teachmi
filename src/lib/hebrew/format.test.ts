import { describe, expect, it } from "vitest";
import { formatHebrewDate, formatHebrewWeekday, formatIlsCurrency } from "./format";

describe("Hebrew formatting helpers", () => {
  it("formats ILS currency with the shekel symbol after the amount", () => {
    expect(formatIlsCurrency(180)).toMatch(/180.*₪/);
  });

  it("formats dates with Hebrew numeric date order", () => {
    expect(formatHebrewDate("2026-05-03T12:00:00Z")).toBe("03.05.2026");
  });

  it("formats Hebrew weekday names in the Israel time zone", () => {
    expect(formatHebrewWeekday("2026-05-03T12:00:00Z")).toBe("יום ראשון");
  });

  it("rejects invalid date values explicitly", () => {
    expect(() => formatHebrewDate("not-a-date")).toThrow(TypeError);
  });
});
