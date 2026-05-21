"use server";

// Server Action for the BookingModal "Continue" click — Story 4.3 fix
// (2026-05-18). Signing is done HERE, on the server, because the HMAC
// secret (`AUTH_SECRET`) is not shipped to the client bundle. Earlier
// versions of this story computed the sig client-side inside the modal's
// useMemo, which silently fell back to the dev-only secret on the client
// while the server verified with the real secret — every "Continue"
// click failed with sig_invalid.
//
// The action validates shape, looks up the session, and RETURNS the target
// URL for the client to navigate to. It deliberately does NOT `redirect()`:
// the caller does a soft `router.push`, so a soft navigation to the anon
// `/signup` gate is caught by the `(.)signup` intercepting route and shown
// as a modal instead of a full-page load.
//   - signed-in → /checkout?...&sig=<real>
//   - anon      → /signup?...&intent=book&...&sig=<real>
//   - bad input → the tutor page (or home)

import { auth } from "@/lib/auth/auth";
import { buildGateSignupUrl, buildSignedCheckoutUrl } from "./urls";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;

function coerceDuration(value: string): 45 | 60 | 75 | 90 | null {
  const n = Number(value);
  return n === 45 || n === 60 || n === 75 || n === 90 ? n : null;
}

export interface CheckoutHandoffResult {
  /** Target the caller should `router.push` to. */
  url: string;
}

export async function checkoutHandoffAction(
  formData: FormData,
): Promise<CheckoutHandoffResult> {
  const tutorUserId = String(formData.get("tutorUserId") ?? "");
  const slotIso = String(formData.get("slotIso") ?? "");
  const durationRaw = String(formData.get("duration") ?? "");
  const duration = coerceDuration(durationRaw);

  // Shape validation. Bail back to the tutor page (or home) on bad input
  // rather than throwing — a tampered hidden field shouldn't 500 the app.
  if (!UUID_REGEX.test(tutorUserId)) {
    return { url: "/" };
  }
  if (!ISO_UTC_REGEX.test(slotIso) || Number.isNaN(Date.parse(slotIso))) {
    return { url: `/tutor/${tutorUserId}` };
  }
  if (duration === null) {
    return { url: `/tutor/${tutorUserId}` };
  }

  const session = await auth();

  // Defense-in-depth: if a tutor managed to reach this action with their
  // own user_id as `tutorUserId` (the BookingSidebar shouldn't render the
  // form when `viewerIsOwner`, but a tampered hidden field bypasses that),
  // bounce them back to /tutor/me. The booking action itself also rejects
  // this — this is just a friendlier redirect than a form error.
  if (session?.user?.id && session.user.id === tutorUserId) {
    return { url: "/tutor/me" };
  }

  if (session?.user?.id) {
    return { url: buildSignedCheckoutUrl({ tutorUserId, slotIso, duration }) };
  }
  return { url: buildGateSignupUrl({ tutorUserId, slotIso, duration }) };
}
