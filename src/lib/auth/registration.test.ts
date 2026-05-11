import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, validatePassword } from "./registration";
import { hashPassword, verifyPassword } from "./password-hashing";

describe("validatePassword", () => {
  it("rejects empty input", () => {
    expect(validatePassword("")).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects 9-char input as too short", () => {
    expect(validatePassword("abcdefgh1")).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects 10-char letters-only input as missing digit", () => {
    expect(validatePassword("abcdefghij")).toEqual({ ok: false, reason: "missing_digit" });
  });

  it("rejects 10-char digits-only input as missing letter", () => {
    expect(validatePassword("1234567890")).toEqual({ ok: false, reason: "missing_letter" });
  });

  it("accepts 10-char input with both a letter and a digit", () => {
    expect(validatePassword("hello12345")).toEqual({ ok: true });
  });

  it("accepts Hebrew letters (Unicode \\p{L})", () => {
    expect(validatePassword("שלום123ABC")).toEqual({ ok: true });
  });

  it("accepts Cyrillic / CJK letters (Unicode \\p{L})", () => {
    expect(validatePassword("Привет1234")).toEqual({ ok: true });
    expect(validatePassword("password123日本")).toEqual({ ok: true });
  });

  it("checks length before character classes (length wins when shorter)", () => {
    expect(validatePassword("a1")).toEqual({ ok: false, reason: "too_short" });
  });

  it("exports the minimum length constant for callers that need it", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });
});

describe("hashPassword + verifyPassword", () => {
  it("produces an argon2id-encoded hash", async () => {
    const encoded = await hashPassword("hello12345");
    expect(encoded.startsWith("$argon2id$")).toBe(true);
  });

  it("round-trips: hash → verify with the same plaintext returns true", async () => {
    const encoded = await hashPassword("hello12345");
    expect(await verifyPassword("hello12345", encoded)).toBe(true);
  });

  it("rejects the wrong plaintext", async () => {
    const encoded = await hashPassword("hello12345");
    expect(await verifyPassword("wrong-pass", encoded)).toBe(false);
  });

  it("does NOT throw on malformed encoded input — returns false defensively", async () => {
    expect(await verifyPassword("anything", "not-an-argon-string")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
}, 30_000);
