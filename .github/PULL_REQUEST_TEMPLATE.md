## Summary

-

## Target Branch

- [ ] `feature/*` -> `e2e`
- [ ] `e2e` -> `main`

## Checks

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Socket scan green

## E2E -> Main Promotion

Complete only for production promotion PRs.

- [ ] Changes since last production deploy summarized
- [ ] Migrations listed with hash and brief description
- [ ] Latest E2E deploy smoke checked at `e2e.teachme.app`
- [ ] Playwright report linked
- [ ] One manual reviewer approved
