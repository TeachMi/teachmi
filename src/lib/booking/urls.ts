// Shared URL helpers for the booking funnel.
//
// Story 3.2 (tutor profile calendar) emits the gate URL when an anon visitor
// clicks an available slot. Story 3.3 (this story) consumes those URLs on
// /signup + /signin and threads the booking-stub URL through email
// verification. Story 4.3 will replace `/booking-stub` with the real booking
// route; consumers should keep importing `buildBookingStubUrl` from here so a
// single edit propagates everywhere.
//
// Two producer functions:
// - `buildGateSignupUrl` — the /signup gate URL emitted by the calendar.
// - `buildBookingStubUrl` — the /booking-stub URL for the signed-in branch
//   AND the post-verify redirect target.
//
// Two consumer functions:
// - `parseGateParams` — primary parser; reads intent=book multi-params on the
//   incoming page URL, verifies the sig, returns the payload + a computed
//   `next` URL. Reports the failure reason for security analytics.
// - `decomposeNextToGateParams` — second-chance parser used when a cross-page
//   navigation link passed `?callbackUrl=<bookingstub url>` rather than the
//   full multi-param shape; extracts gate params from the embedded booking-
//   stub URL.

import { signSlotPayload, verifySlotSignature } from "@/lib/auth/slot-signing";

export interface GateParams {
  tutorUserId: string;
  slotIso: string;
  duration: 45 | 60;
  sig: string;
  /** Computed booking-stub URL — the post-verify redirect target. */
  next: string;
}

export type GateParseFailure =
  | "missing_intent"
  | "missing_fields"
  | "bad_uuid"
  | "bad_slot_iso"
  | "bad_duration"
  | "sig_invalid";

