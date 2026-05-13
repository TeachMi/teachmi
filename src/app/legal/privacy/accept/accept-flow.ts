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
  onConflictDoNothing(opts?: unknown): InsertWithReturning<TReturning>;
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

// Paths that would loop the user back into the accept flow itself. Reject
// these in `next` sanitization so a stale link / clickjack can't trigger an
// infinite redirect chain after acceptance. Story 1.21 review [M5].
function rejectSelfReferential(next: string): string {
  if (next === "/legal/privacy/accept" || next.startsWith("/legal/privacy/accept?") || next.startsWith("/legal/privacy/accept/")) {
    return "/dashboard";
  }
  return next;
}

export async function runAcceptPrivacyPolicy(
  input: AcceptInput,
  deps: AcceptDeps,
): Promise<AcceptFlowResult> {
  const log = deps.logger ?? {
    error: (message: string, err?: unknown) => console.error(message, err),
  };
  const safeNext = rejectSelfReferential(getSafeCallbackUrl(input.next));

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

  let raceWonByThisRequest = true;
  try {
    const acceptedAt = new Date();
    // Story 1.21 review [L1]: convert the readIp sentinel "unknown" to null
    // so the immutable receipt doesn't carry a misleading literal.
    const ipAddress = input.ip === "unknown" ? null : input.ip;
    // Story 1.21 round-2 fix: rely on the new unique constraint
    // (userId, documentType, documentVersion) to make concurrent submits
    // race-tolerant. The loser of a race gets an empty returning() and we
    // skip the audit + analytics writes for it — the receipt still exists
    // at the target version (the winner wrote it), so the regulatory
    // invariant holds and the user can proceed.
    const consentInsert = (await deps.db
      .insert(consentReceipts)
      .values({
        userId: input.userId,
        documentType: "privacy_policy",
        documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
        acceptedAt,
        ipAddress,
        userAgent: truncateUserAgent(input.userAgent),
        signature: null,
        documentSnapshot: null,
        createdByKind: "user",
        createdByActor: input.userId,
      })
      .onConflictDoNothing({
        target: [
          consentReceipts.userId,
          consentReceipts.documentType,
          consentReceipts.documentVersion,
        ],
      })
      .returning({ id: consentReceipts.id })) as { id: string }[];

    if (consentInsert.length === 0) {
      raceWonByThisRequest = false;
    } else {
      await deps.db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "auth.privacy_policy_accepted",
          actorKind: "user",
          actorId: input.userId,
          actorMeta: ipAddress,
          targetType: "user",
          targetId: input.userId,
          payload: {
            documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
            source: "re_acceptance",
          },
        }),
      );
    }
  } catch (err) {
    log.error("[runAcceptPrivacyPolicy] consent write failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
  }

  if (!raceWonByThisRequest) {
    // Another concurrent request wrote the same (user, version) receipt
    // first. Skip the analytics event so we don't double-count, but
    // redirect the user onward — the regulatory state is satisfied.
    return { ok: true, redirectTo: safeNext };
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
