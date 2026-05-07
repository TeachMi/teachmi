/**
 * GovIlProvider — strategy interface for the gov.il deep-link surface.
 * MVP 1: StubGovIlProvider (simulated hand-off). MVP 2: real deep-link to
 * gov.il's Osek Zair registration + BL form 6101 (Stories 2.8, 2.9).
 *
 * Per AD-13 + research/technical-teachme-30min-onboarding-feasibility-2026-04-29.md:
 * TeachMe is NOT a Shaam מייצג. The wizard captures inputs client-side, builds the URL,
 * the tutor authenticates ON gov.il, and gov.il signals return via verifyReturnPayload.
 * No tax-file-opening API call from TeachMe servers.
 *
 * Selection via GOVIL_PROVIDER env-var.
 */

export interface OsekZairWizardPayload {
  fullName: string;
  idNumber: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  birthDate: string;
  email: string;
  /** Hebrew expected; gov.il uses Hebrew form fields. */
  address: string;
  /** Israeli activity codes (sing. ענף) the tutor declared in Phase 2 of the wizard. */
  activityCodes: string[];
  /** Tutor's expected first-year income, integer agorot. */
  expectedIncomeAgorot: number;
}

export interface BL6101WizardPayload {
  fullName: string;
  idNumber: string;
  email: string;
  /** 'married' | 'single' | 'divorced' | 'widowed' — passed through to gov.il fields. */
  familyStatus: string;
  /** ISO 8601 date string (YYYY-MM-DD) for the tutor's existing Osek registration. */
  existingOsekStartDate: string;
}

export interface ReturnPayloadVerificationResult {
  valid: boolean;
  /**
   * On a valid stub payload, mirrors the parsed contents (`{ token, kind, ts }`).
   * On invalid, undefined.
   */
  payload?: Record<string, unknown>;
}

export interface GovIlProvider {
  buildOsekZairUrl(payload: OsekZairWizardPayload): string;
  buildBL6101Url(payload: BL6101WizardPayload): string;
  verifyReturnPayload(rawPayload: string): ReturnPayloadVerificationResult;
}
