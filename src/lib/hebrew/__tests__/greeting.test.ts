import { describe, expect, it } from "vitest";
import { getHebrewGreeting } from "../greeting";

// IDT (UTC+3) — covers 2026-03-27 → 2026-10-25. Bagrut launch is fully inside
// IDT. Using May 15 keeps the test off DST-boundary days.
function ilLocalAt(hour: number): Date {
  // For UTC+3, the corresponding UTC instant is (hour - 3). Wrap with mod 24
  // so e.g. hour=2 → UTC=-1 → equivalent to previous-day 23:00 UTC.
  const utcHour = ((hour - 3) + 24) % 24;
  return new Date(`2026-05-15T${String(utcHour).padStart(2, "0")}:00:00.000Z`);
}

describe("getHebrewGreeting", () => {
  it("morning: 08:00 IL → בוקר טוב", () => {
    expect(getHebrewGreeting(ilLocalAt(8), "נועה")).toBe("בוקר טוב, נועה");
  });

  it("noon: 14:00 IL → צהריים טובים", () => {
    expect(getHebrewGreeting(ilLocalAt(14), "נועה")).toBe("צהריים טובים, נועה");
  });

  it("evening: 19:00 IL → ערב טוב", () => {
    expect(getHebrewGreeting(ilLocalAt(19), "נועה")).toBe("ערב טוב, נועה");
  });

  it("night: 23:00 IL → לילה טוב", () => {
    expect(getHebrewGreeting(ilLocalAt(23), "נועה")).toBe("לילה טוב, נועה");
  });

  it("post-midnight 03:00 IL → לילה טוב (boundary)", () => {
    expect(getHebrewGreeting(ilLocalAt(3), "נועה")).toBe("לילה טוב, נועה");
  });

  it("boundary at 05:00 IL flips to בוקר טוב", () => {
    expect(getHebrewGreeting(ilLocalAt(5), "נועה")).toBe("בוקר טוב, נועה");
  });

  it("multi-word displayName uses first word only", () => {
    expect(getHebrewGreeting(ilLocalAt(8), "ד״ר מיכל לוי")).toBe("בוקר טוב, ד״ר");
  });

  it("null displayName drops the comma", () => {
    expect(getHebrewGreeting(ilLocalAt(8), null)).toBe("בוקר טוב");
  });

  it("empty string displayName drops the comma", () => {
    expect(getHebrewGreeting(ilLocalAt(8), "")).toBe("בוקר טוב");
  });

  it("whitespace-only displayName drops the comma", () => {
    expect(getHebrewGreeting(ilLocalAt(8), "   ")).toBe("בוקר טוב");
  });
});
