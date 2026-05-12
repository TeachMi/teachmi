# Analytics event schema

> **Status:** Minimal stub seeded by Story 1.13 (2026-05-11). Story 1.8 will extend
> this with the full 5-exit-gate schema (Loop / Wedge / Demand / Operational).
> Adding an event = PR with `events.ts` change + this doc updated + reviewer sign-off.
> Do NOT call `track()` with an event name that is not in the typed `AnalyticsEvent`
> discriminated union.

## Events (Story 1.13 + Story 1.14 + Story 1.15)

| Name | Gate | When it fires | Properties |
|---|---|---|---|
| `signup_completed` | Loop | After a `users` row is inserted with `email_verified=null` and the verification email is dispatched. | `userId`, `role` |
| `email_verified` | Loop | After the verify route handler marks `users.email_verified` and creates a session. | `userId`, `role` |
| `signup_rate_limited` | (operational) | When `evaluateRateLimit` denies a signup or signup-resend attempt. | `anonymizedIp` (ip:<sha256[0..8]>), `action` |
| `signin_rate_limited` | (operational) | When `evaluateRateLimit` denies a signin attempt (Story 1.14). | `anonymizedIp` (ip:<sha256[0..8]>), `action: "signin"` |
| `signin_failed` | (operational) | When the Credentials provider rejects a signin attempt — generic "invalid email or password" (Story 1.14). No `signin_succeeded` PostHog event: session-create telemetry is owned by Story 1.8's Auth.js wiring. | `anonymizedIp` |
| `password_reset_requested` | (operational) | When a forgot-password submit results in an actual email send (real user with a `passwordHash`). The anti-enumeration no-user and oauth-only branches do NOT emit this — only the `audit_events` row distinguishes them (Story 1.15). | `anonymizedIp` |
| `password_reset_completed` | Loop | After the user submits a new password via a valid reset token, the user row is updated, all their sessions are deleted, and the token is consumed (Story 1.15). | `userId`, `role` |
| `password_reset_rate_limited` | (operational) | When `evaluateRateLimit` denies either a forgot-form submit or a reset-form submit. The `action` discriminator captures which surface (Story 1.15). | `anonymizedIp` (ip:<sha256[0..8]>), `action: "password_reset_request" \| "password_reset_confirm"` |

**Note on signup + signin attempts.** Each POST to `/signup` writes an `auth.signup_attempt` row to `audit_events`; each POST to `/signin` writes an `auth.signin_attempt` row. Successful signins also write `auth.signin_succeeded` (with `actor_id`), and failed signins write `auth.signin_failed`. These are the abuse-investigation surface — they deliberately do NOT mirror to PostHog. Loop-gate dashboards consume `signup_completed` / `email_verified`; throttling activity surfaces via `signup_rate_limited` / `signin_rate_limited`. Re-add a PostHog `auth.signup_attempt` / `auth.signin_attempt` event only if analytics genuinely needs per-attempt counts beyond what the completion + rate-limit events already give.

**Story 1.14 type rename.** The TypeScript interface formerly known as `SignupRateLimitedEvent` is now `AuthRateLimitedEvent` (covers signup + signin uniformly via the `action` discriminator). Runtime event names are unchanged.

## Strategic Gate has no events

Per [`closed-beta-exit-criteria-2026-04-29.md`](../../../../../../TeachMe/_bmad-output/planning-artifacts/closed-beta-exit-criteria-2026-04-29.md) §2.E, the Strategic Gate is founder-judgment-only and intentionally has no PostHog events. Story 1.8 will preserve this absence.

## Event-addition review process

Adding a new event:

1. Add a new interface to `events.ts` and append it to the `AnalyticsEvent` discriminated union.
2. Add a row to this doc (name, gate, when, properties).
3. PR review: a reviewer must sign off that the new event is needed and that the name + properties make sense.
4. Call sites use `track({ event: "...", ... })` — TypeScript enforces the payload shape; never pass a string literal that is not in the union.
