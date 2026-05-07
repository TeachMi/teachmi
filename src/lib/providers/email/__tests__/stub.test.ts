import { describe, expect, it } from "vitest";
import { devEmailOutbox, type NewDevEmailOutbox } from "../../../db/schema";
import { StubEmailProvider, type OutboxDb, type StubEmailLogger } from "../stub";

interface RecordedInsert {
  table: unknown;
  value: NewDevEmailOutbox;
}

class FakeOutboxDb implements OutboxDb {
  readonly inserts: RecordedInsert[] = [];

  insert(table: typeof devEmailOutbox) {
    return {
      values: async (value: NewDevEmailOutbox): Promise<void> => {
        this.inserts.push({ table, value });
      },
    };
  }
}

class CapturingLogger implements StubEmailLogger {
  readonly entries: Record<string, unknown>[] = [];
  log(payload: Record<string, unknown>): void {
    this.entries.push(payload);
  }
}

describe("StubEmailProvider", () => {
  it("sendTransactional logs a structured one-line entry and writes to _dev_email_outbox", async () => {
    const db = new FakeOutboxDb();
    const logger = new CapturingLogger();
    const provider = new StubEmailProvider(db, logger);

    const result = await provider.sendTransactional({
      toAddress: "student@example.com",
      subject: "אישור הזמנה",
      templateId: "booking_confirm",
      payload: { bookingId: "b1", lessonStart: "2026-05-09T17:00:00Z" },
    });

    expect(result).toEqual({
      messageId: "stub-emit-booking_confirm-student@example.com",
      kind: "transactional",
    });

    expect(logger.entries).toEqual([
      {
        kind: "transactional",
        to: "student@example.com",
        subject: "אישור הזמנה",
        templateId: "booking_confirm",
      },
    ]);

    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]?.table).toBe(devEmailOutbox);
    expect(db.inserts[0]?.value).toEqual({
      kind: "transactional",
      toAddress: "student@example.com",
      subject: "אישור הזמנה",
      templateId: "booking_confirm",
      payload: { bookingId: "b1", lessonStart: "2026-05-09T17:00:00Z" },
      consentReceiptRef: null,
    });
  });

  it("sendMarketingWithConsentReceipt persists the consent-receipt ref alongside the row", async () => {
    const db = new FakeOutboxDb();
    const logger = new CapturingLogger();
    const provider = new StubEmailProvider(db, logger);

    const result = await provider.sendMarketingWithConsentReceipt({
      toAddress: "tutor@example.com",
      subject: "עדכון פלטפורמה",
      templateId: "platform_news",
      payload: {},
      consentReceiptRef: "cr-abc-123",
    });

    expect(result.kind).toBe("marketing");
    expect(db.inserts[0]?.value.consentReceiptRef).toBe("cr-abc-123");
    expect(db.inserts[0]?.value.kind).toBe("marketing");
    expect(logger.entries[0]?.kind).toBe("marketing");
  });

  it("throws when consentReceiptRef is empty or whitespace-only", async () => {
    const db = new FakeOutboxDb();
    const logger = new CapturingLogger();
    const provider = new StubEmailProvider(db, logger);

    await expect(
      provider.sendMarketingWithConsentReceipt({
        toAddress: "x@y.com",
        subject: "s",
        templateId: "t",
        payload: {},
        consentReceiptRef: "",
      }),
    ).rejects.toThrowError(/non-empty consentReceiptRef/);

    await expect(
      provider.sendMarketingWithConsentReceipt({
        toAddress: "x@y.com",
        subject: "s",
        templateId: "t",
        payload: {},
        consentReceiptRef: "   ",
      }),
    ).rejects.toThrowError(/non-empty consentReceiptRef/);

    expect(db.inserts).toHaveLength(0);
    expect(logger.entries).toHaveLength(0);
  });

  it("logs only after a successful DB insert (no phantom log when insert throws)", async () => {
    class ThrowingOutboxDb implements OutboxDb {
      insert(_table: typeof devEmailOutbox) {
        return {
          values: async (_value: NewDevEmailOutbox): Promise<void> => {
            throw new Error("simulated insert failure");
          },
        };
      }
    }

    const db = new ThrowingOutboxDb();
    const logger = new CapturingLogger();
    const provider = new StubEmailProvider(db, logger);

    await expect(
      provider.sendTransactional({
        toAddress: "x@y.com",
        subject: "s",
        templateId: "t",
        payload: {},
      }),
    ).rejects.toThrowError(/simulated insert failure/);

    expect(logger.entries).toHaveLength(0);
  });

  it("does not write the email body into the console log", async () => {
    const db = new FakeOutboxDb();
    const logger = new CapturingLogger();
    const provider = new StubEmailProvider(db, logger);

    await provider.sendTransactional({
      toAddress: "x@y.com",
      subject: "subject",
      templateId: "tmpl",
      payload: { secretBody: "should-not-appear-in-log" },
    });

    expect(JSON.stringify(logger.entries)).not.toContain("should-not-appear-in-log");
  });
});
