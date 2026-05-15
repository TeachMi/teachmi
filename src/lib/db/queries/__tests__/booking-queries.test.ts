import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPastBookingsForStudent,
  getUpcomingBookingsForStudent,
} from "../booking-queries";
import type {
  DbForBookingQueries,
  UpcomingBookingRow,
} from "../booking-queries";

interface FakeDbState {
  queuedRows: Array<Record<string, unknown>>;
  whereConditionCaptured: unknown;
  orderBySpecsCaptured: unknown[];
  limitCaptured: number | null;
  shouldThrow: Error | null;
}

// FakeDb with the 3-leftJoin chain that booking-queries needs (tutor_profiles,
// users, subjects). All joins are no-ops in the fake — tests stub the rows
// directly with the joined column names so the helper's post-mapping picks
// them up.
function makeFakeDb(state: FakeDbState): DbForBookingQueries {
  const terminal = {
    where: (cond: unknown) => {
      state.whereConditionCaptured = cond;
      return {
        orderBy: (...specs: unknown[]) => {
          state.orderBySpecsCaptured = specs;
          return {
            limit: async (n: number) => {
              state.limitCaptured = n;
              if (state.shouldThrow) throw state.shouldThrow;
              return state.queuedRows;
            },
          };
        },
      };
    },
  };
  const join3 = { leftJoin: () => terminal };
  const join2 = { leftJoin: () => join3 };
  const join1 = { leftJoin: () => join2 };
  return {
    select: (_cols: unknown) => {
      void _cols;
      return { from: (_table: unknown) => join1 };
    },
  } as DbForBookingQueries;
}

// Raw JOIN-output row shape the helper sees BEFORE its post-mapping coalesces
// tutorDisplayName from (tutorProfiles.displayName ?? users.name ?? null).
// Tests stub via this shape and assert against the helper's mapped output.
function joinedRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    tutorUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    tutorDisplayName: null,
    userName: "Ofer (Tutor)",
    subjectId: null,
    subjectNameHe: null,
    startsAt: new Date("2026-05-20T11:00:00.000Z"),
    durationMinutes: 60,
    status: "confirmed",
    priceIls: 180,
    ...over,
  };
}

const USER_ID = "00000000-1111-2222-3333-444444444444";
const NOW = new Date("2026-05-15T08:00:00.000Z");

let state: FakeDbState;
let silentLogger: { error: (message: string, err?: unknown) => void };
let errorCalls: Array<{ message: string; err: unknown }>;

beforeEach(() => {
  state = {
    queuedRows: [],
    whereConditionCaptured: null,
    orderBySpecsCaptured: [],
    limitCaptured: null,
    shouldThrow: null,
  };
  errorCalls = [];
  silentLogger = {
    error: (message: string, err?: unknown) => {
      errorCalls.push({ message, err });
    },
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getUpcomingBookingsForStudent", () => {
  it("returns rows mapped with tutorDisplayName + status preserved", async () => {
    state.queuedRows = [
      joinedRow({
        id: "b-1",
        tutorDisplayName: "ד״ר מיכל לוי",
        subjectNameHe: "מתמטיקה",
        startsAt: new Date("2026-05-16T10:00:00.000Z"),
      }),
      joinedRow({ id: "b-2", startsAt: new Date("2026-05-17T10:00:00.000Z") }),
    ];
    const result = await getUpcomingBookingsForStudent(USER_ID, {
      db: makeFakeDb(state),
      now: NOW,
      logger: silentLogger,
    });
    expect(result.map((r) => r.id)).toEqual(["b-1", "b-2"]);
    expect(result[0]?.tutorDisplayName).toBe("ד״ר מיכל לוי");
    expect(result[0]?.subjectNameHe).toBe("מתמטיקה");
    // Fallback path: when tutorProfiles.displayName is null, the helper
    // coalesces to users.name.
    expect(result[1]?.tutorDisplayName).toBe("Ofer (Tutor)");
  });

  it("limits the query to 10 rows", async () => {
    state.queuedRows = [];
    await getUpcomingBookingsForStudent(USER_ID, {
      db: makeFakeDb(state),
      now: NOW,
      logger: silentLogger,
    });
    expect(state.limitCaptured).toBe(10);
  });

  it("returns empty array when the DB call fails (fail-OPEN)", async () => {
    state.shouldThrow = new Error("Neon unreachable");
    const result = await getUpcomingBookingsForStudent(USER_ID, {
      db: makeFakeDb(state),
      now: NOW,
      logger: silentLogger,
    });
    expect(result).toEqual([]);
    expect(errorCalls).toHaveLength(1);
  });

  it("returns empty array when no rows match", async () => {
    state.queuedRows = [];
    const result = await getUpcomingBookingsForStudent(USER_ID, {
      db: makeFakeDb(state),
      now: NOW,
      logger: silentLogger,
    });
    expect(result).toEqual([]);
  });

  it("captures where + orderBy + limit on the query chain", async () => {
    state.queuedRows = [];
    await getUpcomingBookingsForStudent(USER_ID, {
      db: makeFakeDb(state),
      now: NOW,
      logger: silentLogger,
    });
    expect(state.whereConditionCaptured).not.toBeNull();
    expect(state.orderBySpecsCaptured).toHaveLength(1);
    expect(state.limitCaptured).toBe(10);
  });
});

describe("getPastBookingsForStudent", () => {
  it("returns past rows with completed/no_show/cancelled status", async () => {
    state.queuedRows = [
      joinedRow({
        id: "b-past-1",
        status: "completed",
        tutorDisplayName: "ד״ר מיכל לוי",
        subjectNameHe: "מתמטיקה",
        startsAt: new Date("2026-05-13T10:00:00.000Z"),
      }),
      joinedRow({
        id: "b-past-2",
        status: "no_show",
        tutorDisplayName: "ד״ר מיכל לוי",
        startsAt: new Date("2026-05-10T10:00:00.000Z"),
      }),
    ];
    const result = await getPastBookingsForStudent(USER_ID, {
      db: makeFakeDb(state),
      now: NOW,
      logger: silentLogger,
    });
    expect(result.map((r) => r.id)).toEqual(["b-past-1", "b-past-2"]);
    expect(result[0]?.status).toBe("completed");
    expect(result[1]?.status).toBe("no_show");
  });

  it("returns empty array when the DB call fails (fail-OPEN)", async () => {
    state.shouldThrow = new Error("Neon unreachable");
    const result = await getPastBookingsForStudent(USER_ID, {
      db: makeFakeDb(state),
      now: NOW,
      logger: silentLogger,
    });
    expect(result).toEqual([]);
    expect(errorCalls).toHaveLength(1);
  });

  it("limits the query to 10 rows", async () => {
    state.queuedRows = [];
    await getPastBookingsForStudent(USER_ID, {
      db: makeFakeDb(state),
      now: NOW,
      logger: silentLogger,
    });
    expect(state.limitCaptured).toBe(10);
  });
});
