# Analytics event schema

> **Status:** Minimal stub seeded by Story 1.13 (2026-05-11). Story 1.8 will extend
> this with the full 5-exit-gate schema (Loop / Wedge / Demand / Operational).
> Adding an event = PR with `events.ts` change + this doc updated + reviewer sign-off.
> Do NOT call `track()` with an event name that is not in the typed `AnalyticsEvent`
> discriminated union.

## Events (Story 1.13)

| Name | Gate | When it fires | Properties |
|---|---|---|---|
| `signup_attempt` | Loop (precursor) | Every POST to `/signup` (Server Action `registerAction`), whether allowed or rate-limited. Mirrors the `auth.signup_attempt` audit-event row. | `ip` (raw, server-only), `emailHash` (sha256[0..16]), `role` |
| `signup_completed` | Loop | After a `users` row is inserted with `email_verified=null` and the verification email is dispatched. | `userId`, `role` |
| `email_verified` | Loop | After the verify route handler marks `users.email_verified` and creates a session. | `userId`, `role` |
| `signup_rate_limited` | (operational) | When `evaluateRateLimit` denies an auth attempt. | `anonymizedIp` (ip:<sha256[0..8]>), `action` |

The `signup_attempt` event carries the raw IP because it fires server-side only and feeds back-end abuse-investigation analytics; the user-visible `signup_rate_limited` event uses the anonymized form (`ip:<sha256[0..8]>`) to keep PostHog out of the GDPR-PII surface.

## Strategic Gate has no events

Per [`closed-beta-exit-criteria-2026-04-29.md`](../../../../../../TeachMe/_bmad-output/planning-artifacts/closed-beta-exit-criteria-2026-04-29.md) §2.E, the Strategic Gate is founder-judgment-only and intentionally has no PostHog events. Story 1.8 will preserve this absence.

## Event-addition review process

Adding a new event:

1. Add a new interface to `events.ts` and append it to the `AnalyticsEvent` discriminated union.
2. Add a row to this doc (name, gate, when, properties).
3. PR review: a reviewer must sign off that the new event is needed and that the name + properties make sense.
4. Call sites use `track({ event: "...", ... })` — TypeScript enforces the payload shape; never pass a string literal that is not in the union.
