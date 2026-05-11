import { createHash } from "node:crypto";
import type { AuditEventInput } from "../db/audit";

export const RATE_LIMIT_THRESHOLD = 5;
/**
 * When `x-forwarded-for` is unset or returns the literal `"unknown"`, every
 * such request shares one rate-limit bucket. We tighten the threshold for that
 * bucket so a single misconfigured proxy can't act as an amplifier for
 * everyone behind it. Real bypass mitigation is the Vercel WAF deferred handoff
 * (story AC8).
 */
export const RATE_LIMIT_THRESHOLD_UNKNOWN_IP = 1;
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const UNKNOWN_IP = "unknown";

export type AuthRateLimitAction = "signup" | "signup_resend" | "signin";

export const RATE_LIMIT_EVENT_TYPES: Record<AuthRateLimitAction, string> = {
  signup: "auth.signup_attempt",
  signup_resend: "auth.signup_resend_attempt",
  signin: "auth.signin_attempt",
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function thresholdForIp(ip: string): number {
  return ip === UNKNOWN_IP ? RATE_LIMIT_THRESHOLD_UNKNOWN_IP : RATE_LIMIT_THRESHOLD;
}

export function evaluateRateLimit(opts: {
  recentAttempts: number;
  threshold?: number;
}): RateLimitResult {
  const threshold = opts.threshold ?? RATE_LIMIT_THRESHOLD;
  if (opts.recentAttempts >= threshold) {
    return { allowed: false, retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS };
  }
  return { allowed: true };
}

export function hashEmailForAudit(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function anonymizeIpForAnalytics(ip: string): string {
  const digest = createHash("sha256").update(ip).digest("hex").slice(0, 8);
  return `ip:${digest}`;
}

export interface AttemptAuditInput {
  ip: string;
  action: AuthRateLimitAction;
  email?: string | null;
}

export function buildAttemptAuditEvent(input: AttemptAuditInput): AuditEventInput {
  return {
    eventType: RATE_LIMIT_EVENT_TYPES[input.action],
    actorKind: "user",
    actorId: null,
    actorMeta: input.ip,
    targetType: "user",
    targetId: null,
    payload: input.email
      ? { emailHash: hashEmailForAudit(input.email) }
      : {},
  };
}

export function rateLimitWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - RATE_LIMIT_WINDOW_SECONDS * 1000);
}
