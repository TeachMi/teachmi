# Transactional email HTML (Resend)

Standalone HTML templates for [Resend Templates](https://resend.com/docs/dashboard/templates/introduction). Palette matches `src/app/globals.css`.

| File | `templateId` | Subject |
|------|--------------|---------|
| `auth-verify-email.html` | `account-verification` | אימות כתובת אימייל ב-TeachMe |

## Resend variables

Use **triple braces** and **UPPERCASE** keys (Resend requirement). Define each variable in the template editor (or API) with a **fallback** so preview/lint passes before send.

| Key | Type | Fallback (preview / lint) | App payload field |
|-----|------|---------------------------|-------------------|
| `DISPLAY_NAME` | string | `ישראל` | `displayName` |
| `VERIFY_URL` | string | `https://teachme.co.il/signup/verify?token=preview` | `verifyUrl` |
| `VERIFICATION_CODE` | string | `123456` | `verificationCode` |

**Do not** use `{{{EXPIRES_IN_MINUTES}}}` in HTML — Resend’s linter mis-parses triple braces as unresolved `{{expiresInMinutes}}`. The link TTL is always 15 minutes; copy is hardcoded to match `VERIFICATION_TOKEN_TTL_MINUTES`.

### Preview text (required in Resend UI)

Resend’s **Preview text** field (template sidebar) is separate from the HTML preheader. Paste from [`auth-verify-email.preview.txt`](auth-verify-email.preview.txt):

```
הזינו את קוד האימות ב-TeachMe — הקוד בתוקף ל-15 דקות.
```

The HTML includes a React Email–style `<div data-skip-in-text="true">` for inbox clients; that does not satisfy Resend’s “Preview text is not set” lint by itself.

`VERIFY_URL` must be a full `https://` URL (matches `buildVerificationUrl()` in `src/lib/auth/email-verification.ts`).

## Send via template API

```ts
await resend.emails.send({
  from: "TeachMe <hello@teachme.co.il>",
  to: email,
  subject: "אימות כתובת אימייל ב-TeachMe",
  template: {
    id: "<published-template-id>",
      variables: {
        DISPLAY_NAME: name,
        VERIFY_URL: verifyUrl,
        VERIFICATION_CODE: verificationCode,
      },
  },
});
```

Map `registration-flow.ts` / `resend-flow.ts` payload keys to the UPPERCASE names above when wiring Story 6.1.
