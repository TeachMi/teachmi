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

// Story 1.15: password-reset request (the forgot form submit) and confirm
// (the new-password submit). Two literal-typed branches so an
// `event: "password_reset_rate_limited"` row carries the action that was
// throttled — split per the same Story 1.14 code-review insight that split
// SigninRateLimitedEvent from SignupRateLimitedEvent.
export interface PasswordResetRequestRateLimitedEvent {
  event: "password_reset_rate_limited";
  anonymizedIp: string;
  action: "password_reset_request";
}

export interface PasswordResetConfirmRateLimitedEvent {
  event: "password_reset_rate_limited";
  anonymizedIp: string;
  action: "password_reset_confirm";
}

export type PasswordResetRateLimitedEvent =
  | PasswordResetRequestRateLimitedEvent
  | PasswordResetConfirmRateLimitedEvent;

export type AuthRateLimitedEvent =
  | SignupRateLimitedEvent
  | SigninRateLimitedEvent
  | PasswordResetRateLimitedEvent;

export interface SignInFailedEvent {
  event: "signin_failed";
  anonymizedIp: string;
}

// Fires on every successful password-reset request that ACTUALLY sent an email
// (i.e., a real user with a passwordHash). The no-user and oauth-only branches
// are anti-enumeration silent no-ops and do NOT emit this event — only the
// audit-event row distinguishes them.
export interface PasswordResetRequestedEvent {
  event: "password_reset_requested";
  anonymizedIp: string;
}

export interface PasswordResetCompletedEvent {
  event: "password_reset_completed";
  userId: string;
  role: AppRole;
}

// Story 1.21: privacy-policy acceptance. Fires from BOTH signup (first-time
// acceptance) and the re-acceptance flow when documentVersion bumps. The
// `source` discriminator distinguishes the two so the analytics dashboard can
// separate "first-time" acceptance rate from "re-acceptance" rate after a
// policy bump.
export interface PrivacyPolicyAcceptedEvent {
  event: "privacy_policy_accepted";
  userId: string;
  role: AppRole;
  documentVersion: string;
  source: "signup" | "re_acceptance";
}

// Marketing-opt-in acceptance (FR60). `source` records where it was captured:
// `signup` is the legacy path; `tutor_wizard` is the current one — the opt-in
// moved into the tutor-onboarding wizard (it must be a separate explicit
// opt-in). Epic 6 / Story 6.3 owns the future opt-OUT event.
export interface MarketingOptInAcceptedEvent {
  event: "marketing_optin_accepted";
  userId: string;
  role: AppRole;
  documentVersion: string;
  source: "signup" | "tutor_wizard";
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

// Story 1.20: route-level admin gate. Payload intentionally avoids user id or
// email; the route probe itself is enough for aggregate abuse visibility.
export interface AdminRouteUnauthorizedEvent {
  event: "admin_route_unauthorized";
  role: AppRole | "anonymous";
  path: string;
}

export interface DataExportDownloadedEvent {
  event: "data_export_downloaded";
  userId: string;
}

// Story 3.3 (FR19) — booking-funnel intent surfacing on /signup + /signin.
// `_landed` fires when the gate banner renders. `_tampered` fires when an
// `intent=book` payload was present but failed validation (HMAC mismatch,
// malformed UUID/ISO, missing fields) — security signal. `_tutor_not_found`
// fires when sig was valid but the tutor row was no longer discoverable
// (deactivated mid-funnel via Story 2.5 re-approval). `_completed` fires from
// /signup/verify/route.ts after successful session creation when the verify
// URL carried a valid `next` param decomposable into a booking-stub URL.

export interface SignupIntentBookLandedEvent {
  event: "signup_intent_book_landed";
  tutorUserId: string;
}

export interface SigninIntentBookLandedEvent {
  event: "signin_intent_book_landed";
  tutorUserId: string;
}

export interface SignupIntentBookTamperedEvent {
  event: "signup_intent_book_tampered";
  /** Specific validation that failed — surfaced for security analytics. */
  reason:
    | "missing_intent"
    | "missing_fields"
    | "bad_uuid"
    | "bad_slot_iso"
    | "bad_duration"
    | "sig_invalid";
  /** Originating page so a single dashboard can split signup vs signin. */
  source: "signup" | "signin";
}

export interface SignupIntentBookTutorNotFoundEvent {
  event: "signup_intent_book_tutor_not_found";
  tutorUserId: string;
  source: "signup" | "signin";
}

export interface SignupIntentBookCompletedEvent {
  event: "signup_intent_book_completed";
  userId: string;
  tutorUserId: string;
}

export type AnalyticsEvent =
  | SignupCompletedEvent
  | EmailVerifiedEvent
  | SignupRateLimitedEvent
  | SigninRateLimitedEvent
  | PasswordResetRequestRateLimitedEvent
  | PasswordResetConfirmRateLimitedEvent
  | SignInFailedEvent
  | PasswordResetRequestedEvent
  | PasswordResetCompletedEvent
  | PrivacyPolicyAcceptedEvent
  | MarketingOptInAcceptedEvent
  | TutorProfileCreatedEvent
  | TutorRateLimitedEvent
  | AdminRouteUnauthorizedEvent
  | DataExportDownloadedEvent
  | SignupIntentBookLandedEvent
  | SigninIntentBookLandedEvent
  | SignupIntentBookTamperedEvent
  | SignupIntentBookTutorNotFoundEvent
  | SignupIntentBookCompletedEvent;

export type AnalyticsEventName = AnalyticsEvent["event"];
