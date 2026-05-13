// Story 1.21: privacy-policy consent gate + helpers.
//
// `CURRENT_PRIVACY_POLICY_VERSION` is the single source of truth, read from
// the legal-documents loader. When Story 9.1 ships counsel-drafted text, it
// bumps the `version` field in `documents.ts` and AC3's re-prompt logic
// automatically catches every existing user.

import { and, desc, eq } from "drizzle-orm";
import { consentReceipts } from "../db/schema";
import { getLegalDocument } from "./documents";

interface ConsentConsoleLogger {
  error: (message: string, err?: unknown) => void;
}

const defaultConsoleLogger: ConsentConsoleLogger = {
  error: (message, err) => console.error(message, err),
};

export const CURRENT_PRIVACY_POLICY_VERSION =
  getLegalDocument("privacy_policy").version;

export const USER_AGENT_MAX_LENGTH = 512;

export interface ConsentReceiptVersionRow {
  documentVersion: string;
}

export function userNeedsPrivacyConsent(
  mostRecentReceipt: ConsentReceiptVersionRow | null | undefined,
): boolean {
  if (!mostRecentReceipt) return true;
  return mostRecentReceipt.documentVersion !== CURRENT_PRIVACY_POLICY_VERSION;
}

// Strip C0 controls (\x00-\x1F) and DEL (\x7F). NUL bytes in particular reject
// outright on Postgres text columns ("invalid byte sequence for encoding
// UTF8: 0x00"), so a pathological UA could trip the consent insert and force
// the registration cleanup path. Story 1.21 review finding [M3].
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/g;

export function truncateUserAgent(
  ua: string | null | undefined,
  maxLength: number = USER_AGENT_MAX_LENGTH,
): string | null {
  if (!ua) return null;
  const cleaned = ua.replace(CONTROL_CHARS_RE, "").trim();
  if (cleaned.length === 0) return null;
  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength);
}

// Minimal Drizzle-shape surface — supports `.where().orderBy().limit()` so
// tests can pass a hand-rolled fake without re-typing the whole query builder.
interface PrivacyConsentSelectChain {
  from(table: unknown): {
    where(condition: unknown): {
      // Real Drizzle `orderBy` is variadic so we can pass multiple sort keys
      // (primary acceptedAt, tiebreaker id) — Story 1.21 review [L2].
      orderBy(...specs: unknown[]): {
        limit(n: number): Promise<ConsentReceiptVersionRow[]>;
      };
    };
  };
}

export interface DbForPrivacyConsent {
  select(cols: unknown): PrivacyConsentSelectChain;
}

export interface RequirePrivacyConsentInput {
  userId: string;
  currentPath: string;
  db: DbForPrivacyConsent;
  redirectFn: (path: string) => never;
}

export function buildPrivacyAcceptRedirectUrl(currentPath: string): string {
  return `/legal/privacy/accept?next=${encodeURIComponent(currentPath)}`;
}

export async function fetchMostRecentPrivacyConsentReceipt(
  db: DbForPrivacyConsent,
  userId: string,
): Promise<ConsentReceiptVersionRow | null> {
  // Tiebreaker sort on `id` so two receipts written in the same millisecond
  // (test seed loops, fast double-submits) yield a deterministic "most
  // recent" winner. Otherwise Postgres returns one row non-deterministically
  // and the gate can flip-flop between page loads. Story 1.21 review [L2].
  const rows = await db
    .select({ documentVersion: consentReceipts.documentVersion })
    .from(consentReceipts)
    .where(
      and(
        eq(consentReceipts.userId, userId),
        eq(consentReceipts.documentType, "privacy_policy"),
      ),
    )
    .orderBy(desc(consentReceipts.acceptedAt), desc(consentReceipts.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function requirePrivacyConsent(
  input: RequirePrivacyConsentInput & { logger?: ConsentConsoleLogger },
): Promise<void> {
  const logger = input.logger ?? defaultConsoleLogger;

  // Fail-OPEN with logging on DB errors. The gate is a UX nudge — NFR16
  // capture happens at write-time (signup orchestrator + accept-flow), not
  // here. A transient Neon hiccup should NOT block every authenticated user
  // from reaching their dashboard. Story 1.21 review [M1].
  let mostRecent: ConsentReceiptVersionRow | null;
  try {
    mostRecent = await fetchMostRecentPrivacyConsentReceipt(
      input.db,
      input.userId,
    );
  } catch (err) {
    logger.error(
      `[requirePrivacyConsent] DB lookup failed for userId=${input.userId}; allowing request through (fail-open)`,
      err,
    );
    return;
  }

  if (!userNeedsPrivacyConsent(mostRecent)) return;
  input.redirectFn(buildPrivacyAcceptRedirectUrl(input.currentPath));
}
