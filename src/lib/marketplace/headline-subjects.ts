// Single source of truth for the four headline subjects displayed prominently
// on the marketplace homepage (FR17, Story 3.1).
//
// Why hardcoded: the `subjects.headline_four` boolean column does NOT exist
// at MVP 1 (deferred from Story 2.1's schema work). Story 3.6 (admin taxonomy
// editor) MAY introduce it; when that happens, refactor `HEADLINE_FOUR_SUBJECT_SLUGS`
// into a derived query:
//
//   SELECT slug FROM subjects WHERE headline_four = true AND is_active = true
//   ORDER BY display_name_he COLLATE "he_IL"
//
// Downstream consumers (`<HeadlineFourSubjects>` + future analytics tags)
// read from this module either way — only the implementation flips.
//
// The slugs match the seeded values in `src/lib/db/seed-data.ts` exactly.
// **Note: the product brief calls the third subject "lashon" colloquially;
// the seeded slug is `hebrew-lashon` with `displayNameHe = "עברית ולשון"`.**

export const HEADLINE_FOUR_SUBJECT_SLUGS = [
  "mathematics",
  "english",
  "hebrew-lashon",
  "psychometric",
] as const;

export type HeadlineFourSlug = (typeof HEADLINE_FOUR_SUBJECT_SLUGS)[number];

// Render order for the homepage hero cards. Hebrew alphabetical order based
// on the first character of each subject's `displayNameHe`:
//   אנגלית     (english)        — א (position 1)
//   מתמטיקה   (mathematics)    — מ (position 13)
//   עברית ולשון (hebrew-lashon)  — ע (position 16)
//   פסיכומטרי  (psychometric)   — פ (position 17)
//
// In RTL flow, DOM source order matches visual right-to-left reading order.
export const HEADLINE_FOUR_DISPLAY_ORDER: readonly HeadlineFourSlug[] = [
  "english",
  "mathematics",
  "hebrew-lashon",
  "psychometric",
] as const;

// Material Symbols Outlined icon names for each headline subject. Mock-derived
// per `mocks/landing.html` lines 231–258. Icons are loaded by `AppShell` via
// the Material Symbols Outlined font; no additional asset bundling needed.
export const HEADLINE_FOUR_ICONS: Record<HeadlineFourSlug, string> = {
  mathematics: "calculate",
  english: "language",
  "hebrew-lashon": "edit_note",
  psychometric: "psychology",
};

// Fallback display names for the headline-four cards when `getActiveSubjects`
// returns a result that's missing one of the four slugs (degenerate state —
// admin hid a headline subject; should not happen at MVP 1 but defensive
// per AC2). The headline-four is a product commitment, not a taxonomy choice;
// hiding one of these via Story 3.6's editor is a contract violation, and the
// card MUST render anyway with the seeded `displayNameHe`.
//
// Values mirror `src/lib/db/seed-data.ts` lines 11–37 verbatim. If the seeded
// `displayNameHe` ever changes (unlikely — these are locked product names),
// update both files in the same PR.
export const HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE: Record<HeadlineFourSlug, string> = {
  mathematics: "מתמטיקה",
  english: "אנגלית",
  "hebrew-lashon": "עברית ולשון",
  psychometric: "פסיכומטרי",
};
