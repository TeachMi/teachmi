# Database Migration Discipline

TeachMi uses Drizzle Kit with forward-only Postgres migrations.

1. One migration per PR. Do not combine unrelated schema changes.
2. Never edit a merged migration. Drizzle migration history uses hashes; tampering blocks deploys.
3. Forward-only only. Revert application code, then fix forward with a new migration if the schema must change.
4. Backwards-compatible changes only:
   - Add columns as nullable or with a default.
   - Drop columns with a two-PR pattern: stop reads/writes first, drop after a soak deploy.
   - Rename with a four-PR pattern: add new column, dual-write, cut reads over, then drop old.
5. Raw SQL index changes that can lock hot tables must use `CREATE INDEX CONCURRENTLY`.
6. Target-environment migration steps run before deployment. A failed migration aborts the deploy.

Manual SQL in migrations is allowed when Drizzle Kit cannot express a Postgres rule.
Story 1.3 uses manual SQL for immutable `audit_events` and `consent_receipts`
triggers.

Useful commands:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```
