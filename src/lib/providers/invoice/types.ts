/**
 * InvoiceProvider — strategy interface for the Tax-Authority Ruling 3956/16 4-doc flow.
 * MVP 1: StubInvoiceProvider (no real docs). MVP 2: Green Invoice (Story 8.1 / 8.3).
 * Selection via INVOICE_PROVIDER env-var.
 */

export interface FourDocSetInput {
  /** Application-side transaction id (uuid recommended). */
  transactionId: string;
  /** Tutor's per-tutor Green Invoice business id. Stub ignores it. */
  tutorBusinessId: string;
  studentName: string;
  studentEmail: string;
  /** Integer agorot, customer-paid total. */
  totalAgorot: number;
  /** Integer agorot, marketplace commission carved out of the total. */
  commissionAgorot: number;
  /** Free-form line description. Hebrew expected (Israel-only product). */
  description: string;
}

/**
 * The four documents per Ruling 3956/16:
 *   - customerReceipt — marketplace → student, the receipt customer sees
 *   - transactionInvoice — tutor → student, taxable invoice
 *   - commissionTaxInvoice — marketplace → tutor, commission as tax invoice
 *   - commissionReceipt — tutor → marketplace, receipt that closes the commission flow
 */
export interface FourDocSetResult {
  customerReceiptId: string;
  transactionInvoiceId: string;
  commissionTaxInvoiceId: string;
  commissionReceiptId: string;
}

export interface RefundCreditNoteInput {
  refundId: string;
  /** The invoice id being credited (from the original 4-doc set). */
  originalInvoiceId: string;
  amountAgorot: number;
  reason: string;
}

export interface RefundCreditNoteResult {
  creditNoteId: string;
}

export interface DocFinalizationWebhookInput {
  rawPayload: string;
  signature: string;
}

export interface DocFinalizationWebhookResult {
  acknowledged: boolean;
  /** Document id reported by the vendor as finalized; absent on acknowledgement-only events. */
  finalizedDocId?: string;
}

export interface InvoiceProvider {
  issue4DocSet(input: FourDocSetInput): Promise<FourDocSetResult>;
  issueRefundCreditNote(
    input: RefundCreditNoteInput,
  ): Promise<RefundCreditNoteResult>;
  processDocFinalizationWebhook(
    input: DocFinalizationWebhookInput,
  ): Promise<DocFinalizationWebhookResult>;
}
