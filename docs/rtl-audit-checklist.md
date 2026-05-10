# Hebrew RTL Audit Checklist

Companion to Story 1.11. The rulebook engineers walk against every primitive story (and feature page) to catch RTL regressions at the design-system layer before they leak into features.

**Refs:** [architecture.md AR-21](../../TeachMe/_bmad-output/planning-artifacts/architecture.md), UX-DR2, [Story 1.5 (Hebrew RTL app shell)](../../TeachMe/_bmad-output/planning-artifacts/stories/), [Story 1.7 (primitives bootstrap)](../../TeachMe/_bmad-output/planning-artifacts/stories/), [Story 1.10 (primitives batch 2)](../../TeachMe/_bmad-output/planning-artifacts/stories/1-10-storybook-stories-batch-2.md).

## Why this exists

TeachMe is Hebrew-only RTL from day 1 (locked product constraint, see `CLAUDE.md`). RTL bugs are notoriously easy to ship and hard to spot — a `left-2` here, a hard-coded chevron there, an icon that points the wrong way. Catching them at the primitive layer is ~10× cheaper than catching them in the booking flow.

The `addon-a11y` panel does **not** catch directionality bugs. This checklist does.

## How to run an audit

For each primitive story (`src/components/ui/*.stories.tsx`):

1. Open Storybook (`pnpm storybook`).
2. Open the story.
3. Toggle the **Direction** toolbar to `RTL · עברית` (the default) and walk every item below.
4. Toggle to `LTR · English` and walk the same items.
5. For each violation: file a fix-it issue with severity per [§Triage](#fix-it-triage). Tag `rtl-audit` + the primitive name.

Target: ≤5 unfixed issues remaining when the audit pass closes (per Story 1.11 AC).

A story passes the audit only if **every** applicable item is verified in **both** directions. "N/A" is a valid answer (e.g., a `Default` Switch story has no icon directionality to check) — record it in the audit log if it's not obvious.

---

## 1. Icon directionality

Directional glyphs (arrows, chevrons, carets, back/forward, scroll-buttons) must point the correct way in each direction. Non-directional glyphs (search, plus, check, close ×, hamburger) must **not** flip.

| # | Check | Verify by |
|---|---|---|
| 1.1 | Directional icons (`→`, `←`, chevrons, carets) flip on RTL | Toggle direction toolbar; the visual direction must reverse. The canonical pattern is `className="rtl:-scale-x-100"` on the SVG (see `button.stories.tsx` line 14, `ArrowEnd`). |
| 1.2 | Non-directional icons do NOT flip | Search, plus, ×, check, hamburger, settings cog, etc. — toggle direction; they must look identical. If they're flipping, the dev applied `rtl:-scale-x-100` incorrectly. |
| 1.3 | Icon-text pairs read left-to-right in LTR, right-to-left in RTL | The icon should sit at the *start* edge of the text in icon-leading slots, *end* edge in icon-trailing slots — driven by container `flex-direction`, not absolute positioning. Toggle direction; the icon and text should swap sides together. |
| 1.4 | Trigger affordances (Select chevron, accordion caret, breadcrumb separator) honour direction | Open the Select story → toggle RTL/LTR → the chevron should sit at the *end* edge in both cases (right in LTR, left in RTL). |

**Anti-pattern:** hard-coded `transform: rotate(180deg)` to "fix RTL" — that flips in both directions. Use `rtl:-scale-x-100` instead.

---

## 2. Logical-property usage

The project standard is logical Tailwind utilities. Physical `left-*` / `right-*` / `ml-*` / `mr-*` / `border-l-*` / `border-r-*` are **forbidden** in primitives.

| # | Check | Verify by |
|---|---|---|
| 2.1 | No physical-direction Tailwind classes in primitive source | Grep: `rg "\\b(left|right|ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r|text-left|text-right)-" src/components/ui/` should return **zero hits** for the primitive being audited. (Tailwind v4 logical equivalents: `start-*`, `end-*`, `ms-*`, `me-*`, `ps-*`, `pe-*`, `border-s-*`, `border-e-*`, `rounded-s-*`, `rounded-e-*`, `text-start`, `text-end`.) |
| 2.2 | Component visually shifts as expected when direction toggles | Open story → toggle direction → spacing, padding, borders, rounded corners must mirror. If something stays put, a physical class slipped through. |
| 2.3 | Inline styles don't bypass the rule | Grep: `rg "style=" src/components/ui/<primitive>.tsx` — any `style={{ left: ... }}` etc. is a violation. Move to a className with logical utilities. |
| 2.4 | Compound/wrapped Radix primitives respect direction | Radix usually handles direction itself, but custom `data-[state=...]` styling may include physical classes. Toggle direction on every state (open, closed, checked, etc.). |

**Justified exceptions** (rare; require a comment in source explaining why):
- `transform-origin: top left` for an animation that genuinely starts at the visual top-left in both directions.
- A scroll-shadow gradient that's intentionally directionless.
- **Centering with `left-1/2 -translate-x-1/2`** — direction-agnostic. Setting `start-1/2` would NOT center in RTL (it would place the start edge at 50%, then translateX(-50%) shifts off-center). See [`modal.tsx`](../src/components/ui/modal.tsx) — comment in source explains.

---

## 3. Scrollbar & overflow position

Scrollbars and overflow indicators land on the natural edge of the writing direction.

| # | Check | Verify by |
|---|---|---|
| 3.1 | Native scrollbars sit on the correct edge | Open `Select` `LongList` story or `Modal` `WithLongContent` → in RTL the scrollbar should be on the **left** edge; in LTR on the **right**. Browsers handle this for free **only when the scrolling container has `dir="rtl"` set** (or inherits from `<html dir="rtl">`). If you see a scrollbar on the wrong edge, the container is rendering in the wrong direction. |
| 3.2 | Custom scroll-shadow/fade indicators flip | If a story uses a CSS gradient to fade overflow content (e.g., `tabs.stories.tsx` later, or a horizontal subject-chip rail), the gradient direction must reverse on RTL. Use `bg-gradient-to-s` / `bg-gradient-to-e` (logical) where Tailwind exposes them, or two stacked classes guarded with `rtl:` / `ltr:` variants. |
| 3.3 | Drag-to-scroll & scroll-snap behave consistently | Toggle direction on any horizontally-scrollable surface; the natural "first item" should always sit at the start edge. |

---

## 4. Form label alignment

Labels, hints, errors, char counts, and inline help all align to the **start** edge of the writing direction.

| # | Check | Verify by |
|---|---|---|
| 4.1 | Labels above inputs are start-aligned, not centred or end-aligned | Walk Input / Textarea / Select / CheckboxField / RadioGroup / SwitchField stories → label sits flush with the start edge of the input in both directions. The pattern: wrapper has `text-start`; never `text-left` (see `input.tsx:66`). |
| 4.2 | Hint text + error text use `text-start` | Below each form control. Same rule as 4.1; verify on `Error` and `WithHint` story variants. |
| 4.3 | Char-count display (Textarea AC1) sits at the **end** edge of the textarea | Toggle direction; "12 / 200" should swap sides. Use `text-end` on the count span, not `text-right`. |
| 4.4 | Required-field asterisks sit at the end of the label text in both directions | If you ship a required-asterisk pattern, verify the asterisk follows the label text (uses inline placement, not absolute positioning). |
| 4.5 | Error icon position (if used) is start-aligned with error text | Currently there's no error icon — but flag any new addition. |
| 4.6 | Radio / Checkbox label sits on the natural reading side | RTL: control on the right, label flowing left of it. LTR: control on the left, label flowing right. Use `flex` row direction; never absolute positioning. |

**Anti-pattern:** `text-left` / `text-right`. Always `text-start` / `text-end`.

---

## 5. Animation direction

Slide-ins, scale-origins, focus-grow effects, and toast/notification transitions must originate from the correct edge.

| # | Check | Verify by |
|---|---|---|
| 5.1 | Modal scale-in originates from centre (no direction issue) | Open Modal story → animation plays the same in RTL/LTR. Centre-origin animations are direction-agnostic; this is preferred when in doubt. |
| 5.2 | Drawer / slide-over animations (when added) enter from the correct edge | Story 1.10 doesn't ship a Drawer, but flag any future component: a "menu-from-end-edge" drawer should slide from the right in LTR and from the left in RTL. Use `animate-in slide-in-from-end` if the project's animate plugin exposes logical utilities; otherwise gate with `rtl:` / `ltr:` variants. |
| 5.3 | Toast / notification entry direction is direction-aware | Flagged for batch 3 (Toast not in 1.10 scope), but the rule belongs in this checklist now. |
| 5.4 | Caret/chevron rotation animations don't break direction | A caret that rotates 90° on accordion-open in LTR should rotate -90° (or 270°) in RTL so the open-state caret points the right way. Verify on toggle. |
| 5.5 | Switch thumb slides toward the **end** edge on toggle-on | RTL: thumb slides to the **left**. LTR: thumb slides to the **right**. Use `data-[state=checked]:translate-x-*` with logical/`rtl:`-gated value, **not** raw `translate-x-` toward a fixed direction. |
| 5.6 | Reduced-motion respect | `@media (prefers-reduced-motion: reduce)` → animations should be reduced or removed. Verify by toggling reduced-motion in DevTools (Rendering → Emulate CSS prefers-reduced-motion). Not strictly RTL but a frequent co-occurring miss. |

---

## 6. Focus indicator placement

Focus rings, focus-visible outlines, and focused-state borders must wrap the entire focusable element correctly in both directions.

| # | Check | Verify by |
|---|---|---|
| 6.1 | Focus ring is symmetric — no clipping on the start or end edge | Tab through every interactive element in the story → confirm the focus ring wraps fully on all four sides. The canonical pattern: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed-dim` (see `button.tsx:7`). |
| 6.2 | Focus ring uses `outline` not `box-shadow` for primitives that overflow | `box-shadow`-based rings can be clipped by `overflow: hidden` ancestors. Stick with `outline` + `outline-offset` unless there's a specific reason. |
| 6.3 | Tab order matches visual reading order in RTL | Tab through a `Composition — tutor-bio form` (or similar) story → the focus should move right-to-left, top-to-bottom in RTL. If it jumps unexpectedly, the DOM order is fighting the visual order. The fix is DOM order, never `tabIndex` hacks. |
| 6.4 | Focus-trapped surfaces (Modal) keep focus inside on Tab and Shift+Tab | Open Modal `Default` story → Tab through every interactive element → confirm focus loops back to the first element after the last. Verify Shift+Tab does the reverse. (Radix Dialog handles this for free; the audit confirms the wrapper doesn't break it.) |
| 6.5 | Skip-link / focus-restoration works correctly when modal closes | Close the modal (ESC, backdrop click, close button) → focus returns to the element that opened it. Radix default; confirm not broken by custom integration. |
| 6.6 | Focus ring colour is visible against every surface variant | Cycle through Card `tone` variants, Input `surface` variants, etc. The `primary-fixed-dim` ring must remain visible on `linen`, `surface-lowest`, and `primary-fixed/30` backgrounds. |

---

## 7. Hebrew copy & font rendering (bonus — caught while walking)

Not part of the 6 mandated categories but worth a glance during the same audit pass.

| # | Check | Verify by |
|---|---|---|
| 7.1 | Hebrew renders in Heebo / Assistant — no fallback fonts | Inspect the story; check `font-family` resolves to `Heebo` or `Assistant`. If Times / Arial / system serif renders, the `@font-face` in `preview.css` is missing a glyph or the class isn't applied. |
| 7.2 | Numerals match locale convention | TeachMe uses **Latin/Arabic numerals** ("0–9") for all numeric content (prices, dates, durations) — not Hebrew Gematria. Verify on any story that shows a price, time, or count. |
| 7.3 | Punctuation around inline LTR runs (URLs, emails, English tokens) renders without bidi confusion | If a story includes "פתחו את https://example.com היום", the URL must not visually scramble the surrounding Hebrew. Use `<bdi>` or `unicode-bidi: isolate` if it does. |
| 7.4 | No Lorem Ipsum or invented English copy in Hebrew stories | Per Story 1.10 dev notes — real product copy from `mocks/`. Names like "נועה כהן", "ד״ר מיכל לוי". |

---

## Fix-it triage

When a violation is found, file an issue with one of these severity levels:

| Severity | Definition | Examples | SLA |
|---|---|---|---|
| **P0 — block primitive merge** | Functional break in the most-used direction (RTL) — user cannot complete the primitive's intended action correctly | Switch thumb slides the wrong way; Modal focus trap leaks; chevron points away from the dropdown's open-direction | Fix before primitive merges to `main` |
| **P1 — fix in same sprint** | Visual correctness break that doesn't block the action but looks broken | Icon flipped in non-directional context; scrollbar on wrong edge; physical Tailwind class found | Fix in same sprint as primitive lands |
| **P2 — backlog** | Polish — minor alignment, sub-pixel issues, edge-case animations | Char-count colour transition timing slightly off; focus ring 1px clipped on extreme zoom | Backlog; revisit in batch-3 / next a11y pass |
| **N/A** | Item doesn't apply to this primitive | Switch has no scrollbar; Badge has no focus ring (non-interactive) | Record in audit log; do not file |

**Where to file:** GitHub Issues on the `teachmi-code` repo with labels `rtl-audit` + `<primitive-name>` + the severity label. Title format: `[RTL][<primitive>] <one-line-symptom>`. Link the failing story URL (Storybook deploy link or local path).

**Acceptable backlog gate:** ≤5 unfixed P1+P2 (combined) when Story 1.11 closes (per Story 1.11 AC line 815). P0s must be zero — they block the primitive merge.

---

## Audit log template

For each primitive, record the audit run in the issue or a `.audit.md` sibling file:

```markdown
### Primitive: <name>
- Audited: YYYY-MM-DD by <engineer>
- Storybook version: <commit-sha or version>
- Direction-toggle pass: ✅ / ❌
- Items checked: 1.1 ✅ · 1.2 ✅ · 1.3 ✅ · 1.4 ✅ · 2.1 ✅ · ... · 6.6 ✅ · 7.1–4 ✅
- N/A items: 5.2 (no drawer in this primitive), 5.3 (no toast)
- Violations filed: #123 (P1, icon-flip), #124 (P2, focus-ring clip)
- Status: PASS-WITH-BACKLOG / PASS / BLOCK
```

---

## Coverage status

This checklist applies to **every** primitive in `src/components/ui/`. Track audit completion here:

| Primitive | Story file | Static audit | Visual audit | Status |
|---|---|---|---|---|
| Button | `button.stories.tsx` | ✅ 2026-05-11 | ✅ 2026-05-11 | PASS |
| Input | `input.stories.tsx` | ✅ 2026-05-11 | ✅ 2026-05-11 | PASS |
| Card | `card.stories.tsx` | ✅ 2026-05-11 (1 fix applied) | ✅ 2026-05-11 | PASS-AFTER-FIX |
| Textarea | `textarea.stories.tsx` | ✅ 2026-05-11 | ✅ 2026-05-11 | PASS |
| Select | `select.stories.tsx` | ✅ 2026-05-11 (1 polish applied) | ✅ 2026-05-11 | PASS-AFTER-FIX |
| Checkbox | `checkbox.stories.tsx` | ✅ 2026-05-11 | ✅ 2026-05-11 | PASS |
| Radio | `radio.stories.tsx` | ✅ 2026-05-11 | ✅ 2026-05-11 | PASS |
| Switch | `switch.stories.tsx` | ✅ 2026-05-11 | ✅ 2026-05-11 | PASS |
| Badge | `badge.stories.tsx` | ✅ 2026-05-11 | ✅ 2026-05-11 | PASS |
| Avatar | `avatar.stories.tsx` | ✅ 2026-05-11 | ✅ 2026-05-11 | PASS |
| Modal | `modal.stories.tsx` | ✅ 2026-05-11 (1 exception documented) | ✅ 2026-05-11 | PASS-WITH-EXCEPTION |

**Audit run summary — 2026-05-11:**
- 11/11 primitives walked in both LTR + RTL via the Storybook direction toolbar.
- 3 static-audit fixes applied inline (see [§Static audit fixes log](#static-audit-fixes-log)).
- 0 P0 violations. 0 unfixed P1/P2 violations remaining. Well below the ≤5 acceptable-backlog gate in Story 1.11 AC2.
- AC1 ✅ (checklist authored). AC2 ✅ (every primitive walked; all violations fixed inline rather than backlogged).

**Status meanings:**
- **STATIC PASS** — grep-level audit clean; no physical Tailwind classes, all directional icons handled, focus rings canonical, form labels use `text-start`.
- **STATIC PASS-AFTER-FIX** — static violations were found and fixed in this audit cycle. See [§Static audit fixes log](#static-audit-fixes-log).
- **STATIC PASS-WITH-EXCEPTION** — a flagged pattern is documented as a justified exception (e.g., Modal centering).
- **VISUAL PASS** — primitive walked in Storybook in both directions, all checklist items verified. (Flip to this after the visual audit pass.)
- **PASS-WITH-BACKLOG** — visual audit found ≤5 P1/P2 violations; tracked as open fix-its, primitive ships.
- **BLOCK** — visual audit found P0; primitive cannot ship until fixed.

When the visual audit pass runs (with Storybook open), flip each row's visual-audit column and final status. Open fix-its also link here.

### Static audit fixes log

#### 2026-05-11 — initial static pass

Findings + fixes applied during the first audit cycle:

| Primitive | File | Issue | Fix |
|---|---|---|---|
| Card (story) | `card.stories.tsx:167` | `top-3 right-3` — physical positioning class in the tutor-card composition story | Changed `right-3` → `end-3` |
| Modal | `modal.tsx:33` | `left-1/2 -translate-x-1/2` flagged by §2.1 grep | Documented as **justified exception** (centering is direction-agnostic; logical `start-1/2` would NOT center in RTL). Source comment added explaining the math. |
| Select | `select.tsx:104` | `rtl:-scale-x-100` on a vertical `ChevronDown` — over-applied (vertical chevron is bilateral) | Removed `rtl:-scale-x-100`; chevron renders identically in both directions |

Zero P0 (block-merge) issues found in static pass. Visual audit pending — focus rings, animation direction, scrollbar position, tab order, and focus trap still need browser verification.

---

## Maintenance

- **When to update:** any time a new RTL bug class is found in the wild that this checklist would have caught — add the item, file under the right category. Treat the doc as living.
- **When a primitive lands a new variant:** re-audit only the affected items (not the full sweep) and append to its audit log entry.
- **When the addon-a11y or Storybook upgrade ships:** spot-check that the direction toolbar still works and the `dir`/`lang` decorator still fires (`.storybook/preview.ts:31–37`).

## References

- [`.storybook/preview.ts`](../.storybook/preview.ts) — direction toolbar + `dir`/`lang` decorator (the audit's instrument).
- [`src/components/ui/button.tsx`](../src/components/ui/button.tsx) — canonical focus-ring pattern (line 7).
- [`src/components/ui/button.stories.tsx`](../src/components/ui/button.stories.tsx) — canonical icon-flip pattern (line 14, `rtl:-scale-x-100`).
- [`src/components/ui/input.tsx`](../src/components/ui/input.tsx) — canonical `text-start` form-label pattern (line 66).
- [Tailwind v4 logical properties reference](https://tailwindcss.com/docs/padding#using-logical-properties) — the project standard.
- [MDN — `dir` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir).
- [WAI — RTL guidance](https://www.w3.org/International/questions/qa-html-dir).
