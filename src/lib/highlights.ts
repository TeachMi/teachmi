// Fixed taxonomy of "highlights" (נקודות חוזק) chips a tutor can pick
// for their public profile. Story 2.11 (2026-05-18). Maximum of 4 may be
// selected.
//
// Per Winston: taxonomy lives in app code, not the DB. `tutor_profiles.highlights`
// stores a `text[]` of slugs from this list; icons + Hebrew labels are
// resolved at render time via `getHighlight()`. Closed-beta keeps this fixed
// at 8 — no "other / custom" option (would defeat the comparability point
// per Sally's call). Revisit at 100+ tutors with usage data.

export type HighlightSlug =
  | "accessible"
  | "dynamic"
  | "supportive"
  | "goal-oriented"
  | "patient"
  | "creative"
  | "results-driven"
  | "experienced";

export interface HighlightDef {
  slug: HighlightSlug;
  /** Material Symbols icon name. */
  icon: string;
  /** Hebrew label rendered inside the chip. */
  labelHe: string;
}

export const HIGHLIGHT_DEFS: readonly HighlightDef[] = [
  { slug: "accessible", icon: "forum", labelHe: "נגישה" },
  { slug: "dynamic", icon: "bolt", labelHe: "סוחפת" },
  { slug: "supportive", icon: "favorite", labelHe: "תומכת" },
  { slug: "goal-oriented", icon: "flag", labelHe: "ממוקדת מטרה" },
  { slug: "patient", icon: "school", labelHe: "סבלנית" },
  { slug: "creative", icon: "psychology", labelHe: "יצירתית" },
  { slug: "results-driven", icon: "trending_up", labelHe: "תוצאתית" },
  { slug: "experienced", icon: "workspace_premium", labelHe: "מנוסה" },
] as const;

export const HIGHLIGHT_MAX_SELECTED = 4;

const HIGHLIGHT_BY_SLUG: ReadonlyMap<HighlightSlug, HighlightDef> = new Map(
  HIGHLIGHT_DEFS.map((def) => [def.slug, def]),
);

export function isHighlightSlug(value: unknown): value is HighlightSlug {
  return typeof value === "string" && HIGHLIGHT_BY_SLUG.has(value as HighlightSlug);
}

export function getHighlight(slug: HighlightSlug): HighlightDef {
  const def = HIGHLIGHT_BY_SLUG.get(slug);
  if (!def) throw new Error(`[highlights] unknown slug: ${slug}`);
  return def;
}

/**
 * Filter an arbitrary array down to valid distinct slugs, capped at
 * `HIGHLIGHT_MAX_SELECTED`. Used at the form + Server Action layer to
 * harden against tampered input from the editor's chip group.
 */
export function sanitizeHighlights(raw: unknown): HighlightSlug[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<HighlightSlug>();
  for (const v of raw) {
    if (isHighlightSlug(v)) seen.add(v);
    if (seen.size >= HIGHLIGHT_MAX_SELECTED) break;
  }
  return Array.from(seen);
}
