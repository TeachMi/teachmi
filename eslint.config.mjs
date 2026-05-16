// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Storybook prod build output:
    "storybook-static/**",
  ]),
  ...storybook.configs["flat/recommended"],
  // Story 2.10 — RTL footgun guard.
  //
  // Tailwind's `flex-row-reverse`, `text-left`, `text-right`, `justify-end`,
  // `ml-*`, `mr-*`, `pl-*`, `pr-*` are PHYSICALLY directional. In a Hebrew
  // RTL document they don't mean "align to the right" — they mean "align to
  // the END of writing direction" which is LEFT. Story 3.1's RTL sweep
  // documented this lesson; this rule catches new violations in the dev
  // loop. Logical-property equivalents: `flex` (no reverse) / `text-start` /
  // `justify-start` / `me-*` / `ms-*` / `pe-*` / `ps-*`.
  //
  // `warn` (not `error`) so existing pre-Story-3.1 violations don't block
  // CI; surfaces in PR diffs and the dev loop for new code. PR template
  // checklist is the safety net for edge cases that need an opt-out
  // (e.g. a literal LTR widget like the price-input ₪ slot).
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "Literal[value=/(?:^|\\s)(flex-row-reverse|text-left|text-right|justify-end|m[lr]-\\d+|p[lr]-\\d+)(?:\\s|$)/]",
          message:
            "RTL footgun: physical-direction Tailwind class. Use logical equivalents (text-start, justify-start, me-/ms-/pe-/ps-, plain flex). See Story 2.10 + 3.1.",
        },
        {
          selector:
            "TemplateElement[value.raw=/(?:^|\\s)(flex-row-reverse|text-left|text-right|justify-end|m[lr]-\\d+|p[lr]-\\d+)(?:\\s|$)/]",
          message:
            "RTL footgun: physical-direction Tailwind class. Use logical equivalents (text-start, justify-start, me-/ms-/pe-/ps-, plain flex). See Story 2.10 + 3.1.",
        },
      ],
    },
  },
]);

export default eslintConfig;
