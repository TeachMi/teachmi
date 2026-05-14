import { describe, expect, it } from "vitest";
import {
  ACCOUNT_RESTORE_TOKEN_TTL_DAYS,
  buildRestoreUrl,
  generateRestoreToken,
  restoreTokenExpiresAt,
  tombstoneEmail,
  validateDeleteConfirmation,
} from "../account-deletion";

describe("account deletion helpers", () => {
  it("generates URL-safe restore tokens", () => {
    const token = generateRestoreToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("uses a 30-day restore window", () => {
    const now = new Date("2026-05-14T10:00:00.000Z");

    expect(restoreTokenExpiresAt(now).toISOString()).toBe("2026-06-13T10:00:00.000Z");
    expect(ACCOUNT_RESTORE_TOKEN_TTL_DAYS).toBe(30);
  });

  it("builds stable tombstone emails and restore URLs", () => {
    expect(tombstoneEmail("user-1")).toBe("deleted_user-1@teachme.invalid");
    expect(buildRestoreUrl("abc_123", "https://teachme.app")).toBe(
      "https://teachme.app/account/restore/abc_123",
    );
  });

  it("validates delete confirmation against the account email", () => {
    expect(
      validateDeleteConfirmation({
        confirmation: " TEST@EXAMPLE.COM ",
        email: "test@example.com",
      }),
    ).toEqual({ ok: true, email: "test@example.com" });

    expect(
      validateDeleteConfirmation({
        confirmation: "wrong@example.com",
        email: "test@example.com",
      }),
    ).toMatchObject({ ok: false, error: expect.any(String) });
  });
});
