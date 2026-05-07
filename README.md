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
