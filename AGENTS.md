<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ⚠️ Known broken: `pnpm dev` and `pnpm start` (as of 2026-05-11, mid Story 1.12)

**Do not run `pnpm dev` or `pnpm start` on this repo.** Both fail in ways that have, repeatedly, frozen the local Windows machine by exhausting memory. Use `pnpm build` + static-HTML inspection of `.next/server/app/*.html` for verification until this is fixed.

**`pnpm dev` symptom:** Boots ("Ready in ~500ms") but every page compile fails with `Error: Can't resolve 'tailwindcss' in 'C:\workspace'`. The resolver is rooted at `C:\workspace` (the parent of `teachmi-code/`), not `teachmi-code/` itself. Removing the parent's `package.json` / `pnpm-lock.yaml` / `node_modules` did **not** fix it — there's another marker we haven't identified. Setting `turbopack.root` and `outputFileTracingRoot` in `next.config.ts` did **not** fix it. The watcher then keeps trying and exhausts paging.

**`pnpm start` symptom:** Boots cleanly. Every request returns HTTP 500 with `The Proxy file "/proxy" must export a function named 'proxy' or a default function.` This is a runtime check in Next 16's Proxy/Middleware loader. `src/proxy.ts` (from Story 1.4) does `export default auth(...)` from `next-auth@5.0.0-beta.31`. `next build` accepts the shape; `next start` rejects it. Likely a next-auth-beta ↔ Next 16 incompatibility.

**What works:** `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:stories`, `pnpm run ci`. The whole CI pipeline is green; only the live dev/serve surface is broken.

**Before any UI-heavy story (1.13+, Epics 2-7) is started, somebody needs a focused half-hour to fix this** — the static-HTML escape hatch will not scale once stories involve forms, client-side state, or auth-gated views.

# Storybook authoring rule — composition stories must mirror a mock

Stories in `src/components/ui/*.stories.tsx` come in two flavors. Treat them differently.

**Catalog stories** (`Default`, `Sizes`, `Disabled`, `Error`, `WithHint`, `English`, etc.) are state inventories. They exhaustively show the variant matrix for the primitive. They do **not** need to match a mock — invented copy is fine, as long as it's real Hebrew product copy and not Lorem Ipsum.

**Composition stories** — any story whose `name` starts with `"Composition — "` — represent the primitive being used in a real product surface. These **must** mirror an actual mock under [`TeachMe/mocks/*.html`](../TeachMe/mocks). Concretely:

1. Pick a mock whose surface uses this primitive (e.g. Avatar → `dashboard.html`, Modal Danger → `cancel-modal.html`, Switch → `student-settings.html`, Radio role-picker → `signup.html`).
2. Reproduce the structure and the visible copy from that mock — labels, placeholders, names, status text. Don't invent new copy when the mock already has it.
3. Cite the mock explicitly via `parameters.docs.description.story`. The first line should start with `Mirrors mocks/<filename>.html` so the citation is unambiguous in autodocs and discoverable by the CI guard. Example:

```ts
export const TutorBio: Story = {
  name: "Composition — tutor profile bio editor",
  parameters: {
    docs: {
      description: {
        story:
          "Mirrors `mocks/tutor-profile-editor.html` — the תמונה וביוגרפיה section. ...",
      },
    },
  },
  render: () => /* ... */,
};
```

4. Use design-system primitives (`Card`, `Button`, `Input`, etc.) for the container and surrounding chrome — don't reproduce card-like styling inline with `bg-white border border-linen-border rounded-2xl`. The point is to dogfood the system, not parallel-implement it.

If no mock exists for the surface you want to demo, **don't write a Composition story** — either author the mock first, or stick to catalog-style stories that show the primitive's variants.

The CI guard [`scripts/check-stories.mjs`](scripts/check-stories.mjs) enforces rule #3 in `pnpm check:stories`. Adding a Composition story without a `mocks/` reference will fail CI.
