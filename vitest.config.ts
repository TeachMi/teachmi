import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Match the `@/*` → `./src/*` alias from `tsconfig.json` so unit tests can
  // import production code that uses `@/`-prefixed paths without forcing
  // every transitive `@/` dependency to be `vi.mock`'d. Existing
  // `vi.mock("@/foo", ...)` calls continue to work — vitest intercepts
  // mocked specifiers before the resolver runs. Added by Story 3.1
  // (homepage); previously, tests either used relative imports or had to
  // mock every `@/` dep that the unit-under-test transitively imported.
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
    },
  },
  test: {
    projects: [
      {
        // Plain Node-side unit tests (src/**/__tests__/*.test.ts and co-located *.test.ts).
        // This is what `pnpm test` and CI run.
        resolve: {
          alias: {
            '@': path.resolve(dirname, 'src'),
          },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/**/__tests__/**/*.test.{ts,tsx}',
            'src/**/*.test.{ts,tsx}',
            // CI-guard scripts (e.g., check-migrations.mjs) under scripts/ —
            // added by Story 1.23. Pure-Node ESM tests, no TS transpilation.
            'scripts/**/__tests__/**/*.test.mjs',
          ],
          exclude: [
            '**/*.stories.*',
            '**/node_modules/**',
            '**/dist/**',
            '**/.next/**',
            'storybook-static/**',
          ],
        },
      },
      {
        // Headless Storybook story renders via @storybook/addon-vitest + Playwright Chromium.
        // Opt-in only: `pnpm test:storybook`. Needs `pnpm exec playwright install chromium`
        // run once locally (Storybook init does this; on CI it's not currently wired —
        // tracked as a follow-up alongside axe-core a11y enforcement).
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
