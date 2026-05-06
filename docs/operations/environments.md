# Story 1.2 Environment Provisioning Runbook

This runbook tracks the manual provisioning needed after the local CI artifacts land.

## Validated State

Last validated: 2026-05-06.

- Vercel project: `teachmi` (`prj_0Y2ISCqvQX7Xey2F5dAoFzZy0Zae`) in team `team_E2buH87hCmWlbNt0hNpNW7iQ`.
- Neon project: `teachmi` (`ancient-heart-05930329`) in `aws-eu-central-1`.
- GitHub branches: `main` and `e2e` both point at `14284abe378a17994eaab6cc0252c5339f90d05d`.
- Production deployment: `dpl_9ZjfabqmHiAzXbpbBLc5aJnkQPvZ`, ready, alias `teachmi-brown.vercel.app`, functions in `fra1`.
- E2E deployment: `dpl_GwrySCQztEMdztjx8ZNtDkeLUid3`, ready, alias `teachmi-git-e2e-aviels-projects-3a0be2f5.vercel.app`, functions in `fra1`.
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
- Migration dry-run gates are added in Story 1.3 after Drizzle exists.
- Playwright deploy checks are added in Story 1.9 after the golden path exists.
