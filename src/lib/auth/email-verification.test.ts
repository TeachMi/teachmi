import { describe, expect, it } from "vitest";
import {
  VERIFICATION_TOKEN_TTL_MINUTES,
  buildVerificationUrl,
  evaluateTokenValidity,
  generateVerificationToken,
} from "./email-verification";

describe("generateVerificationToken", () => {
  it("emits base64url chars only and expires 15 minutes in the future", () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const { token, expires } = generateVerificationToken(now);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(expires.getTime() - now.getTime()).toBe(VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);
  });

  it("returns distinct tokens on successive calls", () => {
    const first = generateVerificationToken().token;
    const second = generateVerificationToken().token;
    expect(first).not.toBe(second);
  });
});

describe("evaluateTokenValidity", () => {
  it("returns not_found when no row exists", () => {
    expect(evaluateTokenValidity(null)).toEqual({ valid: false, reason: "not_found" });
    expect(evaluateTokenValidity(undefined)).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns expired when the row's expires is in the past", () => {
    const now = new Date("2026-05-18T10:30:00.000Z");
    const row = { identifier: "user@example.com", expires: new Date("2026-05-18T10:00:00.000Z") };
    expect(evaluateTokenValidity(row, now)).toEqual({ valid: false, reason: "expired" });
  });

  it("returns expired when the row's expires equals now (boundary)", () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const row = { identifier: "user@example.com", expires: now };
    expect(evaluateTokenValidity(row, now)).toEqual({ valid: false, reason: "expired" });
  });

  it("returns valid when expires is in the future", () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const row = { identifier: "user@example.com", expires: new Date("2026-05-18T10:14:00.000Z") };
    expect(evaluateTokenValidity(row, now)).toEqual({ valid: true, identifier: "user@example.com" });
  });
});

describe("buildVerificationUrl", () => {
  it("composes origin + path + token query param", () => {
    expect(buildVerificationUrl("abc123", "https://teachme.app")).toBe(
      "https://teachme.app/signup/verify?token=abc123",
    );
  });

  it("strips a trailing slash from the origin", () => {
    expect(buildVerificationUrl("abc123", "https://teachme.app/")).toBe(
      "https://teachme.app/signup/verify?token=abc123",
    );
  });

  it("strips multiple trailing slashes from the origin", () => {
    expect(buildVerificationUrl("abc", "https://teachme.app///")).toBe(
      "https://teachme.app/signup/verify?token=abc",
    );
  });

  it("URL-encodes special characters in the token", () => {
    expect(buildVerificationUrl("a+b/c=d", "https://teachme.app")).toBe(
      "https://teachme.app/signup/verify?token=a%2Bb%2Fc%3Dd",
    );
  });

  it("works with a localhost dev origin", () => {
    expect(buildVerificationUrl("dev-token", "http://localhost:3000")).toBe(
      "http://localhost:3000/signup/verify?token=dev-token",
    );
  });

  // Story 3.3 — `next` parameter threads the booking-funnel intent through
  // the email-verification hop. Backward-compatible: 2-arg + `{ next: null }`
  // + `undefined` opts all produce the SAME URL the pre-3.3 version produced.
  it("appends &next= when next is provided (Story 3.3)", () => {
    expect(
      buildVerificationUrl("abc", "https://teachme.app", {
        next: "/booking-stub?tutor=t&slot=s&duration=60&sig=x",
      }),
    ).toBe(
      "https://teachme.app/signup/verify?token=abc&next=%2Fbooking-stub%3Ftutor%3Dt%26slot%3Ds%26duration%3D60%26sig%3Dx",
    );
  });

  it("omits next when explicit null is passed (backward-compatible)", () => {
    expect(buildVerificationUrl("abc", "https://teachme.app", { next: null })).toBe(
      "https://teachme.app/signup/verify?token=abc",
    );
  });

  it("omits next when opts is undefined (backward-compatible)", () => {
    expect(buildVerificationUrl("abc", "https://teachme.app", undefined)).toBe(
      "https://teachme.app/signup/verify?token=abc",
    );
  });
});
