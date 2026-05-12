import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../track";

describe("track()", () => {
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    } else {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
    }
  });

  it("no-ops when NEXT_PUBLIC_POSTHOG_KEY is unset", () => {
    const logger = { log: vi.fn() };
    track(
      { event: "signup_completed", userId: "u1", role: "student" },
      logger,
    );
    expect(logger.log).not.toHaveBeenCalled();
  });

  it("no-ops when NEXT_PUBLIC_POSTHOG_KEY is an empty string", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "";
    const logger = { log: vi.fn() };
    track(
      { event: "signup_completed", userId: "u1", role: "student" },
      logger,
    );
    expect(logger.log).not.toHaveBeenCalled();
  });

  it("emits a structured log when the key is set", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const logger = { log: vi.fn() };
    track(
      { event: "email_verified", userId: "u1", role: "tutor" },
      logger,
    );
    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith({
      kind: "analytics.track",
      event: "email_verified",
      userId: "u1",
      role: "tutor",
    });
  });

  it("preserves discriminated-union payload fields per event type", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const logger = { log: vi.fn() };
    track(
      {
        event: "signup_rate_limited",
        anonymizedIp: "ip:abcd1234",
        action: "signup",
      },
      logger,
    );
    expect(logger.log).toHaveBeenCalledWith({
      kind: "analytics.track",
      event: "signup_rate_limited",
      anonymizedIp: "ip:abcd1234",
      action: "signup",
    });
  });

  it("emits password_reset_requested with anonymizedIp", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const logger = { log: vi.fn() };
    track({ event: "password_reset_requested", anonymizedIp: "ip:cafe0001" }, logger);
    expect(logger.log).toHaveBeenCalledWith({
      kind: "analytics.track",
      event: "password_reset_requested",
      anonymizedIp: "ip:cafe0001",
    });
  });

  it("emits password_reset_completed with userId + role", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const logger = { log: vi.fn() };
    track({ event: "password_reset_completed", userId: "u-9", role: "student" }, logger);
    expect(logger.log).toHaveBeenCalledWith({
      kind: "analytics.track",
      event: "password_reset_completed",
      userId: "u-9",
      role: "student",
    });
  });

  it("emits password_reset_rate_limited with discriminated action field", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const logger = { log: vi.fn() };
    track(
      {
        event: "password_reset_rate_limited",
        anonymizedIp: "ip:cafe0002",
        action: "password_reset_confirm",
      },
      logger,
    );
    expect(logger.log).toHaveBeenCalledWith({
      kind: "analytics.track",
      event: "password_reset_rate_limited",
      anonymizedIp: "ip:cafe0002",
      action: "password_reset_confirm",
    });
  });
});
