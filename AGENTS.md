<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
