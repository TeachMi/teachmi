import { getProviderName } from "../../feature-flags/env-flags";
import { StubGovIlProvider } from "./stub";
import type { GovIlProvider } from "./types";

export type {
  BL6101WizardPayload,
  GovIlProvider,
  OsekZairWizardPayload,
  ReturnPayloadVerificationResult,
} from "./types";

export function getGovIlProvider(): GovIlProvider {
  const name = getProviderName("govil");

  if (name === "stub") {
    return new StubGovIlProvider();
  }

  throw new Error(
    `GovIlProvider "${name}" is not yet implemented. Real gov.il deep-link wiring lands in Story 2.8 (Osek Zair full) and Story 2.9 (BL form 6101 full).`,
  );
}
