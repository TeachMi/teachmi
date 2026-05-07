import { describe, expect, it } from "vitest";
import { StubPaymentProvider } from "../stub";

describe("StubPaymentProvider", () => {
  const provider = new StubPaymentProvider();

  describe("createCheckoutSession", () => {
    it("returns deterministic IDs seeded from the booking ID", async () => {
      const session = await provider.createCheckoutSession({
        bookingId: "booking-42",
        amount: { amountAgorot: 18000, currency: "ILS" },
        split: { tutorAgorot: 16000, marketplaceAgorot: 2000 },
      });

      expect(session.checkoutId).toBe("stub-checkout-booking-42");
      expect(session.redirectUrl).toBe("/dev/stub-checkout/booking-42");
      expect(session.expiresAt).toBe("2099-01-01T00:00:00.000Z");
    });

    it("produces identical output for identical input across calls", async () => {
      const a = await provider.createCheckoutSession({
        bookingId: "b1",
        amount: { amountAgorot: 100, currency: "ILS" },
        split: { tutorAgorot: 90, marketplaceAgorot: 10 },
      });
      const b = await provider.createCheckoutSession({
        bookingId: "b1",
        amount: { amountAgorot: 100, currency: "ILS" },
        split: { tutorAgorot: 90, marketplaceAgorot: 10 },
      });
      expect(a).toEqual(b);
    });

    it("throws RangeError when commission split does not sum to amount", async () => {
      await expect(
        provider.createCheckoutSession({
          bookingId: "b1",
          amount: { amountAgorot: 100, currency: "ILS" },
          split: { tutorAgorot: 90, marketplaceAgorot: 5 }, // sums to 95, not 100
        }),
      ).rejects.toThrowError(/Commission split mismatch/);
    });
  });

  describe("processWebhook", () => {
    it("returns a successful result keyed off the parsed booking ID", async () => {
      const result = await provider.processWebhook(
        JSON.stringify({ eventId: "evt-1", bookingId: "booking-99" }),
        "stub-signature",
      );

      expect(result).toEqual({
        eventId: "evt-1",
        bookingId: "booking-99",
        status: "succeeded",
        externalId: "stub-payment-booking-99",
      });
    });

    it("falls back to placeholder identifiers when the payload is unparseable", async () => {
      const result = await provider.processWebhook("not-json", "sig");
      expect(result.status).toBe("succeeded");
      expect(result.eventId).toBe("stub-event");
      expect(result.bookingId).toBe("stub-booking");
    });

    it("falls back to placeholders when payload is JSON 'null', an array, or a primitive", async () => {
      for (const raw of ["null", "42", "[1,2,3]", '"a-string"']) {
        const result = await provider.processWebhook(raw, "sig");
        expect(result.status).toBe("succeeded");
        expect(result.eventId).toBe("stub-event");
        expect(result.bookingId).toBe("stub-booking");
      }
    });
  });

  describe("refund", () => {
    it("returns deterministic refund IDs seeded from the payment ID", async () => {
      const result = await provider.refund({
        paymentId: "pay-7",
        amountAgorot: 5000,
        reason: "tutor_cancelled",
      });

      expect(result).toEqual({
        refundId: "stub-refund-pay-7",
        status: "succeeded",
      });
    });

    it("throws RangeError when amountAgorot is zero or negative", async () => {
      await expect(
        provider.refund({ paymentId: "pay-1", amountAgorot: 0, reason: "x" }),
      ).rejects.toThrowError(/positive/);
      await expect(
        provider.refund({ paymentId: "pay-1", amountAgorot: -100, reason: "x" }),
      ).rejects.toThrowError(/positive/);
    });
  });
});
