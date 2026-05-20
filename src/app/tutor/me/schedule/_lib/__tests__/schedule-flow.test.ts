import { describe, expect, it } from "vitest";
import {
  auditEvents,
  bookings,
  payments,
  tutorAvailability,
} from "../../../../../../lib/db/schema";
import {
  FakeTutorDb,
  silentLogger,
} from "../../../../onboarding/profile/__tests__/fake-tutor-db";
import {
  runBulkRemoveRecurring,
  runBulkUpdateExceptions,
  runBulkUpdateRecurring,
  runResetAllAvailability,
  runToggleException,
  runToggleRecurringSlot,
  SLOTS_PER_DAY,
  slotTimes,
} from "../schedule-flow";

const TUTOR_ID = "00000000-0000-0000-0000-000000000001";
const NEW_ROW_ID = "av-1";

function makeDeps() {
  const db = new FakeTutorDb();
  return {
    db,
    deps: {
      db,
      tutorUserId: TUTOR_ID,
      now: () => new Date("2026-05-17T10:00:00.000Z"),
      logger: silentLogger,
    },
  };
}

// ---------------------------------------------------------------------------
// slotTimes + grid constants
// ---------------------------------------------------------------------------

describe("slotTimes / SLOTS_PER_DAY (grid bounds)", () => {
  it("first slot is 08:00–08:30, last is 22:30–23:00 (Sally + founder 2026-05-18 — expanded window)", () => {
    expect(slotTimes(0)).toEqual({ startTime: "08:00:00", endTime: "08:30:00" });
    expect(slotTimes(SLOTS_PER_DAY - 1)).toEqual({
      startTime: "22:30:00",
      endTime: "23:00:00",
    });
    expect(SLOTS_PER_DAY).toBe(30);
  });

  it("rejects out-of-range slotIdx", () => {
    expect(() => slotTimes(-1)).toThrow();
    expect(() => slotTimes(SLOTS_PER_DAY)).toThrow();
    expect(() => slotTimes(0.5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// runToggleRecurringSlot — INSERT path
// ---------------------------------------------------------------------------

describe("runToggleRecurringSlot — INSERT path", () => {
  it("empty cell → INSERT row + audit row, ok=true", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]); // existing lookup returns no rows
    db.queueReturning([{ id: NEW_ROW_ID }]);

    const result = await runToggleRecurringSlot(
      { weekday: 1, slotIdx: 0 },
      deps,
    );
    expect(result.ok).toBe(true);

    const availInserts = db.insertedInto(tutorAvailability);
    expect(availInserts).toHaveLength(1);
    expect(availInserts[0]!.value).toMatchObject({
      tutorUserId: TUTOR_ID,
      kind: "recurring",
      weekday: 1,
      date: null,
      startTime: "08:00:00",
      endTime: "08:30:00",
      validFrom: null,
      validUntil: null,
    });

    const auditInserts = db.insertedInto(auditEvents);
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]!.value).toMatchObject({
      eventType: "tutor.availability_recurring_added",
      actorKind: "user",
      actorId: TUTOR_ID,
      targetId: NEW_ROW_ID,
    });
  });

  it("audit row is written AFTER the INSERT (sequential-writes order)", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]);
    db.queueReturning([{ id: NEW_ROW_ID }]);

    await runToggleRecurringSlot({ weekday: 0, slotIdx: 5 }, deps);

    expect(db.operations).toHaveLength(2);
    expect(db.operations[0]).toMatchObject({
      kind: "insert",
      table: tutorAvailability,
    });
    expect(db.operations[1]).toMatchObject({
      kind: "insert",
      table: auditEvents,
    });
  });
});

// ---------------------------------------------------------------------------
// runToggleRecurringSlot — DELETE path
// ---------------------------------------------------------------------------

