<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Schema changes auto-deploy on push to `e2e` and `main`

The `migrate-e2e` and `migrate-prod` GitHub Action jobs (in `.github/workflows/ci.yml`) run `pnpm db:migrate` against the corresponding Neon branch after every push to `e2e` and `main`, once the `quality` job passes. You do **NOT** need to manually run `pnpm db:migrate` against e2e or prod.

**Your job when editing `src/lib/db/schema.ts`:**

1. Make the change in `schema.ts`.
2. Run `pnpm db:generate` to produce a new migration file under `drizzle/`.
3. Commit `drizzle/<num>_<slug>.sql` + `drizzle/meta/_journal.json` updates in the same PR.
4. The `check:migrations` CI step refuses to merge if you forget step 2/3.

Local-dev migrations remain manual: `DATABASE_URL=<dev-url> pnpm db:migrate`.

**Why this exists:** Stories 1.13 + 1.14 silently shipped to prod for ~24h with code referencing tables that didn't exist (no one had run `pnpm db:migrate` against the prod Neon branch). Discovered 2026-05-12 via dogfood-seed attempt; Story 1.23 closes the gap. See `drizzle/README.md` rule 6.

# Proxy / Auth middleware shape — `export { auth as proxy }`, not `export default auth(handler)`

`src/proxy.ts` re-exports `auth` from `lib/auth/auth.ts` under the **named** export `proxy`, not as a default. The reason is subtle but load-bearing:

```ts
// src/proxy.ts — current, working
export { auth as proxy } from "@/lib/auth/auth";
export const config = { matcher: ["/dashboard/:path*"] };
```

**Why not `export default auth((request) => { ... })` (the next-auth v5 docs pattern)?** `auth.ts` configures NextAuth with a **dynamic** config factory (`NextAuth(() => createAuthConfig())`) — this defers DB-client creation until auth is actually invoked, which is needed because the Drizzle adapter loads DB env vars eagerly and would break unit tests that don't have a DATABASE_URL. In the dynamic-config branch of next-auth v5 beta, the outer `auth` function is `async` (see `node_modules/next-auth/lib/index.js` lines 41–86), so `auth(handler)` returns a `Promise<NextMiddleware>` — not the `NextMiddleware` the TypeScript signature claims. `next start`'s Proxy loader checks `typeof handlerUserland === 'function'` at runtime and rejects Promise-typed defaults, throwing `The Proxy file "/proxy" must export a function named 'proxy' or a default function.`

**Why `export { auth as default } from "..."` also doesn't work:** Next 16's build-time static analyzer (`get-page-static-info.js`) only recognizes `default` from `ExportDefaultDeclaration`/`ExportDefaultExpression`, not from `ExportNamedDeclaration` specifiers. But the same analyzer **does** recognize `proxy` as a valid named export via `export { foo as proxy }`. Hence the chosen shape.

**If you ever need to add custom logic** (cookie inspection, audit logging, redirect rewrites), wrap auth manually instead of using the `auth(handler)` wrapper pattern. Either:

```ts
// Option A: export a wrapping function (satisfies both static analyzer + runtime check)
import { auth } from "@/lib/auth/auth";
export default async function proxy(request: NextRequest) {
  // pre-logic
  const result = await (auth as unknown as (req: NextRequest) => Promise<Response>)(request);
  // post-logic
  return result;
}
```

Or switch `auth.ts` to static config (`NextAuth(createAuthConfig())`) — but then `getAuthAdapter()` runs at module-import time and breaks any test that imports any module that transitively imports `auth.ts`. Don't go there without solving the test DB-stub problem.

# Workspace root: keep `C:\workspace\` clean

Next.js 16's Turbopack uses `find-up` to locate the workspace root, walking up from the project dir looking for `pnpm-workspace.yaml` or any lockfile. The result is the directory of the **highest** match. If a stray `package.json` or `pnpm-lock.yaml` lives at `C:\workspace\` (the parent of `teachmi-code/`), Next will pick `C:\workspace\` as the root, scope its file watcher to that entire tree (multi-GB including `TeachMe/`, `_bmad/`, sibling repos), and exhaust paging memory until the machine freezes. If you ever see the warning "Next.js inferred your workspace root, but it may not be correct" with `Detected additional lockfiles` pointing inside `teachmi-code/`, **clear the offending parent files** rather than tweaking `turbopack.root` (which doesn't override the find-up walk).

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
