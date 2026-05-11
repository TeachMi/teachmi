import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_EVENT_TYPES,
  RATE_LIMIT_THRESHOLD,
  RATE_LIMIT_WINDOW_SECONDS,
  anonymizeIpForAnalytics,
  buildAttemptAuditEvent,
  evaluateRateLimit,
  hashEmailForAudit,
  rateLimitWindowStart,
} from "./rate-limit";

describe("evaluateRateLimit", () => {
  it("allows when recentAttempts is below threshold", () => {
    expect(evaluateRateLimit({ recentAttempts: 0 })).toEqual({ allowed: true });
    expect(evaluateRateLimit({ recentAttempts: 4 })).toEqual({ allowed: true });
  });

  it("denies once recentAttempts hits the threshold (5)", () => {
    expect(evaluateRateLimit({ recentAttempts: RATE_LIMIT_THRESHOLD })).toEqual({
      allowed: false,
      retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS,
    });
  });

  it("stays denied above threshold", () => {
    expect(evaluateRateLimit({ recentAttempts: 12 })).toEqual({
      allowed: false,
      retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS,
    });
  });
});

describe("hashEmailForAudit", () => {
  it("returns a 16-char hex digest", () => {
    const hash = hashEmailForAudit("user@example.com");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("normalizes case and whitespace before hashing", () => {
    expect(hashEmailForAudit("User@Example.com")).toBe(hashEmailForAudit("user@example.com"));
    expect(hashEmailForAudit("  user@example.com  ")).toBe(hashEmailForAudit("user@example.com"));
  });

  it("produces different hashes for different emails", () => {
    expect(hashEmailForAudit("a@b.com")).not.toBe(hashEmailForAudit("c@d.com"));
  });
});

describe("anonymizeIpForAnalytics", () => {
  it("returns ip:<8-hex>", () => {
    expect(anonymizeIpForAnalytics("192.168.1.1")).toMatch(/^ip:[0-9a-f]{8}$/);
  });

  it("is deterministic — same input → same output", () => {
    const a = anonymizeIpForAnalytics("10.0.0.1");
    const b = anonymizeIpForAnalytics("10.0.0.1");
    expect(a).toBe(b);
  });

  it("differs for different IPs", () => {
    expect(anonymizeIpForAnalytics("10.0.0.1")).not.toBe(anonymizeIpForAnalytics("10.0.0.2"));
  });
});

describe("buildAttemptAuditEvent", () => {
  it("builds a signup_attempt event with IP in actor_meta", () => {
    const event = buildAttemptAuditEvent({
      ip: "10.0.0.1",
      action: "signup",
      email: "user@example.com",
    });

    expect(event.eventType).toBe(RATE_LIMIT_EVENT_TYPES.signup);
    expect(event.eventType).toBe("auth.signup_attempt");
    expect(event.actorKind).toBe("user");
    expect(event.actorId).toBeNull();
    expect(event.actorMeta).toBe("10.0.0.1");
    expect(event.targetType).toBe("user");
    expect(event.targetId).toBeNull();
    expect(event.payload).toEqual({ emailHash: hashEmailForAudit("user@example.com") });
  });

  it("omits emailHash when no email is provided", () => {
    const event = buildAttemptAuditEvent({ ip: "10.0.0.1", action: "signin" });
    expect(event.payload).toEqual({});
    expect(event.eventType).toBe("auth.signin_attempt");
  });

  it("maps signup_resend to the right event type", () => {
    const event = buildAttemptAuditEvent({ ip: "10.0.0.1", action: "signup_resend" });
    expect(event.eventType).toBe("auth.signup_resend_attempt");
  });
});

describe("rateLimitWindowStart", () => {
  it("returns a date 60 seconds in the past", () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const window = rateLimitWindowStart(now);
    expect(now.getTime() - window.getTime()).toBe(RATE_LIMIT_WINDOW_SECONDS * 1000);
  });
});