export interface GateParseResult {
  payload: GateParams | null;
  /** Set when `payload` is null; null when parsing succeeded. */
  reason: GateParseFailure | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidIsoUtc(value: string): boolean {
  if (!ISO_UTC_REGEX.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function coerceDuration(value: string): 45 | 60 | null {
  const n = Number(value);
  return n === 45 || n === 60 ? n : null;
}

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/**
 * Producer: builds the `/signup?...` URL emitted by the public tutor profile's
 * availability calendar when an anonymous visitor clicks a slot. Embeds the
 * HMAC sig so the consumer can detect tampered URLs before issuing a DB
 * lookup.
 */
export function buildGateSignupUrl(input: {
  tutorUserId: string;
  slotIso: string;
  duration: 45 | 60;
}): string {
  const callbackUrl = `/tutor/${input.tutorUserId}?duration=${input.duration}`;
  const sig = signSlotPayload({
    tutorUserId: input.tutorUserId,
    slotIso: input.slotIso,
    duration: input.duration,
  });
  const params = new URLSearchParams({
    callbackUrl,
    intent: "book",
    tutorUserId: input.tutorUserId,
    slotIso: input.slotIso,
    duration: String(input.duration),
    sig,
  });
  return `/signup?${params.toString()}`;
}

/**
 * Producer / consumer: builds the `/booking-stub?...` URL.
 *
 * The producer (signed-in branch of the tutor profile calendar) mints a fresh
 * sig via `buildSignedBookingStubUrl`. The consumer (signup / signin pages,
 * verify route) already has the sig in hand from the gate params and passes
 * it through unchanged — preserving the chain of custody from the calendar
 * emission all the way to the booking action that Story 4.3 will install.
 */
export function buildBookingStubUrl(input: {
  tutorUserId: string;
  slotIso: string;
  duration: 45 | 60;
  sig: string;
}): string {
  const params = new URLSearchParams({
    tutor: input.tutorUserId,
    slot: input.slotIso,
    duration: String(input.duration),
    sig: input.sig,
  });
  return `/booking-stub?${params.toString()}`;
}

/**
 * Convenience wrapper for the producer side that doesn't have a sig in hand:
 * sign the tuple, then compose. Used by the signed-in branch of the calendar.
 */
export function buildSignedBookingStubUrl(input: {
  tutorUserId: string;
  slotIso: string;
  duration: 45 | 60;
}): string {
  const sig = signSlotPayload({
    tutorUserId: input.tutorUserId,
    slotIso: input.slotIso,
    duration: input.duration,
  });
  return buildBookingStubUrl({ ...input, sig });
}

/**
 * Consumer-side parser. Reads `intent=book` multi-params (`tutorUserId`,
 * `slotIso`, `duration`, `sig`) from the page's search params, validates shape
 * + HMAC, and returns the payload plus a computed `next` URL. Returns
 * `{ payload: null, reason }` on any failure so the caller can fire the
 * `signup_intent_book_tampered` security event with the specific reason.
 *
 * Callers (page-level RSC) should also fall back to
 * `decomposeNextToGateParams(callbackUrl)` when this returns null but a
 * `callbackUrl` query param is present — see AC7.
 */
export function parseGateParams(
  raw: Record<string, string | string[] | undefined> | URLSearchParams,
): GateParseResult {
  const get = (key: string): string | null => {
    if (raw instanceof URLSearchParams) return raw.get(key);
    return firstString(raw[key]);
  };

  const intent = get("intent");
  if (intent !== "book") {
    return { payload: null, reason: "missing_intent" };
  }

  const tutorUserId = get("tutorUserId");
  const slotIso = get("slotIso");
  const durationRaw = get("duration");
  const sig = get("sig");

  if (!tutorUserId || !slotIso || !durationRaw || !sig) {
    return { payload: null, reason: "missing_fields" };
  }
  if (!isValidUuid(tutorUserId)) {
    return { payload: null, reason: "bad_uuid" };
  }
  if (!isValidIsoUtc(slotIso)) {
    return { payload: null, reason: "bad_slot_iso" };
  }
  const duration = coerceDuration(durationRaw);
  if (duration === null) {
    return { payload: null, reason: "bad_duration" };
  }

  if (!verifySlotSignature({ tutorUserId, slotIso, duration }, sig)) {
    return { payload: null, reason: "sig_invalid" };
  }

  const next = buildBookingStubUrl({ tutorUserId, slotIso, duration, sig });
  return {
    payload: { tutorUserId, slotIso, duration, sig, next },
    reason: null,
  };
}

/**
 * Second-chance parser used when a cross-page navigation link passed only
 * `?callbackUrl=<bookingstub url>` (no intent multi-params) — see AC7. Parses
 * the booking-stub URL's own query string back into gate params and revalidates
 * the embedded sig. Returns null on any shape, parsing, or sig failure.
 *
 * Accepts a relative path (`/booking-stub?...`) or, defensively, an absolute
 * URL. Rejects anything that isn't a booking-stub URL — keeps the surface
 * narrow so an attacker can't smuggle a different path as `callbackUrl`.
 */
export function decomposeNextToGateParams(next: string): GateParams | null {
  if (!next) return null;

  let pathAndQuery = next;
  if (next.startsWith("http://") || next.startsWith("https://")) {
    try {
      const u = new URL(next);
      pathAndQuery = `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  }

  if (!pathAndQuery.startsWith("/booking-stub?")) {
    return null;
  }

  const qStart = pathAndQuery.indexOf("?");
  if (qStart === -1) return null;
  const params = new URLSearchParams(pathAndQuery.slice(qStart + 1));
  const tutorUserId = params.get("tutor");
  const slotIso = params.get("slot");
  const durationRaw = params.get("duration");
  const sig = params.get("sig");

  if (!tutorUserId || !slotIso || !durationRaw || !sig) return null;
  if (!isValidUuid(tutorUserId)) return null;
  if (!isValidIsoUtc(slotIso)) return null;
  const duration = coerceDuration(durationRaw);
  if (duration === null) return null;
  if (!verifySlotSignature({ tutorUserId, slotIso, duration }, sig)) return null;

  return {
    tutorUserId,
    slotIso,
    duration,
    sig,
    next: buildBookingStubUrl({ tutorUserId, slotIso, duration, sig }),
  };
}
