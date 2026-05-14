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
 * Hebrew label rendered on the signup checkbox. Single source of truth so
 * tests, future analytics dashboards, and any debugging surfaces can anchor
 * on the same string.
 */
export const MARKETING_OPTIN_LABEL_HE =
  "אני מסכים/ה לקבל עדכונים שיווקיים מ-TeachMe (אופציונלי)";
