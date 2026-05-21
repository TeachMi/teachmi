/**
 * Email-template IDs the codebase ships emails against.
 *
 * The StubEmailProvider (Story 1.6) records the templateId verbatim; the Full
 * Resend provider (Story 6.1) will resolve each id to a React Email template
 * at send-time. New templates added here MUST round-trip to a template the
 * Resend provider can render — there is no fallback / unknown-template path.
 *
 * Naming convention: `<domain>-<purpose>`, kebab-case, two segments.
 */

export const EMAIL_TEMPLATES = {
  AUTH_VERIFY_EMAIL: {
    templateId: "account-verification",
    subject: "אימות כתובת אימייל ב-TeachMe",
  },
  AUTH_PASSWORD_RESET: {
    templateId: "auth-password-reset",
    subject: "איפוס סיסמה ב-TeachMe",
  },
  DATA_EXPORT_READY: {
    templateId: "data-export-ready",
    subject: "קישור להורדת המידע האישי שלך ב-TeachMe",
  },
  ACCOUNT_RESTORE: {
    templateId: "account-restore",
    subject: "שחזור חשבון TeachMe",
  },
} as const;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATES;