describe("runToggleRecurringSlot — DELETE path", () => {
  it("existing cell → DELETE row + audit row, ok=true", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([{ id: "existing-row-id" }]);

    const result = await runToggleRecurringSlot(
      { weekday: 2, slotIdx: 3 },
      deps,
    );
    expect(result.ok).toBe(true);

    expect(db.deletedFrom(tutorAvailability)).toHaveLength(1);

    const audit = db.insertedInto(auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.value).toMatchObject({
      eventType: "tutor.availability_recurring_removed",
      targetId: "existing-row-id",
    });
  });

  it("delete fires BEFORE the audit insert", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([{ id: "to-delete" }]);

    await runToggleRecurringSlot({ weekday: 3, slotIdx: 7 }, deps);

    expect(db.operations[0]).toMatchObject({
      kind: "delete",
      table: tutorAvailability,
    });
    expect(db.operations[1]).toMatchObject({
      kind: "insert",
      table: auditEvents,
    });
  });
});

// ---------------------------------------------------------------------------
// runToggleRecurringSlot — input validation
// ---------------------------------------------------------------------------

describe("runToggleRecurringSlot — validation", () => {
  it("invalid weekday → formError, no DB writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runToggleRecurringSlot(
      { weekday: 7, slotIdx: 0 },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toContain("יום");
    expect(db.operations).toEqual([]);
  });

  it("invalid slotIdx → formError, no DB writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runToggleRecurringSlot(
      { weekday: 0, slotIdx: 99 },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toContain("משבצת");
    expect(db.operations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runToggleException
// ---------------------------------------------------------------------------

describe("runToggleException — INSERT path", () => {
  it("creates exception_blocked row with the right date + audit", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]);
    db.queueReturning([{ id: NEW_ROW_ID }]);

    const result = await runToggleException(
      { dateIso: "2026-06-15", slotIdx: 4, kind: "exception_blocked" },
      deps,
    );
    expect(result.ok).toBe(true);

    const inserts = db.insertedInto(tutorAvailability);
    // slotIdx 4 in the new 8:00 start = 8:00 + 4×30min = 10:00.
    expect(inserts[0]!.value).toMatchObject({
      kind: "exception_blocked",
      weekday: null,
      date: "2026-06-15",
      startTime: "10:00:00",
      endTime: "10:30:00",
    });

    const audit = db.insertedInto(auditEvents);
    expect(audit[0]!.value).toMatchObject({
      eventType: "tutor.availability_exception_added",
    });
  });

  it("creates exception_available row", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]);
    db.queueReturning([{ id: NEW_ROW_ID }]);

    const result = await runToggleException(
      { dateIso: "2026-06-20", slotIdx: 0, kind: "exception_available" },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.insertedInto(tutorAvailability)[0]!.value).toMatchObject({
      kind: "exception_available",
      date: "2026-06-20",
    });
  });

  it("invalid date format → formError, no writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runToggleException(
      { dateIso: "06/15/2026", slotIdx: 0, kind: "exception_blocked" },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toContain("תאריך");
    expect(db.operations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runBulkRemoveRecurring
// ---------------------------------------------------------------------------

describe("runBulkRemoveRecurring", () => {
  it("block weekend → single DELETE with weekdays=[5,6] + bulk audit row", async () => {
    const { db, deps } = makeDeps();

    const result = await runBulkRemoveRecurring({ weekdays: [5, 6] }, deps);
    expect(result.ok).toBe(true);

    expect(db.deletedFrom(tutorAvailability)).toHaveLength(1);
    const audit = db.insertedInto(auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.value).toMatchObject({
      eventType: "tutor.availability_bulk_cleared",
      payload: { scope: "recurring", weekdays: [5, 6] },
    });
  });

  it("dedupes + filters invalid weekdays", async () => {
    const { db, deps } = makeDeps();
    const result = await runBulkRemoveRecurring(
      { weekdays: [5, 5, 6, 99, -1] },
      deps,
    );
    expect(result.ok).toBe(true);
    const audit = db.insertedInto(auditEvents);
    expect(audit[0]!.value).toMatchObject({
      payload: { scope: "recurring", weekdays: [5, 6] },
    });
  });

  it("empty input → formError, no writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runBulkRemoveRecurring({ weekdays: [-1, 99] }, deps);
    expect(result.ok).toBe(false);
    expect(db.operations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runResetAllAvailability
// ---------------------------------------------------------------------------

describe("runResetAllAvailability", () => {
  it("DELETE all + single bulk audit row", async () => {
    const { db, deps } = makeDeps();
    const result = await runResetAllAvailability(deps);
    expect(result.ok).toBe(true);

    expect(db.deletedFrom(tutorAvailability)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)[0]!.value).toMatchObject({
      eventType: "tutor.availability_bulk_cleared",
      payload: { scope: "all" },
    });
  });
});

// ---------------------------------------------------------------------------
// runBulkUpdateRecurring (Sally's drag-paint + batched save)
// ---------------------------------------------------------------------------

describe("runBulkUpdateRecurring — add/remove batching", () => {
  it("empty input → ok, no DB writes (no-op)", async () => {
    const { db, deps } = makeDeps();
    const result = await runBulkUpdateRecurring(
      { addCells: [], removeCells: [] },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.operations).toEqual([]);
  });

  it("only adds → N inserts + ONE audit row (in that order)", async () => {
    const { db, deps } = makeDeps();
    // Three idempotent existence-checks all return empty so all three add.
    db.queueSelect([]); db.queueSelect([]); db.queueSelect([]);

    const result = await runBulkUpdateRecurring(
      {
        addCells: [
          { weekday: 0, slotIdx: 0 },
          { weekday: 1, slotIdx: 5 },
          { weekday: 2, slotIdx: 13 },
        ],
        removeCells: [],
      },
      deps,
    );
    expect(result.ok).toBe(true);

    const availInserts = db.insertedInto(tutorAvailability);
    expect(availInserts).toHaveLength(3);

    const audit = db.insertedInto(auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.value).toMatchObject({
      eventType: "tutor.availability_recurring_bulk_updated",
      payload: { addedCount: 3, removedCount: 0 },
    });

    // Audit row fires AFTER all the adds (sequential-writes order).
    const auditIdx = db.operations.findIndex(
      (op) => op.kind === "insert" && op.table === auditEvents,
    );
    const lastAvailInsertIdx =
      db.operations.map((op, i) =>
        op.kind === "insert" && op.table === tutorAvailability ? i : -1,
      ).filter((i) => i !== -1).pop() ?? -1;
    expect(auditIdx).toBeGreaterThan(lastAvailInsertIdx);
  });

  it("only removes → N deletes + ONE audit row", async () => {
    const { db, deps } = makeDeps();
    // Two existence-checks return matching ids so both delete.
    db.queueSelect([{ id: "row-a" }]);
    db.queueSelect([{ id: "row-b" }]);

    const result = await runBulkUpdateRecurring(
      {
        addCells: [],
        removeCells: [
          { weekday: 0, slotIdx: 0 },
          { weekday: 1, slotIdx: 0 },
        ],
      },
      deps,
    );
    expect(result.ok).toBe(true);

    expect(db.deletedFrom(tutorAvailability)).toHaveLength(2);
    expect(db.insertedInto(auditEvents)[0]!.value).toMatchObject({
      payload: { addedCount: 0, removedCount: 2 },
    });
  });

  it("mixed adds + removes in one batch", async () => {
    const { db, deps } = makeDeps();
    // Remove existence-check returns id; add existence-check returns empty.
    db.queueSelect([{ id: "to-remove" }]); // for the remove
    db.queueSelect([]); // for the add

    const result = await runBulkUpdateRecurring(
      {
        addCells: [{ weekday: 3, slotIdx: 0 }],
        removeCells: [{ weekday: 1, slotIdx: 0 }],
      },
      deps,
    );
    expect(result.ok).toBe(true);

    expect(db.deletedFrom(tutorAvailability)).toHaveLength(1);
    expect(db.insertedInto(tutorAvailability)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)[0]!.value).toMatchObject({
      payload: { addedCount: 1, removedCount: 1 },
    });
  });

  it("idempotent: add of an existing cell → no-op (no INSERT, no audit row)", async () => {
    const { db, deps } = makeDeps();
    // Existence-check finds the row → INSERT skipped.
    db.queueSelect([{ id: "existing" }]);

    const result = await runBulkUpdateRecurring(
      { addCells: [{ weekday: 0, slotIdx: 0 }], removeCells: [] },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.insertedInto(tutorAvailability)).toHaveLength(0);
    // No audit row since nothing actually moved.
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
  });

  it("idempotent: remove of a non-existent cell → no-op", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]); // existence-check returns empty → DELETE skipped

    const result = await runBulkUpdateRecurring(
      { addCells: [], removeCells: [{ weekday: 0, slotIdx: 0 }] },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.deletedFrom(tutorAvailability)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
  });

  it("invalid slotIdx in input → fail-fast formError, no writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runBulkUpdateRecurring(
      { addCells: [{ weekday: 0, slotIdx: 99 }], removeCells: [] },
      deps,
    );
    expect(result.ok).toBe(false);
    expect(db.operations).toEqual([]);
  });

  it("invalid weekday in input → fail-fast", async () => {
    const { db, deps } = makeDeps();
    const result = await runBulkUpdateRecurring(
      { addCells: [], removeCells: [{ weekday: 7, slotIdx: 0 }] },
      deps,
    );
    expect(result.ok).toBe(false);
    expect(db.operations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runBulkUpdateExceptions (Tab 2 drag-paint + Save model)
// ---------------------------------------------------------------------------

describe("runBulkUpdateExceptions — add/remove batching", () => {
  it("empty input → ok, no DB writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runBulkUpdateExceptions(
      { addCells: [], removeCells: [] },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.operations).toEqual([]);
  });

  it("mixed adds + removes across two dates", async () => {
    const { db, deps } = makeDeps();
    // 1 remove existence-check returns id; 1 add existence-check empty.
    db.queueSelect([{ id: "remove-me" }]);
    db.queueSelect([]);

    const result = await runBulkUpdateExceptions(
      {
        addCells: [
          {
            dateIso: "2026-06-15",
            slotIdx: 0,
            kind: "exception_available",
          },
        ],
        removeCells: [
          {
            dateIso: "2026-06-16",
            slotIdx: 4,
            kind: "exception_blocked",
          },
        ],
      },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.deletedFrom(tutorAvailability)).toHaveLength(1);
    expect(db.insertedInto(tutorAvailability)).toHaveLength(1);
    const audit = db.insertedInto(auditEvents);
    expect(audit[0]!.value).toMatchObject({
      eventType: "tutor.availability_exceptions_bulk_updated",
      payload: { addedCount: 1, removedCount: 1 },
    });
  });

  it("idempotent: add of an existing exception is a no-op", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([{ id: "already-there" }]);

    const result = await runBulkUpdateExceptions(
      {
        addCells: [
          {
            dateIso: "2026-06-15",
            slotIdx: 0,
            kind: "exception_blocked",
          },
        ],
        removeCells: [],
      },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.insertedInto(tutorAvailability)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(0);
  });

  it("invalid date format → fail-fast, no writes", async () => {
    const { db, deps } = makeDeps();
    const result = await runBulkUpdateExceptions(
      {
        addCells: [
          {
            dateIso: "15/06/2026",
            slotIdx: 0,
            kind: "exception_blocked",
          },
        ],
        removeCells: [],
      },
      deps,
    );
    expect(result.ok).toBe(false);
    expect(db.operations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Area 1 (2026-05-19) — orphan-and-leave invariant.
//
// Founder + party-mode decision: editing a recurring rule that already
// has bookings under it MUST leave the bookings alone. Per Winston's
// architecture guardrail, this is the load-bearing invariant of the
// rule/reality split — the rule table and the bookings table live in
// separate transactional domains, and `runBulkUpdateRecurring` must NEVER
// touch the bookings table (or its sibling payments table) under any
// input, even when the rule edit covers cells with active bookings under
// them.
//
// The regression here catches future refactors that try to be "helpful"
// (e.g. auto-cancel orphan bookings on rule removal). If that becomes a
// product decision, this test fires as a sentinel.
// ---------------------------------------------------------------------------

describe("runBulkUpdateRecurring — orphan-and-leave invariant", () => {
  it("removing a rule with bookings under it never writes to bookings or payments", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([{ id: "row-to-remove" }]);

    const result = await runBulkUpdateRecurring(
      {
        addCells: [],
        removeCells: [{ weekday: 2, slotIdx: 10 }], // Tue 13:00
      },
      deps,
    );
    expect(result.ok).toBe(true);

    // Hard invariant: NO writes to bookings or payments. Ever. Under any
    // schedule-rule mutation.
    expect(db.insertedInto(bookings)).toHaveLength(0);
    expect(db.updatedAt(bookings)).toHaveLength(0);
    expect(db.deletedFrom(bookings)).toHaveLength(0);
    expect(db.insertedInto(payments)).toHaveLength(0);
    expect(db.updatedAt(payments)).toHaveLength(0);
    expect(db.deletedFrom(payments)).toHaveLength(0);

    // And no reads from bookings either — the orchestrator must NEVER
    // even look at the bookings table. The FakeTutorDb has a single
    // select queue, so the orchestrator can only have consumed the one
    // select we pre-queued (the existence check on tutor_availability).
    expect(db.selectQueue).toEqual([]);
  });

  it("adding a rule never writes to bookings or payments", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]); // existence-check empty → INSERT path

    const result = await runBulkUpdateRecurring(
      {
        addCells: [{ weekday: 3, slotIdx: 6 }], // Wed 11:00
        removeCells: [],
      },
      deps,
    );
    expect(result.ok).toBe(true);

    expect(db.insertedInto(bookings)).toHaveLength(0);
    expect(db.updatedAt(bookings)).toHaveLength(0);
    expect(db.deletedFrom(bookings)).toHaveLength(0);
    expect(db.insertedInto(payments)).toHaveLength(0);
    expect(db.updatedAt(payments)).toHaveLength(0);
    expect(db.deletedFrom(payments)).toHaveLength(0);
  });

  it("mixed adds + removes never touches bookings/payments", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([{ id: "to-remove" }]);
    db.queueSelect([]);

    const result = await runBulkUpdateRecurring(
      {
        addCells: [{ weekday: 3, slotIdx: 0 }],
        removeCells: [{ weekday: 1, slotIdx: 0 }],
      },
      deps,
    );
    expect(result.ok).toBe(true);

    expect(db.insertedInto(bookings)).toHaveLength(0);
    expect(db.updatedAt(bookings)).toHaveLength(0);
    expect(db.deletedFrom(bookings)).toHaveLength(0);
    expect(db.insertedInto(payments)).toHaveLength(0);
    expect(db.updatedAt(payments)).toHaveLength(0);
    expect(db.deletedFrom(payments)).toHaveLength(0);
  });
});

describe("runBulkUpdateExceptions — orphan-and-leave invariant", () => {
  it("exception updates never write to bookings or payments", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect([]); // for the add existence-check

    const result = await runBulkUpdateExceptions(
      {
        addCells: [
          {
            dateIso: "2026-06-15",
            slotIdx: 4,
            kind: "exception_blocked",
          },
        ],
        removeCells: [],
      },
      deps,
    );
    expect(result.ok).toBe(true);

    expect(db.insertedInto(bookings)).toHaveLength(0);
    expect(db.updatedAt(bookings)).toHaveLength(0);
    expect(db.deletedFrom(bookings)).toHaveLength(0);
    expect(db.insertedInto(payments)).toHaveLength(0);
    expect(db.updatedAt(payments)).toHaveLength(0);
    expect(db.deletedFrom(payments)).toHaveLength(0);
  });
});
