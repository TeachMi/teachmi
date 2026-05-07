import { devEmailOutbox, type NewDevEmailOutbox } from "../../db/schema";
import type {
  EmailProvider,
  MarketingEmail,
  SendResult,
  TransactionalEmail,
} from "./types";

/**
 * Minimal database surface the stub needs. Mirrors the Drizzle insert shape
 * without coupling tests to a real Neon connection (see audit.ts pattern).
 */
interface InsertValues<TValue> {
  values(value: TValue): Promise<unknown> | unknown;
}

export interface OutboxDb {
  insert(table: typeof devEmailOutbox): InsertValues<NewDevEmailOutbox>;
}

export interface StubEmailLogger {
  log(payload: Record<string, unknown>): void;
}

const defaultLogger: StubEmailLogger = {
  log(payload) {
    console.log(JSON.stringify(payload));
  },
};

/**
 * Logs every email to the console as one-line JSON and writes a row to
 * `_dev_email_outbox` for visibility during dev/preview. Empty in prod because
 * EMAIL_PROVIDER=resend swaps the Stub out at MVP 2 cutover.
 */
export class StubEmailProvider implements EmailProvider {
  private readonly db: OutboxDb;
  private readonly logger: StubEmailLogger;

  constructor(db: OutboxDb, logger: StubEmailLogger = defaultLogger) {
    this.db = db;
    this.logger = logger;
  }

  async sendTransactional(input: TransactionalEmail): Promise<SendResult> {
    return this.record("transactional", input, null);
  }

  async sendMarketingWithConsentReceipt(input: MarketingEmail): Promise<SendResult> {
    if (input.consentReceiptRef.trim() === "") {
      throw new Error(
        "Marketing email requires a non-empty consentReceiptRef pointing at a row in consent_receipts.",
      );
    }
    return this.record("marketing", input, input.consentReceiptRef);
  }

  private async record(
    kind: "transactional" | "marketing",
    input: TransactionalEmail,
    consentReceiptRef: string | null,
  ): Promise<SendResult> {
    await this.db.insert(devEmailOutbox).values({
      kind,
      toAddress: input.toAddress,
      subject: input.subject,
      templateId: input.templateId,
      payload: input.payload,
      consentReceiptRef,
    });

    this.logger.log({
      kind,
      to: input.toAddress,
      subject: input.subject,
      templateId: input.templateId,
    });

    return {
      messageId: `stub-emit-${input.templateId}-${input.toAddress}`,
      kind,
    };
  }
}
