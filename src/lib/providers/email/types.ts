/**
 * EmailProvider — strategy interface for outbound email.
 * MVP 1: StubEmailProvider (logs + writes to _dev_email_outbox). MVP 2: Resend
 * (Story 6.1) per AR-31; multi-channel orchestration shim if WhatsApp lands at
 * MVP 2 (gated on ED-03).
 *
 * Selection via EMAIL_PROVIDER env-var.
 *
 * NOTE on consent receipts (FR60): the marketing send accepts an already-issued
 * consent-receipt id. Persisting consent receipts to the `consent_receipts`
 * table is Story 1.22's responsibility, not this layer.
 */

export interface TransactionalEmail {
  toAddress: string;
  /** Already-localized subject. Hebrew-RTL email templates per UX-DR33. */
  subject: string;
  /** Identifier of a React Email template, resolved by the Full provider in Story 6.1. */
  templateId: string;
  /** Variables passed into the template render. */
  payload: Record<string, unknown>;
}

export interface MarketingEmail extends TransactionalEmail {
  /**
   * Reference to a row in `consent_receipts` proving the recipient opted in.
   * Stub records this verbatim; Full provider verifies it's still active.
   */
  consentReceiptRef: string;
}

export interface SendResult {
  /** Provider-side message id (stub-emit-... in dev, Resend's id in prod). */
  messageId: string;
  /** Mirrors the kind so consumers can assert without re-checking the call site. */
  kind: "transactional" | "marketing";
}

export interface EmailProvider {
  sendTransactional(input: TransactionalEmail): Promise<SendResult>;
  sendMarketingWithConsentReceipt(input: MarketingEmail): Promise<SendResult>;
}
