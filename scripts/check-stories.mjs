#!/usr/bin/env node
/* Story 1.7 CI guard: every src/components/ui/*.tsx (excluding *.stories.tsx
 * and *.test.tsx) must have a matching *.stories.tsx peer. The design-system
 * catalog rots fast without this — see epics.md Story 1.7. */
import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const uiDir = join(repoRoot, "src", "components", "ui");

let entries;
try {
  entries = await readdir(uiDir, { withFileTypes: true });
} catch (err) {
  if (err.code === "ENOENT") {
    process.exit(0);
  }
  throw err;
}

const components = entries
  .filter((d) => d.isFile())
  .map((d) => d.name)
  .filter((name) => name.endsWith(".tsx") && !name.endsWith(".stories.tsx") && !name.endsWith(".test.tsx"));

const stories = new Set(
  entries
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => name.endsWith(".stories.tsx")),
);

const missing = components.filter((name) => !stories.has(name.replace(/\.tsx$/, ".stories.tsx")));

if (missing.length > 0) {
  console.error(
    `✖ Storybook coverage gap. Each src/components/ui/*.tsx must have a matching *.stories.tsx peer.\n`,
  );
  for (const name of missing) {
    console.error(`  - ${relative(repoRoot, join(uiDir, name))} is missing ${name.replace(/\.tsx$/, ".stories.tsx")}`);
  }
  console.error(`\nAdd the story file or remove the component before merging.`);
  process.exit(1);
}

console.log(`✓ Storybook coverage: ${components.length} primitive(s), all have stories.`);
