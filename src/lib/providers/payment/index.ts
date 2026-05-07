import { getProviderName } from "../../feature-flags/env-flags";
import { StubPaymentProvider } from "./stub";
import type { PaymentProvider } from "./types";

export type {
  CheckoutSession,
  CommissionSplit,
  CreateCheckoutSessionInput,
  Money,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookProcessingResult,
} from "./types";

export function getPaymentProvider(): PaymentProvider {
  const name = getProviderName("payment");

  if (name === "stub") {
    return new StubPaymentProvider();
  }

  throw new Error(
    `PaymentProvider "${name}" is not yet implemented. PayMe Marketplace lands in Story 8.2 / FR44 / FR45.`,
  );
}
