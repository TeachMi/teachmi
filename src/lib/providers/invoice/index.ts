import { getProviderName } from "../../feature-flags/env-flags";
import { StubInvoiceProvider } from "./stub";
import type { InvoiceProvider } from "./types";

export type {
  DocFinalizationWebhookInput,
  DocFinalizationWebhookResult,
  FourDocSetInput,
  FourDocSetResult,
  InvoiceProvider,
  RefundCreditNoteInput,
  RefundCreditNoteResult,
} from "./types";

export function getInvoiceProvider(): InvoiceProvider {
  const name = getProviderName("invoice");

  if (name === "stub") {
    return new StubInvoiceProvider();
  }

  throw new Error(
    `InvoiceProvider "${name}" is not yet implemented. Green Invoice lands in Story 8.1 (per-tutor business provisioning) + Story 8.3 (4-doc issuance workflow).`,
  );
}
