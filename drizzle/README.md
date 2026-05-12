# Database Migration Discipline

TeachMe uses Drizzle Kit with forward-only Postgres migrations.

1. One migration per PR. Do not combine unrelated schema changes.
2. Never edit a merged migration. Drizzle migration history uses hashes; tampering blocks deploys.
3. Forward-only only. Revert application code, then fix forward with a new migration if the schema must change.
4. Backwards-compatible changes only:
   - Add columns as nullable or with a default.
   - Drop columns with a two-PR pattern: stop reads/writes first, drop after a soak deploy.
   - Rename with a four-PR pattern: add new column, dual-write, cut reads over, then drop old.
5. Raw SQL index changes that can lock hot tables must use `CREATE INDEX CONCURRENTLY`.
6. **Migrations auto-apply on push to `e2e` and `main`** via the `migrate-e2e` and `migrate-prod` CI jobs (`.github/workflows/ci.yml`, added in Story 1.23). Both run after the `quality` job passes. A failed migration FAILS the GitHub Action's status check but does NOT directly block Vercel's deploy — they run in parallel. If a deploy beats a migration (~30s race window), routes that depend on the new schema return 500 until the migration completes. Drizzle migrations are additive per rule 4, so the window is bounded. **Engineers must NOT manually run `pnpm db:migrate` against prod or e2e** — that's the action's job. (Local-dev migrations remain manual: `DATABASE_URL=<dev-url> pnpm db:migrate`.) The `check:migrations` step in the `quality` job blocks any PR that edits `src/lib/db/schema.ts` without committing a matching `drizzle/<num>_<slug>.sql`.

Manual SQL in migrations is allowed when Drizzle Kit cannot express a Postgres rule.
Story 1.3 uses manual SQL for immutable `audit_events` and `consent_receipts`
triggers.

Useful commands:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```
