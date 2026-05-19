// billing-address-flow.test.ts — Story 4.3 (2026-05-18).

import { describe, expect, it } from "vitest";
import {
  FakeTutorDb,
  silentLogger,
} from "../../../app/tutor/onboarding/profile/__tests__/fake-tutor-db";
import { auditEvents, billingAddresses } from "../../db/schema";
import {
  getBillingAddressForUser,
  upsertBillingAddress,
  type BillingAddressInput,
} from "../billing-address-flow";

const USER_ID = "11111111-2222-3333-4444-555555555555";

function makeDeps() {
  const db = new FakeTutorDb();
  return {
    db,
    deps: { db, userId: USER_ID, logger: silentLogger },
  };
}

function validInput(): BillingAddressInput {
  return {
    fullName: "נועה שמש",
    phone: "050-1234567",
    nationalId: "987654323",
    street: "רחוב הרצל 1",
    city: "תל אביב",
    zip: "6100000",
  };
}

describe("getBillingAddressForUser", () => {
  it("returns null when there's no saved row", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]);
    expect(await getBillingAddressForUser(deps)).toBeNull();
  });

  it("returns the saved row when one exists", async () => {
    const { db, deps } = makeDeps();
    const saved: BillingAddressInput = validInput();
    db.queueSelect([saved]);
    expect(await getBillingAddressForUser(deps)).toEqual(saved);
  });

  it("fails OPEN to null when the query throws", async () => {
    const { db, deps } = makeDeps();
    db.failNext = new Error("Neon outage");
    expect(await getBillingAddressForUser(deps)).toBeNull();
  });
});

describe("upsertBillingAddress — validation", () => {
  it("returns fieldErrors when any required field is empty", async () => {
    const { deps } = makeDeps();
    const result = await upsertBillingAddress(
      { ...validInput(), city: "  " },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.city).toBeDefined();
  });

  it("trims whitespace before validation", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]); // no existing row → INSERT path

    const result = await upsertBillingAddress(
      {
        ...validInput(),
        fullName: "  נועה שמש  ",
      },
      deps,
    );
    expect(result.ok).toBe(true);

    const insert = db.operations.find(
      (op) => op.kind === "insert" && op.table === billingAddresses,
    );
    expect(insert).toBeDefined();
    const value = (insert as { kind: "insert"; value: Record<string, unknown> }).value;
    expect(value.fullName).toBe("נועה שמש"); // trimmed
  });
});

describe("upsertBillingAddress — create path", () => {
  it("INSERTs when no row exists, then audits with .created event", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]); // SELECT returns nothing → INSERT path

    const result = await upsertBillingAddress(validInput(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);

    const insertTables = db.operations
      .filter((op) => op.kind === "insert")
      .map((op) => op.table);
    expect(insertTables).toEqual([billingAddresses, auditEvents]);

    const auditInsert = db.operations.find(
      (op) => op.kind === "insert" && op.table === auditEvents,
    );
    const value = (auditInsert as { kind: "insert"; value: Record<string, unknown> }).value;
    expect(value.eventType).toBe("billing_address.created");
  });
});

describe("upsertBillingAddress — update path", () => {
  it("UPDATEs when a row exists, then audits with .updated event", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([{ id: "existing-row-id" }]);

    const result = await upsertBillingAddress(validInput(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);

    // One UPDATE on billingAddresses + one INSERT on auditEvents.
    const updates = db.operations.filter((op) => op.kind === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe(billingAddresses);

    const auditInsert = db.operations.find(
      (op) => op.kind === "insert" && op.table === auditEvents,
    );
    const value = (auditInsert as { kind: "insert"; value: Record<string, unknown> }).value;
    expect(value.eventType).toBe("billing_address.updated");
  });
});
