// Minimal stub authored by Story 1.13 (2026-05-11), extended by Story 1.14
// (2026-05-12) to cover signin events + a generalized AuthRateLimitedEvent.
//
// Story 1.8 will EXTEND this discriminated union with the full 5-exit-gate schema
// (Loop / Wedge / Demand / Operational events) — do NOT rewrite, only append.
// See _bmad-output/planning-artifacts/stories/1-8-stub-event-schema-and-sentry.md
// for the full Story 1.8 scope.

import type { AppRole } from "../auth/roles";
import type { AuthRateLimitAction } from "../auth/rate-limit";

// `auth.signup_attempt` / `auth.signin_attempt` exist only as `audit_events`
// rows — not PostHog events. Counting per-attempt at the analytics layer would
// mostly duplicate the audit-row stream and pollute Loop-gate dashboards.

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

// Generalized in Story 1.14 from `SignupRateLimitedEvent` — fires for any
// throttled auth action (signup / signup_resend / signin).
export interface AuthRateLimitedEvent {
  event: "signup_rate_limited" | "signin_rate_limited";
  anonymizedIp: string;
  action: AuthRateLimitAction;
}

export interface SignInFailedEvent {
  event: "signin_failed";
  anonymizedIp: string;
}

export type AnalyticsEvent =
  | SignupCompletedEvent
  | EmailVerifiedEvent
  | AuthRateLimitedEvent
  | SignInFailedEvent;

export type AnalyticsEventName = AnalyticsEvent["event"];
