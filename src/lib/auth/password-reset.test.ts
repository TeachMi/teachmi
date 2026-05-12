import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  buildPasswordResetUrl,
  evaluateResetTokenValidity,
  generatePasswordResetToken,
} from "./password-reset";

describe("generatePasswordResetToken", () => {
  it("emits base64url chars only and expires 15 minutes in the future", () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const { token, expires } = generatePasswordResetToken(now);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(expires.getTime() - now.getTime()).toBe(PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  });

  it("returns distinct tokens on successive calls", () => {
    const first = generatePasswordResetToken().token;
    const second = generatePasswordResetToken().token;
    expect(first).not.toBe(second);
  });
});

describe("evaluateResetTokenValidity", () => {
  it("returns not_found when no row exists", () => {
    expect(evaluateResetTokenValidity(null)).toEqual({ valid: false, reason: "not_found" });
    expect(evaluateResetTokenValidity(undefined)).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns expired when the row's expires is in the past", () => {
    const now = new Date("2026-05-18T10:30:00.000Z");
    const row = { identifier: "user@example.com", expires: new Date("2026-05-18T10:00:00.000Z") };
    expect(evaluateResetTokenValidity(row, now)).toEqual({ valid: false, reason: "expired" });
  });

  it("returns expired when the row's expires equals now (boundary)", () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const row = { identifier: "user@example.com", expires: now };
    expect(evaluateResetTokenValidity(row, now)).toEqual({ valid: false, reason: "expired" });
  });

  it("returns valid when expires is in the future", () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const row = { identifier: "user@example.com", expires: new Date("2026-05-18T10:14:00.000Z") };
    expect(evaluateResetTokenValidity(row, now)).toEqual({ valid: true, identifier: "user@example.com" });
  });
});

describe("buildPasswordResetUrl", () => {
  it("composes origin + path + token query param", () => {
    expect(buildPasswordResetUrl("abc123", "https://teachme.app")).toBe(
      "https://teachme.app/signin/reset?token=abc123",
    );
  });

  it("strips a trailing slash from the origin", () => {
    expect(buildPasswordResetUrl("abc123", "https://teachme.app/")).toBe(
      "https://teachme.app/signin/reset?token=abc123",
    );
  });

  it("strips multiple trailing slashes from the origin", () => {
    expect(buildPasswordResetUrl("abc", "https://teachme.app///")).toBe(
      "https://teachme.app/signin/reset?token=abc",
    );
  });

  it("URL-encodes special characters in the token", () => {
    expect(buildPasswordResetUrl("a+b/c=d", "https://teachme.app")).toBe(
      "https://teachme.app/signin/reset?token=a%2Bb%2Fc%3Dd",
    );
  });

  it("works with a localhost dev origin", () => {
    expect(buildPasswordResetUrl("dev-token", "http://localhost:3000")).toBe(
      "http://localhost:3000/signin/reset?token=dev-token",
    );
  });
});
