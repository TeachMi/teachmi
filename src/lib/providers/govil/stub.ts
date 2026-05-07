import type {
  BL6101WizardPayload,
  GovIlProvider,
  OsekZairWizardPayload,
  ReturnPayloadVerificationResult,
} from "./types";

const STUB_OSEK_BASE = "https://stub.gov.il/osek-zair";
const STUB_BL_BASE = "https://stub.gov.il/bl-form-6101";

/**
 * Simulated gov.il hand-off. Builds deterministic URLs encoding a base64 token of
 * the wizard payload — no real gov.il call. Real deep-link wiring lands in Stories
 * 2.8 (Osek Zair) and 2.9 (BL form 6101).
 */
export class StubGovIlProvider implements GovIlProvider {
  buildOsekZairUrl(payload: OsekZairWizardPayload): string {
    return buildStubUrl(STUB_OSEK_BASE, "osek-zair", payload as unknown as Record<string, unknown>);
  }

  buildBL6101Url(payload: BL6101WizardPayload): string {
    return buildStubUrl(STUB_BL_BASE, "bl-6101", payload as unknown as Record<string, unknown>);
  }

  verifyReturnPayload(rawPayload: string): ReturnPayloadVerificationResult {
    if (!rawPayload.startsWith("stub-")) {
      return { valid: false };
    }

    try {
      const body = rawPayload.slice("stub-".length);
      const decoded = decodeBase64Url(body);
      const parsed: unknown = JSON.parse(decoded);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { valid: false };
      }
      return { valid: true, payload: parsed as Record<string, unknown> };
    } catch {
      return { valid: false };
    }
  }
}

function buildStubUrl(
  base: string,
  kind: string,
  payload: Record<string, unknown>,
): string {
  const token = `stub-${encodeBase64Url(
    JSON.stringify({ kind, ts: 0, payload }),
  )}`;
  return `${base}?token=${token}`;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}
