import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { signSlotPayload, verifySlotSignature } from "../slot-signing";

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  // Force the dev fallback path for deterministic tests.
  delete process.env.AUTH_SECRET;
  (process.env as Record<string, string>).NODE_ENV = "test";
});

afterEach(() => {
  if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  if (ORIGINAL_NODE_ENV === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
  else (process.env as Record<string, string>).NODE_ENV = ORIGINAL_NODE_ENV;
});

const TUTOR_ID = "11111111-2222-3333-4444-555555555555";
const SLOT_ISO = "2026-05-14T11:00:00.000Z";

describe("signSlotPayload + verifySlotSignature", () => {
  it("verifies the exact payload that was signed", () => {
    const sig = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    expect(
      verifySlotSignature(
        { tutorUserId: TUTOR_ID, slotIso: SLOT_ISO, duration: 60 },
        sig,
      ),
    ).toBe(true);
  });

  it("rejects a tampered tutorUserId", () => {
    const sig = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    expect(
      verifySlotSignature(
        {
          tutorUserId: "00000000-0000-0000-0000-000000000000",
          slotIso: SLOT_ISO,
          duration: 60,
        },
        sig,
      ),
    ).toBe(false);
  });

  it("rejects a tampered slotIso", () => {
    const sig = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    expect(
      verifySlotSignature(
        {
          tutorUserId: TUTOR_ID,
          slotIso: "2026-05-14T12:00:00.000Z",
          duration: 60,
        },
        sig,
      ),
    ).toBe(false);
  });

  it("rejects a tampered duration", () => {
    const sig = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    expect(
      verifySlotSignature(
        { tutorUserId: TUTOR_ID, slotIso: SLOT_ISO, duration: 45 },
        sig,
      ),
    ).toBe(false);
  });

  it("rejects an empty or malformed signature", () => {
    expect(
      verifySlotSignature(
        { tutorUserId: TUTOR_ID, slotIso: SLOT_ISO, duration: 60 },
        "",
      ),
    ).toBe(false);
    expect(
      verifySlotSignature(
        { tutorUserId: TUTOR_ID, slotIso: SLOT_ISO, duration: 60 },
        "not-base64!!",
      ),
    ).toBe(false);
    expect(
      verifySlotSignature(
        { tutorUserId: TUTOR_ID, slotIso: SLOT_ISO, duration: 60 },
        "AAAA", // too short
      ),
    ).toBe(false);
  });

  it("produces a stable base64url signature (no '+', '/', or '=' chars)", () => {
    const sig = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    expect(sig).not.toContain("+");
    expect(sig).not.toContain("/");
    expect(sig).not.toContain("=");
    expect(sig.length).toBeGreaterThan(0);
  });

  it("produces different signatures for different secrets", () => {
    delete process.env.AUTH_SECRET;
    const devSig = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    process.env.AUTH_SECRET = "different-secret";
    const realSig = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    expect(devSig).not.toBe(realSig);
  });

  it("throws when AUTH_SECRET is unset in production", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    expect(() =>
      signSlotPayload({ tutorUserId: TUTOR_ID, slotIso: SLOT_ISO, duration: 60 }),
    ).toThrow(/AUTH_SECRET/);
  });
});
