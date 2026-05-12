// Pure orchestrator for the privacy-policy re-acceptance flow. Tested via the
// FakeDb pattern in `__tests__/accept-flow.test.ts`. Called from `actions.ts`
// (the thin "use server" wrapper) with real deps + the Next.js redirect.
//
// Story 1.21 AC4 + AC5. Fires when an existing user's most-recent
// consent_receipts row for documentType='privacy_policy' is older than
// CURRENT_PRIVACY_POLICY_VERSION (the gate at requirePrivacyConsent caught
// them on an authenticated route).

import { auditEvents, consentReceipts } from "../../../../lib/db/schema";
import { toAuditEventValues } from "../../../../lib/db/audit";
import { getSafeCallbackUrl } from "../../../../lib/auth/callback-url";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  fetchMostRecentPrivacyConsentReceipt,
  truncateUserAgent,
  type DbForPrivacyConsent,
} from "../../../../lib/legal/privacy-consent";
import type { AppRole } from "../../../../lib/auth/roles";
import type { AnalyticsEvent } from "../../../../lib/analytics";

export type AcceptFlowResult =
  | { ok: true; redirectTo: string }
  | { ok: false; formError: string };

interface InsertWithReturning<TReturning = unknown> extends Promise<unknown> {
  returning(columns: unknown): Promise<TReturning[]>;
}
interface InsertChain {
  values(value: unknown): InsertWithReturning;
}
export interface DbForAcceptFlow extends DbForPrivacyConsent {
  insert(table: unknown): InsertChain;
}

export interface AcceptDeps {
  db: DbForAcceptFlow;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

export interface AcceptInput {
  userId: string;
  role: AppRole;
  ip: string;
  userAgent: string | null;
  next: string;
}

export async function runAcceptPrivacyPolicy(
  input: AcceptInput,
  deps: AcceptDeps,
): Promise<AcceptFlowResult> {
  const log = deps.logger ?? {
    error: (message: string, err?: unknown) => console.error(message, err),
  };
  const safeNext = getSafeCallbackUrl(input.next);

  // Idempotency: if the user already has a receipt at the current version,
  // skip the writes (defense against double-submit + stale-tab races). The
  // audit trail should record one row per (user, version), not multiples for
  // the same version.
  const mostRecent = await fetchMostRecentPrivacyConsentReceipt(
    deps.db,
    input.userId,
  );
  if (mostRecent?.documentVersion === CURRENT_PRIVACY_POLICY_VERSION) {
    return { ok: true, redirectTo: safeNext };
  }

  try {
    const acceptedAt = new Date();
    await deps.db.insert(consentReceipts).values({
      userId: input.userId,
      documentType: "privacy_policy",
      documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      acceptedAt,
      ipAddress: input.ip,
      userAgent: truncateUserAgent(input.userAgent),
      signature: null,
      documentSnapshot: null,
      createdByKind: "user",
      createdByActor: input.userId,
    });

    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "auth.privacy_policy_accepted",
        actorKind: "user",
        actorId: input.userId,
        actorMeta: input.ip,
        targetType: "user",
        targetId: input.userId,
        payload: {
          documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
          source: "re_acceptance",
        },
      }),
    );
  } catch (err) {
    log.error("[runAcceptPrivacyPolicy] consent write failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
  }

  deps.track({
    event: "privacy_policy_accepted",
    userId: input.userId,
    role: input.role,
    documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
    source: "re_acceptance",
  });

  return { ok: true, redirectTo: safeNext };
}
