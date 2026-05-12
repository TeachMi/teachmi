import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEmailVerificationSkipEnabled } from "./dev-flags";

describe("isEmailVerificationSkipEnabled", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Test env defaults to NODE_ENV=test and no flag.
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEV_SKIP_EMAIL_VERIFICATION", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when flag is unset", () => {
    vi.stubEnv("DEV_SKIP_EMAIL_VERIFICATION", "");
    expect(isEmailVerificationSkipEnabled()).toBe(false);
  });

  it("returns false when flag is 'true' (only literal '1' enables)", () => {
    vi.stubEnv("DEV_SKIP_EMAIL_VERIFICATION", "true");
    expect(isEmailVerificationSkipEnabled()).toBe(false);
  });

  it("returns false when flag is '0'", () => {
    vi.stubEnv("DEV_SKIP_EMAIL_VERIFICATION", "0");
    expect(isEmailVerificationSkipEnabled()).toBe(false);
  });

  it("returns true when flag is '1' AND NODE_ENV is development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_SKIP_EMAIL_VERIFICATION", "1");
    expect(isEmailVerificationSkipEnabled()).toBe(true);
  });

  it("returns true when flag is '1' AND NODE_ENV is test", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEV_SKIP_EMAIL_VERIFICATION", "1");
    expect(isEmailVerificationSkipEnabled()).toBe(true);
  });

  it("HARD REFUSES when NODE_ENV is production, regardless of flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_SKIP_EMAIL_VERIFICATION", "1");
    expect(isEmailVerificationSkipEnabled()).toBe(false);
  });
});
