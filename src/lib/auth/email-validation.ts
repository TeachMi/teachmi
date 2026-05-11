// Server-side email-shape validator. Tighter than the `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`
// pattern earlier in Story 1.13 — explicitly rejects CRLF (header injection),
// `<` / `>` / `"` / control chars (header injection + spoof addresses), and
// length above RFC 5321's 320-char cap. Story 6.1's Resend provider should
// re-validate at its boundary; this is the app-side first line of defense.

const MAX_EMAIL_LENGTH = 320;
const FORBIDDEN_CHARS = /[\r\n\t<>"'\\\x00-\x1f\x7f]/;
const SHAPE_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmailShape(input: string): boolean {
  if (!input || input.length > MAX_EMAIL_LENGTH) return false;
  if (FORBIDDEN_CHARS.test(input)) return false;
  return SHAPE_RE.test(input);
}
