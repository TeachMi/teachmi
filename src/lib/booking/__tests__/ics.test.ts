import { describe, expect, it } from "vitest";
import { buildIcs, buildIcsMulti } from "../ics";

describe("buildIcs", () => {
  const baseInput = {
    uid: "booking-abc123@teachme.co.il",
    startUtc: new Date("2026-05-20T11:00:00.000Z"),
    endUtc: new Date("2026-05-20T12:00:00.000Z"),
    summary: "שיעור עם מיכל לוי",
    description: "שיעור פרטי דרך TeachMe.\nמשך: 60 דקות.",
    location: "אונליין · TeachMe",
  };

  it("emits CRLF-separated lines per RFC-5545", () => {
    const ics = buildIcs(baseInput);
    // Every separator should be \r\n, not just \n.
    expect(ics).toMatch(/\r\n/);
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });

  it("contains the required envelope and event blocks", () => {
    const ics = buildIcs(baseInput);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("formats DTSTART/DTEND in UTC YYYYMMDDTHHMMSSZ format", () => {
    const ics = buildIcs(baseInput);
    expect(ics).toContain("DTSTART:20260520T110000Z");
    expect(ics).toContain("DTEND:20260520T120000Z");
  });

  it("preserves Hebrew text in SUMMARY", () => {
    const ics = buildIcs(baseInput);
    expect(ics).toContain("שיעור עם מיכל לוי");
  });

  it("escapes embedded newlines in DESCRIPTION", () => {
    const ics = buildIcs(baseInput);
    // The raw "\n" inside description should be escaped to "\\n" so the
    // line stays a single CRLF-terminated record.
    expect(ics).toContain("DESCRIPTION:");
    expect(ics).toContain("שיעור פרטי דרך TeachMe.\\nמשך: 60 דקות.");
  });

  it("includes the supplied UID", () => {
    const ics = buildIcs(baseInput);
    expect(ics).toContain("UID:booking-abc123@teachme.co.il");
  });
});

describe("buildIcsMulti", () => {
  const evt1 = {
    uid: "booking-aaa@teachme.co.il",
    startUtc: new Date("2026-05-20T11:00:00.000Z"),
    endUtc: new Date("2026-05-20T12:00:00.000Z"),
    summary: "שיעור עם מיכל",
    description: "1",
    location: "אונליין",
  };
  const evt2 = {
    uid: "booking-bbb@teachme.co.il",
    startUtc: new Date("2026-05-22T15:00:00.000Z"),
    endUtc: new Date("2026-05-22T15:45:00.000Z"),
    summary: "שיעור עם דניאל",
    description: "2",
    location: "אונליין",
  };

  it("emits one VCALENDAR wrapping N VEVENT blocks", () => {
    const ics = buildIcsMulti([evt1, evt2]);
    // Single envelope.
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics.match(/END:VCALENDAR/g)).toHaveLength(1);
    // N VEVENTs.
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    // Both UIDs present.
    expect(ics).toContain("UID:booking-aaa@teachme.co.il");
    expect(ics).toContain("UID:booking-bbb@teachme.co.il");
  });

  it("empty array → valid VCALENDAR with zero VEVENTs", () => {
    const ics = buildIcsMulti([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("buildIcs(single) and buildIcsMulti([single]) produce identical output (modulo DTSTAMP)", () => {
    // DTSTAMP is `new Date()` at build time — separate calls produce
    // different timestamps. Strip it for the comparison.
    const stripStamp = (s: string) => s.replace(/DTSTAMP:[^\r]+\r\n/g, "");
    expect(stripStamp(buildIcs(evt1))).toBe(stripStamp(buildIcsMulti([evt1])));
  });
});
