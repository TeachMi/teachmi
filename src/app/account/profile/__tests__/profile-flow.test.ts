import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runUpdateProfile,
  validateProfileInput,
  type DbForProfileUpdate,
} from "../profile-flow";

interface FakeDbState {
  updates: Array<{ table: unknown; values: unknown; whereCondition: unknown }>;
  shouldThrow: Error | null;
}

function makeFakeDb(state: FakeDbState): DbForProfileUpdate {
  return {
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async (cond: unknown) => {
          state.updates.push({ table, values, whereCondition: cond });
          if (state.shouldThrow) throw state.shouldThrow;
          return [{ id: "user-1" }];
        },
      }),
    }),
  };
}

function makeFormData(record: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(record)) fd.set(k, v);
  return fd;
}

const USER_ID = "00000000-1111-2222-3333-444444444444";
let state: FakeDbState;
let errorCalls: Array<{ msg: string; err: unknown }>;
let silentLogger: { error: (message: string, err?: unknown) => void };

beforeEach(() => {
  state = { updates: [], shouldThrow: null };
  errorCalls = [];
  silentLogger = {
    error: (msg, err) => {
      errorCalls.push({ msg, err });
    },
  };
});

afterEach(() => {
  // nothing
});

describe("validateProfileInput", () => {
  it("accepts a valid name + DOB", () => {
    const r = validateProfileInput({ name: "נועה כהן", dateOfBirth: "2008-03-15" });
    expect(r.ok).toBe(true);
    expect(r.fieldErrors).toEqual({});
  });

  it("rejects name shorter than 2 chars", () => {
    const r = validateProfileInput({ name: "א", dateOfBirth: "" });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.name).toContain("2 תווים");
  });

  it("accepts empty dateOfBirth (optional)", () => {
    const r = validateProfileInput({ name: "נועה", dateOfBirth: "" });
    expect(r.ok).toBe(true);
  });

  it("rejects malformed dateOfBirth", () => {
    const r = validateProfileInput({ name: "נועה", dateOfBirth: "15-03-2008" });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.dateOfBirth).toBe("תאריך לידה לא תקין.");
  });

  it("rejects future dateOfBirth", () => {
    const future = "9999-12-31";
    const r = validateProfileInput({ name: "נועה", dateOfBirth: future });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.dateOfBirth).toContain("בעבר");
  });
});

describe("runUpdateProfile", () => {
  it("updates name + dateOfBirth on the users row", async () => {
    const result = await runUpdateProfile(
      makeFormData({ name: "נועה החדשה", dateOfBirth: "2008-03-15" }),
      { db: makeFakeDb(state), userId: USER_ID, logger: silentLogger },
    );
    expect(result.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
    const updateValues = state.updates[0]!.values as Record<string, unknown>;
    expect(updateValues.name).toBe("נועה החדשה");
    expect(updateValues.dateOfBirth).toBe("2008-03-15");
    expect(updateValues.updatedByKind).toBe("user");
    expect(updateValues.updatedByActor).toBe(USER_ID);
  });

  it("writes null dateOfBirth when input is empty", async () => {
    await runUpdateProfile(
      makeFormData({ name: "נועה", dateOfBirth: "" }),
      { db: makeFakeDb(state), userId: USER_ID, logger: silentLogger },
    );
    const updateValues = state.updates[0]!.values as Record<string, unknown>;
    expect(updateValues.dateOfBirth).toBeNull();
  });

  it("returns fieldErrors when name is too short and does NOT call DB", async () => {
    const result = await runUpdateProfile(
      makeFormData({ name: "א", dateOfBirth: "" }),
      { db: makeFakeDb(state), userId: USER_ID, logger: silentLogger },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (!("fieldErrors" in result)) throw new Error("expected fieldErrors");
    expect(result.fieldErrors.name).toBeDefined();
    expect(state.updates).toHaveLength(0);
  });

  it("returns formError on DB exception (fail-VISIBLE — unlike read-side which fails open)", async () => {
    state.shouldThrow = new Error("Neon unreachable");
    const result = await runUpdateProfile(
      makeFormData({ name: "נועה", dateOfBirth: "" }),
      { db: makeFakeDb(state), userId: USER_ID, logger: silentLogger },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (!("formError" in result)) throw new Error("expected formError");
    expect(result.formError).toContain("אירעה שגיאה");
    expect(errorCalls).toHaveLength(1);
  });

  it("trims whitespace around the name before saving", async () => {
    await runUpdateProfile(
      makeFormData({ name: "  נועה  ", dateOfBirth: "" }),
      { db: makeFakeDb(state), userId: USER_ID, logger: silentLogger },
    );
    const updateValues = state.updates[0]!.values as Record<string, unknown>;
    expect(updateValues.name).toBe("נועה");
  });
});
