import { describe, expect, it } from "vitest";
import { auditEvents } from "../schema";
import { launchSubjects } from "../seed-data";
import { runWithAuditEvent } from "../audit";

const domainTable = Symbol("domain-table");

interface RecordedInsert {
  txId: symbol;
  table: unknown;
  value: unknown;
}

class FakeTransaction {
  readonly txId = Symbol("tx");
  readonly inserts: RecordedInsert[] = [];

  insert(table: unknown) {
    return {
      values: async (value: unknown): Promise<void> => {
        this.inserts.push({ txId: this.txId, table, value });
      },
    };
  }
}

class FakeDatabase {
  lastTransaction: FakeTransaction | null = null;

  async transaction<TResult>(callback: (transaction: FakeTransaction) => Promise<TResult>): Promise<TResult> {
    const transaction = new FakeTransaction();
    this.lastTransaction = transaction;
    return callback(transaction);
  }
}

describe("database audit helpers", () => {
  it("writes the domain row and audit row through the same transaction object", async () => {
    const database = new FakeDatabase();

    const result = await runWithAuditEvent(
      database,
      async (transaction) => {
        await transaction.insert(domainTable).values({ id: "booking-1" });
        return "created";
      },
      {
        eventType: "booking.created",
        actorKind: "user",
        actorId: "00000000-0000-0000-0000-000000000001",
        targetType: "booking",
        targetId: "00000000-0000-0000-0000-000000000002",
        payload: { status: "pending_payment" },
      },
    );

    expect(result).toBe("created");
    expect(database.lastTransaction?.inserts).toHaveLength(2);
    expect(database.lastTransaction?.inserts[0]?.table).toBe(domainTable);
    expect(database.lastTransaction?.inserts[1]?.table).toBe(auditEvents);
    expect(database.lastTransaction?.inserts[0]?.txId).toBe(database.lastTransaction?.txId);
    expect(database.lastTransaction?.inserts[1]?.txId).toBe(database.lastTransaction?.txId);
  });

  it("keeps the launch taxonomy at the locked 11 MVP subjects", () => {
    expect(launchSubjects).toHaveLength(11);
    expect(launchSubjects.map((subject) => subject.slug)).toEqual([
      "mathematics",
      "english",
      "hebrew-lashon",
      "psychometric",
      "statistics",
      "accounting",
      "economics",
      "computer-science",
      "physics",
      "chemistry",
      "biology",
    ]);
  });
});
