# TeachMe App

Product application scaffold for TeachMe. Planning and UX source documents remain in `../design`.

## Requirements

- Node.js `>=20.9.0`
- pnpm `10.33.3`

## Commands

Run from this directory:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm start
```

The UI is Hebrew-first and RTL from the root layout. The app shell and design tokens use the TeachMe mock palette from `../design/mocks/theme.js`.

## Fonts

Hebrew fonts are self-hosted through `next/font/local` so production builds do not depend on build-time Google Fonts downloads:

- `public/fonts/heebo/Heebo-wght.ttf`
- `public/fonts/assistant/Assistant-wght.ttf`

Both files are sourced from the Google Fonts repository and licensed under the SIL Open Font License 1.1.

## Design system + Storybook

All shared UI primitives live under `src/components/ui/`. Each primitive has a matching `*.stories.tsx` peer. A CI guard ([`scripts/check-stories.mjs`](scripts/check-stories.mjs), surfaced via `pnpm check:stories`) enforces both:

1. Every `src/components/ui/*.tsx` must have a `*.stories.tsx` peer.
2. Every Storybook story whose `name` starts with `"Composition — "` must cite an actual mock under `../TeachMe/mocks/<file>.html` in its `parameters.docs.description.story`. See [`AGENTS.md`](AGENTS.md) → *Storybook authoring rule* for the full convention.

### Current primitive catalog (11)

Story 1.7 introduced **Button, Input, Card**; Story 1.10 added **Textarea, Select, Checkbox, Radio, Switch, Badge, Avatar, Modal**. All are Hebrew-first (RTL by default) with a Storybook toolbar toggle for LTR verification. Form-shaped primitives (Input, Textarea, Checkbox) ship label/hint/error wiring via `aria-describedby` chaining; interactive primitives (Select, Checkbox, Radio, Switch, Avatar, Modal) wrap Radix UI for accessibility/keyboard/focus-trap defaults.

### Commands

```bash
pnpm storybook              # local dev server on :6006
pnpm build-storybook        # static build (output: storybook-static/)
pnpm test:storybook         # headless portable-story render via addon-vitest
pnpm check:stories          # CI guard: coverage + mocks/ citations
```

### Conventions (cheat sheet)

- `cva` for variant maps; `forwardRef` named function components; `cn(...)` from `@/lib/cn` for class merging
- `import type` for type-only imports; no `any`; strict TypeScript
- Stories use Hebrew copy by default, with an `English` story that sets `globals: { direction: "ltr" }`
- Logical Tailwind utilities only: `start-*` / `end-*` / `ms-*` / `me-*` / `border-s-*` / `border-e-*`. Never raw `left-*` / `right-*` / `ml-*` / `mr-*`
- Radix primitives need a `<DirectionProvider>` ancestor to respect `dir="rtl"` — see [`src/components/providers/radix-providers.tsx`](src/components/providers/radix-providers.tsx). Wired into both `src/app/layout.tsx` and `.storybook/preview.ts`
- `addon-a11y` panel in Storybook is the verification surface for accessibility — partials' `landmark-one-main` warning is acceptable; contrast / aria / name violations must be zero
