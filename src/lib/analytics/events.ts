// Minimal stub authored by Story 1.13 (2026-05-11).
// Story 1.8 will EXTEND this discriminated union with the full 5-exit-gate schema
// (Loop / Wedge / Demand / Operational events) — do NOT rewrite, only append.
// See _bmad-output/planning-artifacts/stories/1-8-stub-event-schema-and-sentry.md
// for the full Story 1.8 scope.

import type { AppRole } from "../auth/roles";
import type { AuthRateLimitAction } from "../auth/rate-limit";

// `auth.signup_attempt` exists only as an `audit_events` row — not a PostHog
// event. Counting per-attempt at the analytics layer would mostly duplicate the
// audit-row stream and pollute Loop-gate dashboards. Re-add `SignupAttemptEvent`
// here only if a future analytics need actually consumes it.

export interface SignupCompletedEvent {
  event: "signup_completed";
  userId: string;
  role: AppRole;
}

export interface EmailVerifiedEvent {
  event: "email_verified";
  userId: string;
  role: AppRole;
}

export interface SignupRateLimitedEvent {
  event: "signup_rate_limited";
  anonymizedIp: string;
  action: AuthRateLimitAction;
}

export type AnalyticsEvent =
  | SignupCompletedEvent
  | EmailVerifiedEvent
  | SignupRateLimitedEvent;

export type AnalyticsEventName = AnalyticsEvent["event"];
