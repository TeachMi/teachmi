// Story 1.22: marketing-opt-in helpers. Deliberately sibling to
// privacy-consent.ts — the two consent domains are independent. Privacy is a
// regulatory consent that bumps when counsel rewrites the policy (Story 9.1);
// marketing is an opt-IN preference whose version reflects the scope of what
// we'd send. A privacy-policy version bump must NOT force every user to
// re-opt-in for marketing.
//
// No gate helper here (no `requireMarketingOptIn`) — absence of a receipt
// simply means "do not send marketing". The send-loop (Story 6.2) reads
// `notification_preferences.marketing_email` at send time, not the receipts.
//
// See _bmad-output/planning-artifacts/stories/1-22-marketing-optin-receipts.md
// for the full design rationale.

import { auditEvents, consentReceipts, notificationPreferences } from "../db/schema";
import { toAuditEventValues } from "../db/audit";
import type { AppRole } from "../auth/roles";
import type { AnalyticsEvent } from "../analytics";
import { truncateUserAgent } from "./privacy-consent";

/**
 * Date-stamped version under which we first ship the marketing-opt-in. Bump
 * when the marketing-comm scope materially changes (e.g., SMS / WhatsApp
 * channels become real per FR43). Convention: `v<n>-<YYYY-MM-DD>`.
 *
 * Stored on every `consent_receipts.document_version` row written under
 * `document_type = 'marketing_opt_in'` (or `'marketing_opt_out'` for the
 * future Epic 6 opt-out flow). Plain text — no enum enforcement at the DB
 * layer.
 */
export const CURRENT_MARKETING_OPTIN_VERSION = "v1-2026-05-14";

/**
 * Hebrew label rendered on the marketing-opt-in checkbox. Single source of
 * truth so tests, future analytics dashboards, and any debugging surfaces can
 * anchor on the same string.
 */
export const MARKETING_OPTIN_LABEL_HE =
  "אני מסכים/ה לקבל עדכונים שיווקיים מ-TeachMe (אופציונלי)";

/** Where in the product the opt-in was captured (analytics + audit). */
export type MarketingOptInSource = "signup" | "tutor_wizard";

// Minimal Drizzle-compatible insert surface — lets the unit test pass a
// hand-rolled fake without re-typing the whole query builder. The real
// `getDb()` client is structurally compatible.
interface MarketingInsert extends Promise<unknown> {
  returning(columns: unknown): Promise<{ id: string }[]>;
  onConflictDoNothing(opts: unknown): MarketingInsert;
  onConflictDoUpdate(opts: unknown): MarketingInsert;
}
export interface MarketingOptInDb {
  insert(table: unknown): { values(value: unknown): MarketingInsert };
}

export interface RecordMarketingOptInDeps {
  db: MarketingOptInDb;
  userId: string;
  role: AppRole;
  /** Raw IP for the receipt's `ip_address` column; `null` when unknown. */
  ipAddress: string | null;
  /** Raw `User-Agent`; truncated to 512 chars at insert. May be `null`. */
  userAgent: string | null;
  source: MarketingOptInSource;
  track: (event: AnalyticsEvent) => void;
  logger?: { error: (message: string, err?: unknown) => void };
}

/**
 * Captures an FR60 marketing-comm opt-in: writes an immutable
 * `consent_receipts` row, an `auth.marketing_optin_accepted` audit event, and
 * upserts `notification_preferences.marketing_email = true`, then fires the
 * `marketing_optin_accepted` analytics event.
 *
 * Originally lived inline in the signup `runRegister`; moved here when the
 * opt-in moved out of signup and into the tutor-onboarding wizard (the Israeli
 * Spam Law requires marketing consent to be a separate, explicit opt-in, so
 * it can't ride the passive small-print consent the signup form now uses).
 *
 * Failure is non-blocking: any error is logged and swallowed — the opt-in is
 * OPTIONAL, so a write failure must never break the surface that invoked it.
 * If the consent receipt is a conflict no-op (the user already opted in at
 * this version) the audit + analytics writes are skipped to avoid
 * double-counting.
 */
export async function recordMarketingOptIn(
  deps: RecordMarketingOptInDeps,
): Promise<void> {
  const log = deps.logger ?? { error: (message, err) => console.error(message, err) };

  try {
    const acceptedAt = new Date();

    // ON CONFLICT DO NOTHING against the unique (userId, documentType,
    // documentVersion) constraint — a re-opt-in at the same version no-ops.
    const inserted = await deps.db
      .insert(consentReceipts)
      .values({
        userId: deps.userId,
        documentType: "marketing_opt_in",
        documentVersion: CURRENT_MARKETING_OPTIN_VERSION,
        acceptedAt,
        ipAddress: deps.ipAddress,
        userAgent: truncateUserAgent(deps.userAgent),
        signature: null,
        documentSnapshot: null,
        createdByKind: "user",
        createdByActor: deps.userId,
      })
      .onConflictDoNothing({
        target: [
          consentReceipts.userId,
          consentReceipts.documentType,
          consentReceipts.documentVersion,
        ],
      })
      .returning({ id: consentReceipts.id });

    // Race-loser / already-opted-in: receipt exists at the target version, so
    // the regulatory invariant holds — skip audit + analytics double-counting.
    if (inserted.length === 0) {
      return;
    }

    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "auth.marketing_optin_accepted",
        actorKind: "user",
        actorId: deps.userId,
        actorMeta: deps.ipAddress,
        targetType: "user",
        targetId: deps.userId,
        payload: {
          documentVersion: CURRENT_MARKETING_OPTIN_VERSION,
          source: deps.source,
        },
      }),
    );

    // UPSERT notification_preferences — on INSERT the table defaults populate
    // the other channel booleans; on UPDATE only flip `marketingEmail` so a
    // future settings UI's other-channel writes aren't clobbered.
    await deps.db
      .insert(notificationPreferences)
      .values({
        userId: deps.userId,
        marketingEmail: true,
        createdByKind: "user",
        createdByActor: deps.userId,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          marketingEmail: true,
          updatedAt: new Date(),
          updatedByKind: "user",
          updatedByActor: deps.userId,
        },
      });

    deps.track({
      event: "marketing_optin_accepted",
      userId: deps.userId,
      role: deps.role,
      documentVersion: CURRENT_MARKETING_OPTIN_VERSION,
      source: deps.source,
    });
  } catch (err) {
    log.error(
      `[recordMarketingOptIn] capture failed for userId=${deps.userId}; opt-in is optional, leaving user unchanged`,
      err,
    );
  }
}
