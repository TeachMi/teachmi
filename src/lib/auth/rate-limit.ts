import { createHash } from "node:crypto";
import type { AuditEventInput } from "../db/audit";

export const RATE_LIMIT_THRESHOLD = 5;
export const RATE_LIMIT_WINDOW_SECONDS = 60;

export type AuthRateLimitAction = "signup" | "signup_resend" | "signin";

export const RATE_LIMIT_EVENT_TYPES: Record<AuthRateLimitAction, string> = {
  signup: "auth.signup_attempt",
  signup_resend: "auth.signup_resend_attempt",
  signin: "auth.signin_attempt",
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function evaluateRateLimit(opts: { recentAttempts: number }): RateLimitResult {
  if (opts.recentAttempts >= RATE_LIMIT_THRESHOLD) {
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
