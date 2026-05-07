import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookProcessingResult,
} from "./types";

/**
 * Deterministic no-money payment provider. IDs are seeded from input identifiers
 * so re-running flows in dev produces the same artifacts. Used by Sprint 0–5
 * feature stories ahead of the real PayMe wiring (Story 8.2).
 */
export class StubPaymentProvider implements PaymentProvider {
  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSession> {
    const splitSum = input.split.tutorAgorot + input.split.marketplaceAgorot;
    if (splitSum !== input.amount.amountAgorot) {
      throw new RangeError(
        `Commission split mismatch: tutorAgorot (${input.split.tutorAgorot}) + marketplaceAgorot (${input.split.marketplaceAgorot}) = ${splitSum}, expected amountAgorot (${input.amount.amountAgorot}).`,
      );
    }
    return {
      checkoutId: `stub-checkout-${input.bookingId}`,
      redirectUrl: `/dev/stub-checkout/${input.bookingId}`,
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
  }

  async processWebhook(
    rawPayload: string,
    signature: string,
  ): Promise<WebhookProcessingResult> {
    void signature;
    const parsed = parsePayload(rawPayload);
    return {
      eventId: parsed.eventId ?? "stub-event",
      bookingId: parsed.bookingId ?? "stub-booking",
      status: "succeeded",
      externalId: `stub-payment-${parsed.bookingId ?? "unknown"}`,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (input.amountAgorot <= 0) {
      throw new RangeError(
        `Refund amountAgorot must be positive; got ${input.amountAgorot}.`,
      );
    }
    return {
      refundId: `stub-refund-${input.paymentId}`,
      status: "succeeded",
    };
  }
}

interface ParsedStubPayload {
  eventId?: string;
  bookingId?: string;
}

function parsePayload(raw: string): ParsedStubPayload {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    return {
      eventId: typeof obj.eventId === "string" ? obj.eventId : undefined,
      bookingId: typeof obj.bookingId === "string" ? obj.bookingId : undefined,
    };
  } catch {
    return {};
  }
}
