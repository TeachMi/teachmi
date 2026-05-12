import { describe, expect, it } from "vitest";
import { evaluate } from "../check-migrations.mjs";

describe("check-migrations evaluate()", () => {
  it("passes when schema.ts is NOT changed (no migration needed)", () => {
    expect(evaluate(["src/app/signin/page.tsx", "src/app/signin/actions.ts"])).toEqual({
      ok: true,
      schemaChanged: false,
      migrationAdded: false,
    });
  });

  it("passes when schema.ts is changed AND a matching migration file is added", () => {
    expect(
      evaluate([
        "src/lib/db/schema.ts",
        "drizzle/0003_brave_falcon.sql",
        "drizzle/meta/_journal.json",
      ]),
    ).toEqual({
      ok: true,
      schemaChanged: true,
      migrationAdded: true,
    });
  });

  it("FAILS when schema.ts is changed but no new migration file accompanies it", () => {
    expect(evaluate(["src/lib/db/schema.ts", "src/app/some-page.tsx"])).toEqual({
      ok: false,
      schemaChanged: true,
      migrationAdded: false,
    });
  });

  it("passes when a hand-rolled migration is added without a schema edit (manual SQL fix)", () => {
    // Edge case: someone adds a migration for a manual SQL change (e.g., an
    // index, a trigger) without editing schema.ts. The guard should NOT
    // false-positive here.
    expect(evaluate(["drizzle/0004_lonely_panda.sql", "drizzle/meta/_journal.json"])).toEqual({
      ok: true,
      schemaChanged: false,
      migrationAdded: true,
    });
  });

  it("passes when multiple schema edits ship with one migration file", () => {
    // Edge case: schema.ts is modified, and the engineer added the
    // matching migration alongside. Stays green.
    expect(
      evaluate(["src/lib/db/schema.ts", "drizzle/0005_thunder_lake.sql"]),
    ).toEqual({
      ok: true,
      schemaChanged: true,
      migrationAdded: true,
    });
  });

  it("normalizes Windows-style backslashes in paths", () => {
    expect(
      evaluate([
        "src\\lib\\db\\schema.ts",
        "drizzle\\0003_brave_falcon.sql",
      ]),
    ).toEqual({
      ok: true,
      schemaChanged: true,
      migrationAdded: true,
    });
  });

  it("does NOT match drizzle/README.md or drizzle/meta/_journal.json as a migration file", () => {
    // The migration regex must match only numbered SQL files in drizzle/.
    expect(
      evaluate([
        "src/lib/db/schema.ts",
        "drizzle/README.md",
        "drizzle/meta/_journal.json",
      ]),
    ).toEqual({
      ok: false,
      schemaChanged: true,
      migrationAdded: false,
    });
  });

  it("does NOT match files in drizzle/ subdirectories as migrations", () => {
    expect(
      evaluate([
        "src/lib/db/schema.ts",
        "drizzle/snapshots/0003_some.sql",
      ]),
    ).toEqual({
      ok: false,
      schemaChanged: true,
      migrationAdded: false,
    });
  });
});
