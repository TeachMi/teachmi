# Story 1.2 Environment Provisioning Runbook

This runbook tracks the manual provisioning needed after the local CI artifacts land.

## Validated State

Last validated: 2026-05-06.

- Vercel project: `teachme` (`prj_0Y2ISCqvQX7Xey2F5dAoFzZy0Zae`) in team `team_E2buH87hCmWlbNt0hNpNW7iQ`.
- Neon project: `teachme` (`ancient-heart-05930329`) in `aws-eu-central-1`.
- GitHub branches: `main` and `e2e` both point at `14284abe378a17994eaab6cc0252c5339f90d05d`.
- Production deployment: `dpl_9ZjfabqmHiAzXbpbBLc5aJnkQPvZ`, ready, alias `teachme-brown.vercel.app`, functions in `fra1`.
- E2E deployment: `dpl_GwrySCQztEMdztjx8ZNtDkeLUid3`, ready, alias `teachme-git-e2e-aviels-projects-3a0be2f5.vercel.app`, functions in `fra1`.
- GitHub Actions CI passed on both `main` and `e2e` for commit `14284abe378a17994eaab6cc0252c5339f90d05d`.
- Vercel env vars exist for Production, Development, and Preview scoped to `e2e`, including `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, and MVP 1 stub provider selectors.

## GitHub

- Create branches: `e2e`, `main`, and feature branches matching `feature/*`.
- Protect `main`: require PR, require one approval, require status checks, block force-push, and use `e2e` as the only promotion source by team convention.
- Protect `e2e`: require status checks, block force-push, allow merges from `feature/*`.
- Required checks: `typecheck, lint, test, build` and `Socket dependency scan`.
- The `typecheck, lint, test, build` check also validates PR source branches: `main` accepts only `e2e`; `e2e` accepts only `feature/*`.
- Add repository secret: `SOCKET_SECURITY_API_KEY`.
- Enable Renovate on the repository; `renovate.json` targets `e2e`, creates `feature/renovate/*` branches, groups routine dependency updates, and separates security alerts.

## Vercel

- Create a Vercel project for this Next.js app.
- Pin function region to EU Frankfurt where available.
- Production branch: `main`, domain `teachme.app`.
- Preview deployments: all PRs and feature branches.
- Fixed E2E alias: `e2e.teachme.app` for the `e2e` branch once DNS is available. Until then, use the Vercel branch alias.
- Configure env vars per environment from `.env.example`.
- For Google OAuth, configure `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in Development, Preview scoped to `e2e`, and Production after OAuth credentials are issued. The callback URL is `/api/auth/callback/google` on each app origin.
- Configure a Vercel WAF/rate-limit rule for `/api/auth/*` and `/signin` before enabling public traffic. Manual verification for Story 1.4 is: repeated high-frequency requests to auth endpoints are rate-limited, while normal sign-in still reaches Google OAuth.

## Neon

- Create one Neon project in EU region.
- Create long-lived branches:
  - `main` for production.
  - `e2e` for pre-production soak.
  - `dev` for local development and shared sandboxing.
- Enable extensions on each branch:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
```

- Wire each branch's connection string into the matching Vercel environment.
- Enable Neon GitHub integration for per-PR child branches and cleanup on PR close.

Validated long-lived branches:

| Environment | Neon branch | Status |
|---|---|---|
| Production | `main` / `br-damp-butterfly-alds2cms` | ready; extensions verified |
| E2E | `e2e` / `br-aged-rain-alwzrdwr` | ready; extensions verified |
| Development | `dev` / `br-curly-meadow-alppn46g` | ready; extensions verified |

## Deploy Gates

- PRs into `e2e` must pass CI and Socket.
- PRs from `e2e` into `main` require manual approval and a smoke check of `e2e.teachme.app`.
- Before public auth traffic, verify the Vercel WAF/rate-limit rule for `/api/auth/*` and `/signin` blocks high-frequency abuse and still allows normal Google OAuth sign-in.
- Migration dry-run gates are added in Story 1.3 after Drizzle exists.
- Playwright deploy checks are added in Story 1.9 after the golden path exists.

## Database Migrations (Drizzle)

Drizzle admin commands (`pnpm db:migrate`, `pnpm db:push`, `pnpm db:pull`, `pnpm db:studio`) **require `DATABASE_URL_UNPOOLED`** — the Neon direct/unpooled endpoint. The pooler doesn't support multi-statement migration blocks; running admin commands against it fails mid-transaction with cryptic Neon errors. `drizzle.config.ts` enforces this with a fail-loud check at startup.

Runtime application queries continue to use `DATABASE_URL` (the pooled endpoint) via `src/lib/db/client.ts` — this is the right shape for serverless.

**Operational implications:**

- Vercel environments (Production, E2E, Development, plus per-PR Preview) must provision **both** `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct). Already configured per the validated state above.
- Local dev `.env`: same — both keys.
- If a Neon dev branch is paused (auto-suspends after inactivity), the first admin command may hang on websocket handshake. Wake the branch via the Neon dashboard before running migrations, or use a quick read query first.

## Provider Selection (cross-cutting concern #2 — AD-13)

External vendors (PayMe, Green Invoice, gov.il, Daily.co, Resend) live behind the `lib/providers/*` strategy interfaces (Story 1.6). Selection is env-var driven; flipping a vendor from MVP-1 stub to MVP-2 full is a Vercel env-var change, not a code release.

| Env var | MVP 1 default | MVP 2 value | Wired in |
|---|---|---|---|
| `PAYMENTS_PROVIDER` | `stub` | `payme` | Story 8.2 |
| `INVOICE_PROVIDER` | `stub` | `green-invoice` | Stories 8.1 + 8.3 |
| `GOVIL_PROVIDER` | `stub` | `deeplink` | Stories 2.8 + 2.9 |
| `LESSON_ROOM_PROVIDER` | `stub` | `daily` | Story 5.1 |
| `EMAIL_PROVIDER` | `stub` | `resend` | Story 6.1 |

Setting any of these to a value not yet implemented throws a fail-loud "not yet implemented" error pointing to the future story. Whitespace is trimmed; unset / empty values default to `"stub"`.
