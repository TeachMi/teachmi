#!/usr/bin/env node
/* Story 1.7 CI guard: every src/components/ui/*.tsx (excluding *.stories.tsx
 * and *.test.tsx) must have a matching *.stories.tsx peer. The design-system
 * catalog rots fast without this — see epics.md Story 1.7.
 *
 * Story 1.10 follow-up: every Composition story (name starts with
 * "Composition — ") must cite a `mocks/...` reference so the design system
 * stays anchored to the UX mocks it's meant to dogfood. See AGENTS.md
 * "Storybook authoring rule". */
import { readdir, readFile } from "node:fs/promises";
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

const storyFiles = entries
  .filter((d) => d.isFile())
  .map((d) => d.name)
  .filter((name) => name.endsWith(".stories.tsx"));

const stories = new Set(storyFiles);

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

/* Composition story rule: any story object whose `name` starts with
 * "Composition — " must contain a `mocks/` reference inside its source
 * (typically in parameters.docs.description.story). */
const compositionViolations = [];
let totalCompositionStories = 0;

for (const file of storyFiles) {
  const fullPath = join(uiDir, file);
  const source = await readFile(fullPath, "utf8");

  /* Match each `export const Foo: Story = { ... };` block. We need the full
   * object body to scope the `mocks/` check to that one story — a sibling
   * story citing a mock should not let an uncited story slip through. */
  const exportRegex = /export\s+const\s+(\w+)\s*:\s*Story\s*=\s*\{/g;
  let match;
  while ((match = exportRegex.exec(source)) !== null) {
    const exportName = match[1];
    const bodyStart = match.index + match[0].length;
    /* Walk the brace depth from the opening `{` to find the matching `}`. */
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const body = source.slice(bodyStart, i - 1);

    /* Pull the story's display name. Fall back to the export name. */
    const nameMatch = body.match(/name\s*:\s*"([^"]+)"/);
    const storyName = nameMatch ? nameMatch[1] : exportName;

    /* Composition stories use an em-dash; accept ASCII hyphen as a fallback
     * so the rule isn't trivially bypassed by a typo. */
    const isComposition = /^Composition\s*[—\-]\s/.test(storyName);
    if (!isComposition) continue;

    totalCompositionStories++;

    /* Look for an explicit `mocks/<file>.html` reference within the story body. */
    const hasMockRef = /mocks\/[\w-]+\.html/.test(body);
    if (!hasMockRef) {
      compositionViolations.push({
        file: relative(repoRoot, fullPath),
        export: exportName,
        name: storyName,
      });
    }
  }
}

if (compositionViolations.length > 0) {
  console.error(
    `✖ Composition stories must mirror a mock. Add a parameters.docs.description.story citing the source mock (e.g. "Mirrors \`mocks/dashboard.html\` — ...").\n`,
  );
  for (const v of compositionViolations) {
    console.error(`  - ${v.file} → ${v.export} ("${v.name}") has no \`mocks/<filename>.html\` reference`);
  }
  console.error(
    `\nSee AGENTS.md "Storybook authoring rule — composition stories must mirror a mock" for the full convention.`,
  );
  process.exit(1);
}

console.log(`✓ Storybook coverage: ${components.length} primitive(s), all have stories.`);
console.log(`✓ Composition stories: ${totalCompositionStories} cited a mocks/ reference.`);
