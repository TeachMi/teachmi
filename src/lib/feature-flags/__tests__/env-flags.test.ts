import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProviderName } from "../env-flags";

const PROVIDER_ENV_VARS = [
  "PAYMENTS_PROVIDER",
  "INVOICE_PROVIDER",
  "GOVIL_PROVIDER",
  "LESSON_ROOM_PROVIDER",
  "EMAIL_PROVIDER",
] as const;

describe("getProviderName", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of PROVIDER_ENV_VARS) {
      originalEnv[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of PROVIDER_ENV_VARS) {
      const previous = originalEnv[name];
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    }
  });

  it("defaults to 'stub' when the env-var is unset", () => {
    expect(getProviderName("payment")).toBe("stub");
    expect(getProviderName("invoice")).toBe("stub");
    expect(getProviderName("govil")).toBe("stub");
    expect(getProviderName("lessonRoom")).toBe("stub");
    expect(getProviderName("email")).toBe("stub");
  });

  it("treats empty string as unset", () => {
    process.env.PAYMENTS_PROVIDER = "";
    expect(getProviderName("payment")).toBe("stub");
  });

  it("returns the configured value when it matches the kind's allowed set", () => {
    process.env.PAYMENTS_PROVIDER = "payme";
    process.env.INVOICE_PROVIDER = "green-invoice";
    process.env.GOVIL_PROVIDER = "deeplink";
    process.env.LESSON_ROOM_PROVIDER = "daily";
    process.env.EMAIL_PROVIDER = "resend";

    expect(getProviderName("payment")).toBe("payme");
    expect(getProviderName("invoice")).toBe("green-invoice");
    expect(getProviderName("govil")).toBe("deeplink");
    expect(getProviderName("lessonRoom")).toBe("daily");
    expect(getProviderName("email")).toBe("resend");
  });

  it("throws with the env-var name and value when the value is not recognized", () => {
    process.env.PAYMENTS_PROVIDER = "stripe";
    expect(() => getProviderName("payment")).toThrowError(
      /PAYMENTS_PROVIDER.*"stripe"/,
    );
  });

  it("rejects values that are valid for a different kind", () => {
    process.env.GOVIL_PROVIDER = "payme";
    expect(() => getProviderName("govil")).toThrowError(
      /GOVIL_PROVIDER.*"payme"/,
    );
  });

  it("trims whitespace before validating recognized values", () => {
    process.env.PAYMENTS_PROVIDER = "  payme  ";
    expect(getProviderName("payment")).toBe("payme");
  });

  it("treats whitespace-only values as unset (defaults to stub)", () => {
    process.env.EMAIL_PROVIDER = "   ";
    expect(getProviderName("email")).toBe("stub");
  });
});
