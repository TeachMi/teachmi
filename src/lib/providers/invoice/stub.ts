import type {
  DocFinalizationWebhookInput,
  DocFinalizationWebhookResult,
  FourDocSetInput,
  FourDocSetResult,
  InvoiceProvider,
  RefundCreditNoteInput,
  RefundCreditNoteResult,
} from "./types";

/**
 * Deterministic stub of the Ruling 3956/16 4-doc flow. IDs are seeded from the
 * application-side transactionId so dev runs are reproducible. Does not call
 * Green Invoice; that wiring lives in Story 8.3.
 */
export class StubInvoiceProvider implements InvoiceProvider {
  async issue4DocSet(input: FourDocSetInput): Promise<FourDocSetResult> {
    if (input.totalAgorot <= 0) {
      throw new RangeError(
        `4-doc set totalAgorot must be positive; got ${input.totalAgorot}.`,
      );
    }
    if (input.commissionAgorot < 0 || input.commissionAgorot > input.totalAgorot) {
      throw new RangeError(
        `4-doc set commissionAgorot must be in [0, totalAgorot]; got ${input.commissionAgorot} with totalAgorot ${input.totalAgorot}.`,
      );
    }
    return {
      customerReceiptId: `stub-cr-${input.transactionId}`,
      transactionInvoiceId: `stub-ti-${input.transactionId}`,
      commissionTaxInvoiceId: `stub-cti-${input.transactionId}`,
      commissionReceiptId: `stub-cr2-${input.transactionId}`,
    };
  }

  async issueRefundCreditNote(
    input: RefundCreditNoteInput,
  ): Promise<RefundCreditNoteResult> {
    if (input.amountAgorot <= 0) {
      throw new RangeError(
        `Refund credit-note amountAgorot must be positive; got ${input.amountAgorot}.`,
      );
    }
    return {
      creditNoteId: `stub-cn-${input.refundId}`,
    };
  }

  async processDocFinalizationWebhook(
    input: DocFinalizationWebhookInput,
  ): Promise<DocFinalizationWebhookResult> {
    void input;
    return { acknowledged: true };
  }
}
