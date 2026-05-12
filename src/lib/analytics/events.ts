// Minimal stub authored by Story 1.13 (2026-05-11), extended by Story 1.14
// (2026-05-12) to cover signin events + a generalized AuthRateLimitedEvent.
//
// Story 1.8 will EXTEND this discriminated union with the full 5-exit-gate schema
// (Loop / Wedge / Demand / Operational events) — do NOT rewrite, only append.
// See _bmad-output/planning-artifacts/stories/1-8-stub-event-schema-and-sentry.md
// for the full Story 1.8 scope.

import type { AppRole } from "../auth/roles";

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
// throttled auth action. Split into two literal-typed branches (Story 1.14
// code review) so an `event: "signup_rate_limited"` + `action: "signin"` mix
// can't compile.
export interface SignupRateLimitedEvent {
  event: "signup_rate_limited";
  anonymizedIp: string;
  action: "signup" | "signup_resend";
}

export interface SigninRateLimitedEvent {
  event: "signin_rate_limited";
  anonymizedIp: string;
  action: "signin";
}

export type AuthRateLimitedEvent = SignupRateLimitedEvent | SigninRateLimitedEvent;

export interface SignInFailedEvent {
  event: "signin_failed";
  anonymizedIp: string;
}

// --- Tutor onboarding (Story 2.1, FR10) ---

/**
 * Fires once per tutor on first successful `submitProfileAction`. Re-submits
 * during the `changes-requested` cycle do NOT re-fire — `tutorProfileEdited`
 * (Story 2.5) covers post-approval edits.
 *
 * Payload is intentionally PII-free: no bio text, no R2 keys, no full subject
 * list — only counts and presence flags.
 */
export interface TutorProfileCreatedEvent {
  event: "tutor_profile_created";
  tutorUserId: string;
  subjectCount: number;
  has45MinPrice: boolean;
  has60MinPrice: boolean;
  hasIntroVideo: boolean;
  hasPhoto: boolean;
  bioLength: number;
}

/**
 * Generalized rate-limit event for tutor-onboarding actions. Mirrors the
 * `Auth*RateLimitedEvent` split convention so the `action` literal can't drift
 * from the event source.
 */
export interface TutorRateLimitedEvent {
  event: "tutor_rate_limited";
  anonymizedIp: string;
  action: "submit_profile" | "save_draft" | "request_upload";
}

export type AnalyticsEvent =
  | SignupCompletedEvent
  | EmailVerifiedEvent
  | SignupRateLimitedEvent
  | SigninRateLimitedEvent
  | SignInFailedEvent
  | TutorProfileCreatedEvent
  | TutorRateLimitedEvent;

export type AnalyticsEventName = AnalyticsEvent["event"];
