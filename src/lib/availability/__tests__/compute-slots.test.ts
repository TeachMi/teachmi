import { describe, expect, it } from "vitest";
import {
  computeSlotStates,
  getJerusalemWallTime,
  jerusalemWallTimeToUtc,
  startOfTodayJerusalem,
  type SlotStateInput,
} from "../compute-slots";
import type {
  ActiveBookingRow,
  TutorAvailabilityRow,
} from "@/lib/db/queries/tutor-queries";

// All tests use 2026-05-14 (Thursday) — well inside IDT (DST: 2026-03-27 →
// 2026-10-25), so wall-time → UTC math is straightforward (offset = +3 hours).
const TEST_FROM = jerusalemWallTimeToUtc(2026, 5, 14, 0, 0); // midnight IL
function buildAvailability(
  overrides: Partial<TutorAvailabilityRow> = {},
): TutorAvailabilityRow {
  return {
    id: "av-1",
    kind: "recurring",
    weekday: 4, // Thursday
    date: null,
    startTime: "14:00:00",
    endTime: "18:00:00",
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

function buildBooking(overrides: Partial<ActiveBookingRow> = {}): ActiveBookingRow {
  return {
    id: "bk-1",
    startsAt: jerusalemWallTimeToUtc(2026, 5, 14, 14, 0),
    durationMinutes: 60,
    status: "confirmed",
    ...overrides,
  };
}

function baseInput(overrides: Partial<SlotStateInput> = {}): SlotStateInput {
  return {
    availability: [],
    bookings: [],
    from: TEST_FROM,
    daysAhead: 1,
    durationMinutes: 60,
    ...overrides,
  };
}

describe("getJerusalemWallTime — TZ projection", () => {
  it("converts a known UTC instant to IL wall time (IDT summer = UTC+3)", () => {
    // 2026-05-14 11:00:00 UTC → 14:00 IDT
    const utc = new Date(Date.UTC(2026, 4, 14, 11, 0, 0));
    const w = getJerusalemWallTime(utc);
    expect(w.year).toBe(2026);
    expect(w.month).toBe(5);
    expect(w.day).toBe(14);
    expect(w.hour).toBe(14);
    expect(w.minute).toBe(0);
    expect(w.weekday).toBe(4); // Thursday
  });

  it("normalizes 24 to 0 at midnight IL", () => {
    const utc = new Date(Date.UTC(2026, 4, 13, 21, 0, 0)); // 2026-05-14 00:00 IDT
    const w = getJerusalemWallTime(utc);
    expect(w.hour).toBe(0);
    expect(w.day).toBe(14);
  });
});

describe("jerusalemWallTimeToUtc — round-trip correctness", () => {
  it("14:00 IDT on 2026-05-14 maps to 11:00 UTC", () => {
    const utc = jerusalemWallTimeToUtc(2026, 5, 14, 14, 0);
    expect(utc.toISOString()).toBe("2026-05-14T11:00:00.000Z");
  });

  it("round-trips: walltime → UTC → walltime is identity", () => {
    const utc = jerusalemWallTimeToUtc(2026, 5, 14, 14, 30);
    const w = getJerusalemWallTime(utc);
    expect(w).toMatchObject({ year: 2026, month: 5, day: 14, hour: 14, minute: 30 });
  });

  it("midnight IL on 2026-05-14 maps to 2026-05-13 21:00 UTC", () => {
    const utc = jerusalemWallTimeToUtc(2026, 5, 14, 0, 0);
    expect(utc.toISOString()).toBe("2026-05-13T21:00:00.000Z");
  });
});

describe("startOfTodayJerusalem", () => {
  it("returns midnight-in-IL UTC instant", () => {
    // Now = 14:00 IDT on May 14 = 11:00 UTC.
    const now = new Date(Date.UTC(2026, 4, 14, 11, 0, 0));
    const start = startOfTodayJerusalem(now);
    expect(start.toISOString()).toBe("2026-05-13T21:00:00.000Z");
  });

  it("handles 'late evening' UTC correctly (date in IL is already next day)", () => {
    // 22:00 UTC on May 14 = 01:00 IDT on May 15 → start of May 15 = 21:00 UTC May 14
    const now = new Date(Date.UTC(2026, 4, 14, 22, 0, 0));
    const start = startOfTodayJerusalem(now);
    expect(start.toISOString()).toBe("2026-05-14T21:00:00.000Z");
  });
});

describe("computeSlotStates — recurring rule only", () => {
  it("marks all slots covered by a recurring rule as available", () => {
    const result = computeSlotStates(
      baseInput({
        availability: [
          buildAvailability({
            // META spread won't satisfy the union but the public type doesn't
            // need it; the helper only reads kind/weekday/startTime/endTime/etc.
            
          }),
        ],
      }),
    );
    const dayKey = "2026-05-14";
    const slots = result.get(dayKey)!;
    // 14:00 → 18:00 covers slots 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30
    const available = slots.filter((s) => s.status === "available");
    expect(available.length).toBe(8);
    expect(available[0]!.localTime).toBe("14:00");
    expect(available[7]!.localTime).toBe("17:30");
  });

  it("slots outside the rule's range are unavailable", () => {
    const result = computeSlotStates(
      baseInput({ availability: [buildAvailability()] }),
    );
    const slots = result.get("2026-05-14")!;
    const at1300 = slots.find((s) => s.localTime === "18:00");
    expect(at1300?.status).toBe("unavailable");
    const at2100 = slots.find((s) => s.localTime === "21:00");
    expect(at2100?.status).toBe("unavailable");
  });
});

describe("computeSlotStates — exception_blocked overrides recurring", () => {
  it("recurring + exception_blocked for the date → that slot unavailable", () => {
    const result = computeSlotStates(
      baseInput({
        availability: [
          buildAvailability(),
          buildAvailability({
            
            id: "av-2",
            kind: "exception_blocked",
            weekday: null,
            date: "2026-05-14",
            startTime: "15:00:00",
            endTime: "16:00:00",
          }),
        ],
      }),
    );
    const slots = result.get("2026-05-14")!;
    expect(slots.find((s) => s.localTime === "14:30")?.status).toBe("available");
    expect(slots.find((s) => s.localTime === "15:00")?.status).toBe("unavailable");
    expect(slots.find((s) => s.localTime === "15:30")?.status).toBe("unavailable");
    expect(slots.find((s) => s.localTime === "16:00")?.status).toBe("available");
  });
});

describe("computeSlotStates — exception_available without recurring", () => {
  it("exception_available for a date with no recurring rule → available", () => {
    const result = computeSlotStates(
      baseInput({
        availability: [
          buildAvailability({
            
            id: "av-3",
            kind: "exception_available",
            weekday: null,
            date: "2026-05-14",
            startTime: "20:00:00",
            endTime: "21:00:00",
          }),
        ],
      }),
    );
    const slots = result.get("2026-05-14")!;
    expect(slots.find((s) => s.localTime === "20:00")?.status).toBe("available");
    expect(slots.find((s) => s.localTime === "20:30")?.status).toBe("available");
    expect(slots.find((s) => s.localTime === "19:30")?.status).toBe("unavailable");
  });
});

describe("computeSlotStates — active bookings overlay", () => {
  it("active booking at a slot → booked (overrides available)", () => {
    const result = computeSlotStates(
      baseInput({
        availability: [buildAvailability()],
        bookings: [buildBooking()],
      }),
    );
    const slots = result.get("2026-05-14")!;
    expect(slots.find((s) => s.localTime === "14:00")?.status).toBe("booked");
    // 14:30 is still available — only the 14:00 slot is matched (booked-starts
    // is a Set of UTC ISOs; we don't expand by duration in this minimal version).
    expect(slots.find((s) => s.localTime === "14:30")?.status).toBe("available");
  });

  it("pending_payment AND confirmed bookings both block", () => {
    const result = computeSlotStates(
      baseInput({
        availability: [buildAvailability()],
        bookings: [
          buildBooking({
            
            id: "bk-2",
            startsAt: jerusalemWallTimeToUtc(2026, 5, 14, 15, 0),
            status: "pending_payment",
          }),
          buildBooking({
            
            id: "bk-3",
            startsAt: jerusalemWallTimeToUtc(2026, 5, 14, 16, 0),
            status: "confirmed",
          }),
        ],
      }),
    );
    const slots = result.get("2026-05-14")!;
    expect(slots.find((s) => s.localTime === "15:00")?.status).toBe("booked");
    expect(slots.find((s) => s.localTime === "16:00")?.status).toBe("booked");
  });
});

describe("computeSlotStates — validity windows", () => {
  it("expired valid_until excludes the row", () => {
    const result = computeSlotStates(
      baseInput({
        availability: [
          buildAvailability({ validUntil: "2026-05-13" }),
        ],
      }),
    );
    const slots = result.get("2026-05-14")!;
    expect(slots.every((s) => s.status === "unavailable")).toBe(true);
  });

  it("future valid_from excludes the row", () => {
    const result = computeSlotStates(
      baseInput({
        availability: [
          buildAvailability({ validFrom: "2026-05-15" }),
        ],
      }),
    );
    const slots = result.get("2026-05-14")!;
    expect(slots.every((s) => s.status === "unavailable")).toBe(true);
  });

  it("valid_from = today INCLUDES the row", () => {
    const result = computeSlotStates(
      baseInput({
        availability: [
          buildAvailability({ validFrom: "2026-05-14" }),
        ],
      }),
    );
    const slots = result.get("2026-05-14")!;
    expect(slots.some((s) => s.status === "available")).toBe(true);
  });
});

describe("computeSlotStates — empty inputs", () => {
  it("no availability rows → all slots unavailable", () => {
    const result = computeSlotStates(baseInput());
    const slots = result.get("2026-05-14")!;
    expect(slots.every((s) => s.status === "unavailable")).toBe(true);
  });

  it("the returned map has one entry per day", () => {
    const result = computeSlotStates(baseInput({ daysAhead: 7 }));
    expect(result.size).toBe(7);
    expect(result.has("2026-05-14")).toBe(true);
    expect(result.has("2026-05-20")).toBe(true);
  });
});

describe("computeSlotStates — slot output shape", () => {
  it("every slot has startIsoUtc + localTime + status", () => {
    const result = computeSlotStates(
      baseInput({ availability: [buildAvailability()] }),
    );
    const slot = result.get("2026-05-14")![0]!;
    expect(slot).toMatchObject({
      startIsoUtc: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      localTime: expect.stringMatching(/^\d{2}:\d{2}$/),
      status: expect.stringMatching(/^(available|booked|unavailable)$/),
    });
  });

  it("14:00 IL is 11:00 UTC ISO string", () => {
    const result = computeSlotStates(
      baseInput({ availability: [buildAvailability()] }),
    );
    const slots = result.get("2026-05-14")!;
    const at1400 = slots.find((s) => s.localTime === "14:00")!;
    expect(at1400.startIsoUtc).toBe("2026-05-14T11:00:00.000Z");
  });
});
