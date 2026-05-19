// Pure change-categorization for Story 2.5's profile-edit flow, extended
// in Story 2.11 (2026-05-18) to cover the new content fields.
//
// SINGLE SOURCE OF TRUTH for which fields change on edit. The re-approval
// gate was dropped (correct-course 2026-05-12 Option A) but the trigger /
// non-trigger split is retained as a FORWARD-COMPAT HOOK so the gate can
// be restored pre-go-live as a ~50-line orchestrator diff without
// rewriting this helper.
//
// Trigger fields (admin re-vet required when gate is restored):
//   intro_video, hourly_price, lesson_*_price, subjects
//
// Non-trigger fields (saved in place; tutor stays discoverable):
//   display_name, gender, tagline, short_bio, long_bio, highlights,
//   recommendation_headline, recommendation_sub, recommendation_visible,
//   profile_photo

import type { HighlightSlug } from "@/lib/highlights";

export type TriggerField =
  | "intro_video"
  | "hourly_price"
  | "lesson_45_price"
  | "lesson_75_price"
  | "lesson_90_price"
  | "subjects";

export type NonTriggerField =
  | "display_name"
  | "gender"
  | "tagline"
  | "short_bio"
  | "long_bio"
  | "highlights"
  | "recommendation_headline"
  | "recommendation_sub"
  | "recommendation_visible"
  | "profile_photo";

export interface ProfileValues {
  displayName: string;
  /**
   * Grammatical gender ("male"/"female"). Non-trigger field — changing
   * gender just swaps the gendered-copy rendering (the verified-tutor badge
   * etc.); it doesn't require admin re-vet.
   */
  gender: "male" | "female";
  tagline: string;
  shortBio: string;
  longBio: string;
  /** Slugs from `src/lib/highlights.ts`. Order-insensitive (set compare). */
  highlights: HighlightSlug[];
  recommendationHeadline: string;
  recommendationSub: string;
  recommendationVisible: boolean;
  /** R2 object key for the profile photo. `null` for "no photo set". */
  profilePhotoR2Key: string | null;
  /** R2 object key for the intro video. `null` for "no video set". */
  introVideoR2Key: string | null;
  hourlyPriceIls: number | null;
  lesson45PriceIls: number | null;
  lesson75PriceIls: number | null;
  lesson90PriceIls: number | null;
  /** Subject slugs — order-insensitive; categorize compares as sets. */
  subjects: string[];
}

export interface CategorizedChanges {
  triggerChanges: TriggerField[];
  nonTriggerChanges: NonTriggerField[];
  hasAnyChange: boolean;
}

/**
 * Compare an existing profile snapshot against the freshly-submitted values
 * and categorize every field that changed.
 *
 * Comparison rules:
 *   - Text fields: trimmed-string equality. `null` and `""` compare equal.
 *   - Prices: numeric equality. `null`/`undefined` and `null`/`undefined`
 *     compare equal.
 *   - Subjects + highlights: set-equality (order-insensitive).
 *   - R2 keys: exact string equality. `null` → `null` no change.
 *   - Booleans: strict equality.
 */
export function categorizeChanges(
  oldValues: ProfileValues,
  newValues: ProfileValues,
): CategorizedChanges {
  const triggerChanges: TriggerField[] = [];
  const nonTriggerChanges: NonTriggerField[] = [];

  // --- Non-trigger fields ---
  if (normalizeText(oldValues.displayName) !== normalizeText(newValues.displayName)) {
    nonTriggerChanges.push("display_name");
  }
  if (oldValues.gender !== newValues.gender) {
    nonTriggerChanges.push("gender");
  }
  if (normalizeText(oldValues.tagline) !== normalizeText(newValues.tagline)) {
    nonTriggerChanges.push("tagline");
  }
  if (normalizeText(oldValues.shortBio) !== normalizeText(newValues.shortBio)) {
    nonTriggerChanges.push("short_bio");
  }
  if (normalizeText(oldValues.longBio) !== normalizeText(newValues.longBio)) {
    nonTriggerChanges.push("long_bio");
  }
  if (!stringSetEqual(oldValues.highlights, newValues.highlights)) {
    nonTriggerChanges.push("highlights");
  }
  if (
    normalizeText(oldValues.recommendationHeadline) !==
    normalizeText(newValues.recommendationHeadline)
  ) {
    nonTriggerChanges.push("recommendation_headline");
  }
  if (
    normalizeText(oldValues.recommendationSub) !==
    normalizeText(newValues.recommendationSub)
  ) {
    nonTriggerChanges.push("recommendation_sub");
  }
  if (oldValues.recommendationVisible !== newValues.recommendationVisible) {
    nonTriggerChanges.push("recommendation_visible");
  }
  if (oldValues.profilePhotoR2Key !== newValues.profilePhotoR2Key) {
    nonTriggerChanges.push("profile_photo");
  }

  // --- Trigger fields ---
  if (oldValues.introVideoR2Key !== newValues.introVideoR2Key) {
    triggerChanges.push("intro_video");
  }
  if (oldValues.hourlyPriceIls !== newValues.hourlyPriceIls) {
    triggerChanges.push("hourly_price");
  }
  if (oldValues.lesson45PriceIls !== newValues.lesson45PriceIls) {
    triggerChanges.push("lesson_45_price");
  }
  if (oldValues.lesson75PriceIls !== newValues.lesson75PriceIls) {
    triggerChanges.push("lesson_75_price");
  }
  if (oldValues.lesson90PriceIls !== newValues.lesson90PriceIls) {
    triggerChanges.push("lesson_90_price");
  }
  if (!stringSetEqual(oldValues.subjects, newValues.subjects)) {
    triggerChanges.push("subjects");
  }

  return {
    triggerChanges,
    nonTriggerChanges,
    hasAnyChange: triggerChanges.length > 0 || nonTriggerChanges.length > 0,
  };
}

function normalizeText(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.trim();
}

function stringSetEqual(a: readonly string[], b: readonly string[]): boolean {
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (aSet.size !== bSet.size) return false;
  for (const item of aSet) if (!bSet.has(item)) return false;
  return true;
}
