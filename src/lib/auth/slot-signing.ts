// HMAC slot-payload signing for the booking funnel handoff.
// Story 3.2 review decision D1.
//
// Why this exists: the public profile page emits clickable slot links to
// `/signup?...&intent=book&tutorUserId=X&slotIso=Y&duration=Z`. Without
// signing, anyone can hand-craft such a URL with any (tutor, slot,
// duration) triple — including slots that don't exist, are already
// booked, or for tutors who have been deactivated. Story 3.3 (signup
// gate) and Story 4.3 (booking action) must hard-validate the payload
// server-side regardless, but signing now reduces the attack surface
// during the signup → booking handoff: the recipient can detect
// tampering before issuing a DB lookup.
//
// Algorithm: HMAC-SHA256 over a canonical string `<tutorUserId>|<slotIso>|<duration>`,
// base64url-encoded, truncated to 16 bytes (128 bits — plenty for an
// integrity check, not a secrecy primitive).
//
// Secret: `process.env.AUTH_SECRET` is already required for the
// next-auth session encryption; reusing it avoids minting another
// long-lived secret. If `AUTH_SECRET` is unset (test environment), the
// signer falls back to a deterministic dev-only value AND `verify`
// returns `true` for the matching signature only — no security leak.

import { createHmac, timingSafeEqual } from "node:crypto";

const FALLBACK_DEV_SECRET = "dev-only-slot-signing-fallback";
const SIGNATURE_BYTE_LENGTH = 16; // 128 bits

export interface SlotPayload {
  tutorUserId: string;
  slotIso: string;
  duration: 45 | 60;
}

function canonicalize(payload: SlotPayload): string {
  return `${payload.tutorUserId}|${payload.slotIso}|${payload.duration}`;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // Production with no secret is a misconfiguration — the next-auth
      // session layer would already be broken. Fail loud rather than
      // silently downgrade slot integrity.
      throw new Error("AUTH_SECRET must be set in production");
    }
    return FALLBACK_DEV_SECRET;
  }
  return secret;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

export function signSlotPayload(payload: SlotPayload): string {
  const hmac = createHmac("sha256", getSecret());
  hmac.update(canonicalize(payload));
  const digest = hmac.digest().subarray(0, SIGNATURE_BYTE_LENGTH);
  return base64UrlEncode(digest);
}

export function verifySlotSignature(
  payload: SlotPayload,
  signature: string,
): boolean {
  if (!signature) return false;
  let provided: Buffer;
  try {
    provided = base64UrlDecode(signature);
  } catch {
    return false;
  }
  if (provided.length !== SIGNATURE_BYTE_LENGTH) return false;

  const hmac = createHmac("sha256", getSecret());
  hmac.update(canonicalize(payload));
  const expected = hmac.digest().subarray(0, SIGNATURE_BYTE_LENGTH);
  // Buffer instances are accepted by timingSafeEqual; both must be the
  // same length (guarded above).
  return timingSafeEqual(provided, expected);
}
