import { describe, expect, it } from "vitest";
import { StubInvoiceProvider } from "../stub";

describe("StubInvoiceProvider", () => {
  const provider = new StubInvoiceProvider();

  it("issue4DocSet returns four deterministic doc IDs seeded from transactionId", async () => {
    const docs = await provider.issue4DocSet({
      transactionId: "tx-100",
      tutorBusinessId: "biz-1",
      studentName: "ישראלה דוגמה",
      studentEmail: "student@example.com",
      totalAgorot: 18000,
      commissionAgorot: 2000,
      description: "שיעור מתמטיקה 60 דקות",
    });

    expect(docs).toEqual({
      customerReceiptId: "stub-cr-tx-100",
      transactionInvoiceId: "stub-ti-tx-100",
      commissionTaxInvoiceId: "stub-cti-tx-100",
      commissionReceiptId: "stub-cr2-tx-100",
    });
  });

  it("issue4DocSet throws when totalAgorot is zero or negative", async () => {
    await expect(
      provider.issue4DocSet({
        transactionId: "tx-bad",
        tutorBusinessId: "biz",
        studentName: "x",
        studentEmail: "x@y.com",
        totalAgorot: 0,
        commissionAgorot: 0,
        description: "d",
      }),
    ).rejects.toThrowError(/totalAgorot must be positive/);
  });

  it("issue4DocSet throws when commissionAgorot is out of range", async () => {
    await expect(
      provider.issue4DocSet({
        transactionId: "tx-bad",
        tutorBusinessId: "biz",
        studentName: "x",
        studentEmail: "x@y.com",
        totalAgorot: 1000,
        commissionAgorot: -1,
        description: "d",
      }),
    ).rejects.toThrowError(/commissionAgorot must be in/);

    await expect(
      provider.issue4DocSet({
        transactionId: "tx-bad",
        tutorBusinessId: "biz",
        studentName: "x",
        studentEmail: "x@y.com",
        totalAgorot: 1000,
        commissionAgorot: 1001,
        description: "d",
      }),
    ).rejects.toThrowError(/commissionAgorot must be in/);
  });

  it("issueRefundCreditNote returns a deterministic credit-note ID seeded from refundId", async () => {
    const result = await provider.issueRefundCreditNote({
      refundId: "ref-7",
      originalInvoiceId: "stub-ti-tx-100",
      amountAgorot: 18000,
      reason: "student_cancelled",
    });

    expect(result).toEqual({ creditNoteId: "stub-cn-ref-7" });
  });

  it("issueRefundCreditNote throws when amountAgorot is zero or negative", async () => {
    await expect(
      provider.issueRefundCreditNote({
        refundId: "ref-bad",
        originalInvoiceId: "inv",
        amountAgorot: 0,
        reason: "x",
      }),
    ).rejects.toThrowError(/positive/);
  });

  it("processDocFinalizationWebhook acknowledges any payload", async () => {
    const result = await provider.processDocFinalizationWebhook({
      rawPayload: "{}",
      signature: "stub-signature",
    });

    expect(result.acknowledged).toBe(true);
  });
});
