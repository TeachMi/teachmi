#!/usr/bin/env node
/* Story 1.23 CI guard: if src/lib/db/schema.ts is modified in a PR, a new
 * matching drizzle/<num>_<slug>.sql file MUST be added in the same diff.
 *
 * Why: Stories 1.13 + 1.14 silently shipped to main with no schema applied
 * to the prod Neon branch — anyone hitting /signup or /signin got 500s for
 * ~24h. Discovered 2026-05-12 via dogfood-seed attempt; founder authorized
 * a one-shot manual `pnpm db:migrate` to recover. This guard prevents the
 * gap from recurring at PR-time.
 *
 * The companion `migrate-e2e` + `migrate-prod` jobs in .github/workflows/ci.yml
 * apply the migrations automatically on push to e2e/main.
 *
 * Inputs (in priority order):
 *   1. process.env.CHANGED_FILES — newline-separated list of paths (testable).
 *   2. Shell out to `git diff --name-only --diff-filter=AM <base>...HEAD`.
 *      Base ref: process.env.GITHUB_BASE_REF (PR context) || "origin/e2e".
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const SCHEMA_PATH = "src/lib/db/schema.ts";
const MIGRATION_RE = /^drizzle\/\d+_[a-z0-9_-]+\.sql$/;

function getChangedFiles() {
  if (process.env.CHANGED_FILES !== undefined) {
    return process.env.CHANGED_FILES.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const baseRef = process.env.GITHUB_BASE_REF || "origin/e2e";
  // `--diff-filter=AM` = Added or Modified files only (skip deletes / renames).
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=AM", `${baseRef}...HEAD`],
    { encoding: "utf-8" },
  );
  if (result.status !== 0) {
    console.error(`[check:migrations] git diff failed: ${result.stderr?.trim() || "(no stderr)"}`);
    process.exit(2);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function evaluate(changedFiles) {
  // Normalize paths to forward slashes so Windows-side checkouts behave.
  const normalized = changedFiles.map((p) => p.replace(/\\/g, "/"));
  const schemaChanged = normalized.includes(SCHEMA_PATH);
  const migrationAdded = normalized.some((p) => MIGRATION_RE.test(p));

  if (schemaChanged && !migrationAdded) {
    return { ok: false, schemaChanged, migrationAdded };
  }
  return { ok: true, schemaChanged, migrationAdded };
}

function formatError() {
  return [
    "",
    "[check:migrations] FAIL: src/lib/db/schema.ts was modified but no new",
    "  migration file was added under drizzle/.",
    "",
    "To fix:",
    "  pnpm db:generate    # produces drizzle/<next-num>_<slug>.sql",
    "  git add drizzle/<the-new-file>.sql drizzle/meta/",
    "  git commit --amend  # or a new commit",
    "",
    "Why this check exists:",
    "  Stories 1.13 + 1.14 shipped to prod for ~24h with code referencing",
    "  tables that didn't exist (no one ran pnpm db:migrate against the prod",
    "  Neon branch). This check ensures every schema change ships with a",
    "  migration. The migrate-e2e + migrate-prod CI jobs apply them on push.",
    "",
  ].join("\n");
}

// Only run side-effects when invoked as CLI, not when imported in tests.
const invokedAsScript =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  process.argv[1]?.endsWith("check-migrations.mjs");

if (invokedAsScript) {
  const changedFiles = getChangedFiles();
  const result = evaluate(changedFiles);
  if (!result.ok) {
    console.error(formatError());
    process.exit(1);
  }
  if (result.schemaChanged && result.migrationAdded) {
    console.log("[check:migrations] OK — schema change ships with a matching migration.");
  } else {
    console.log("[check:migrations] OK — no schema change.");
  }
}
