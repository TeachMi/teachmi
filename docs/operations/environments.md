# Story 1.2 Environment Provisioning Runbook

This runbook tracks the manual provisioning needed after the local CI artifacts land.

## GitHub

- Create branches: `e2e`, `main`, and feature branches matching `feature/*`.
- Protect `main`: require PR, require one approval, require status checks, block force-push, and use `e2e` as the only promotion source by team convention.
- Protect `e2e`: require status checks, block force-push, allow merges from `feature/*`.
- Required checks: `typecheck, lint, test, build` and `Socket dependency scan`.
- Add repository secret: `SOCKET_SECURITY_API_KEY`.
- Enable Renovate on the repository; `renovate.json` groups routine dependency updates and separates security alerts.

## Vercel

- Create a Vercel project for this Next.js app.
- Pin function region to EU Frankfurt where available.
- Production branch: `main`, domain `teachme.app`.
- Preview deployments: all PRs and feature branches.
- Fixed E2E alias: `e2e.teachme.app` for the `e2e` branch.
- Configure env vars per environment from `.env.example`.

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

## Deploy Gates

- PRs into `e2e` must pass CI and Socket.
- PRs from `e2e` into `main` require manual approval and a smoke check of `e2e.teachme.app`.
- Migration dry-run gates are added in Story 1.3 after Drizzle exists.
- Playwright deploy checks are added in Story 1.9 after the golden path exists.
