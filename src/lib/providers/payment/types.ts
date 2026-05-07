/**
 * PaymentProvider — strategy interface for payment-vendor integration.
 * MVP 1: StubPaymentProvider (no money). MVP 2: PayMe Marketplace (Story 8.2).
 * Selection via PAYMENTS_PROVIDER env-var.
 */

export interface Money {
  /** Integer agorot (smallest unit, ILS only at MVP). */
  amountAgorot: number;
  currency: "ILS";
}

export interface CommissionSplit {
  /** Tutor's share, integer agorot. */
  tutorAgorot: number;
  /** Marketplace's commission, integer agorot. */
  marketplaceAgorot: number;
}

export interface CreateCheckoutSessionInput {
  bookingId: string;
  amount: Money;
  split: CommissionSplit;
}

export interface CheckoutSession {
  checkoutId: string;
  redirectUrl: string;
  /** ISO 8601 UTC. Stub uses a deterministic placeholder; Full uses vendor-issued expiry. */
  expiresAt: string;
}

export interface WebhookProcessingResult {
  eventId: string;
  bookingId: string;
  status: "succeeded" | "failed" | "pending";
  /** Vendor-side payment identifier; the seam between TeachMe and PayMe. */
  externalId: string;
}

export interface RefundInput {
  paymentId: string;
  /** Integer agorot. Must be ≤ original payment amount. */
  amountAgorot: number;
  reason: string;
}

export interface RefundResult {
  refundId: string;
  status: "succeeded" | "failed" | "pending";
}

export interface PaymentProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  processWebhook(rawPayload: string, signature: string): Promise<WebhookProcessingResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}
