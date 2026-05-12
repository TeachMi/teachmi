// Story 1.21: privacy-policy consent gate + helpers.
//
// `CURRENT_PRIVACY_POLICY_VERSION` is the single source of truth, read from
// the legal-documents loader. When Story 9.1 ships counsel-drafted text, it
// bumps the `version` field in `documents.ts` and AC3's re-prompt logic
// automatically catches every existing user.

import { and, desc, eq } from "drizzle-orm";
import { consentReceipts } from "../db/schema";
import { getLegalDocument } from "./documents";

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

export function truncateUserAgent(
  ua: string | null | undefined,
  maxLength: number = USER_AGENT_MAX_LENGTH,
): string | null {
  if (!ua) return null;
  const trimmed = ua.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
}

// Minimal Drizzle-shape surface — supports `.where().orderBy().limit()` so
// tests can pass a hand-rolled fake without re-typing the whole query builder.
interface PrivacyConsentSelectChain {
  from(table: unknown): {
    where(condition: unknown): {
      orderBy(spec: unknown): {
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
  const rows = await db
    .select({ documentVersion: consentReceipts.documentVersion })
    .from(consentReceipts)
    .where(
      and(
        eq(consentReceipts.userId, userId),
        eq(consentReceipts.documentType, "privacy_policy"),
      ),
    )
    .orderBy(desc(consentReceipts.acceptedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function requirePrivacyConsent(
  input: RequirePrivacyConsentInput,
): Promise<void> {
  const mostRecent = await fetchMostRecentPrivacyConsentReceipt(
    input.db,
    input.userId,
  );
  if (!userNeedsPrivacyConsent(mostRecent)) return;
  input.redirectFn(buildPrivacyAcceptRedirectUrl(input.currentPath));
}
