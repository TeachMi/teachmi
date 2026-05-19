import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSlotPayload } from "../../../../lib/auth/slot-signing";
import { buildCheckoutUrl } from "../../../../lib/booking/urls";
import type { VerifyFlowResult } from "../../verify-flow";
import { resolveVerifyRedirect } from "../route-resolve";

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  // Dev-fallback secret keeps HMAC deterministic across tests.
  delete process.env.AUTH_SECRET;
  (process.env as Record<string, string>).NODE_ENV = "test";
});

afterEach(() => {
  if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  if (ORIGINAL_NODE_ENV === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    (process.env as Record<string, string>).NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

const TUTOR_ID = "11111111-2222-3333-4444-555555555555";
const SLOT_ISO = "2026-05-20T11:00:00.000Z";

function gateUrl(): string {
  const sig = signSlotPayload({
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration: 60,
  });
  return buildCheckoutUrl({
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration: 60,
    sig,
  });
}

function okResult(): VerifyFlowResult {
  return {
    kind: "ok",
    sessionToken: "fixed-session-token",
    expires: new Date("2026-06-18T10:00:00.000Z"),
    userId: "user-1",
    role: "student",
  };
}

describe("resolveVerifyRedirect — ok (session created)", () => {
  it("redirects to a valid gate URL and reports completionTutorUserId", () => {
    const next = gateUrl();
    const resolved = resolveVerifyRedirect(okResult(), next);
    expect(resolved.path).toBe(next);
    expect(resolved.setSessionCookie).toBe(true);
    expect(resolved.completionTutorUserId).toBe(TUTOR_ID);
  });

  it("redirects to /dashboard when next is null", () => {
    const resolved = resolveVerifyRedirect(okResult(), null);
    expect(resolved.path).toBe("/dashboard");
    expect(resolved.setSessionCookie).toBe(true);
    expect(resolved.completionTutorUserId).toBeNull();
  });

  it("redirects to /dashboard when next is unsafe (open-redirect attempt)", () => {
    const resolved = resolveVerifyRedirect(okResult(), "//evil.example/take-over");
    expect(resolved.path).toBe("/dashboard");
    expect(resolved.completionTutorUserId).toBeNull();
  });

  it("redirects to a safe relative path but doesn't fire completion when next isn't a gate URL", () => {
    const resolved = resolveVerifyRedirect(okResult(), "/dashboard?tab=lessons");
    expect(resolved.path).toBe("/dashboard?tab=lessons");
    expect(resolved.setSessionCookie).toBe(true);
    expect(resolved.completionTutorUserId).toBeNull();
  });

  it("does not fire completion when next is a checkout URL with a tampered sig", () => {
    const tampered = `/checkout?tutor=${TUTOR_ID}&slot=${SLOT_ISO}&duration=60&sig=AAAAAAAAAAAAAAAAAAAAAA`;
    const resolved = resolveVerifyRedirect(okResult(), tampered);
    // The path is still followed (tampered URL was already getSafeCallbackUrl'd),
    // but no completion event because the sig doesn't verify.
    expect(resolved.path).toBe(tampered);
    expect(resolved.completionTutorUserId).toBeNull();
  });
});

describe("resolveVerifyRedirect — verified_no_session", () => {
  it("forwards next via /signin?callbackUrl= when next is set", () => {
    const next = gateUrl();
    const result: VerifyFlowResult = {
      kind: "verified_no_session",
      userId: "user-1",
      role: "student",
    };
    const resolved = resolveVerifyRedirect(result, next);
    expect(resolved.path).toBe(
      `/signin?verified=1&callbackUrl=${encodeURIComponent(next)}`,
    );
    expect(resolved.setSessionCookie).toBe(false);
    expect(resolved.completionTutorUserId).toBeNull();
  });

  it("omits callbackUrl when next is missing or unsafe", () => {
    const result: VerifyFlowResult = {
      kind: "verified_no_session",
      userId: "user-1",
      role: "student",
    };
    expect(resolveVerifyRedirect(result, null).path).toBe("/signin?verified=1");
    expect(resolveVerifyRedirect(result, "//evil.example").path).toBe(
      "/signin?verified=1",
    );
  });
});

describe("resolveVerifyRedirect — error", () => {
  it("redirects to /signup/verify-error?reason=... and drops next entirely", () => {
    const result: VerifyFlowResult = { kind: "error", reason: "expired" };
    const next = gateUrl();
    const resolved = resolveVerifyRedirect(result, next);
    expect(resolved.path).toBe("/signup/verify-error?reason=expired");
    expect(resolved.setSessionCookie).toBe(false);
    expect(resolved.completionTutorUserId).toBeNull();
  });

  it("preserves the error reason in the redirect path", () => {
    const reasons: Array<"missing" | "not_found" | "expired" | "internal"> = [
      "missing",
      "not_found",
      "expired",
      "internal",
    ];
    for (const reason of reasons) {
      const result: VerifyFlowResult = { kind: "error", reason };
      const resolved = resolveVerifyRedirect(result, null);
      expect(resolved.path).toBe(`/signup/verify-error?reason=${reason}`);
    }
  });
});
