// Pure change-categorization for Story 2.5's profile-edit flow.
//
// SINGLE SOURCE OF TRUTH for which fields trigger re-approval and which do
// not. Consumed by both the orchestrator (`edit-flow.ts`) and the form UI
// (the dynamic CTA copy + section badge logic). If the trigger list ever
// changes, change this table — not call sites.
//
// Trigger fields (admin re-vet required, profile flips invisible):
//   intro_video, hourly_price, lesson_45_price, subjects
//
// Non-trigger fields (saved in place; tutor stays discoverable):
//   display_name, bio, city, profile_photo
//
// Photo is intentionally NON-trigger — Story 2.3's documented trigger list
// is intro_video / prices / subjects only. Replacing the avatar doesn't
// require re-vetting (it's not a quality-gated artifact like the intro
// video).

export type TriggerField =
  | "intro_video"
  | "hourly_price"
  | "lesson_45_price"
  | "subjects";

export type NonTriggerField =
  | "display_name"
  | "bio"
  | "city"
  | "profile_photo";

export interface ProfileValues {
  displayName: string;
  bio: string;
  city: string;
  /** R2 object key for the profile photo. `null` for "no photo set". */
  profilePhotoR2Key: string | null;
  /** R2 object key for the intro video. `null` for "no video set". */
  introVideoR2Key: string | null;
  hourlyPriceIls: number | null;
  lesson45PriceIls: number | null;
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
 *   - Text fields (`displayName`, `bio`, `city`): trimmed-string equality.
 *     `null` and `""` compare equal (a tutor whose city was unset and submits
 *     an empty form is unchanged, not "edited city").
 *   - Prices: numeric equality. `null`/`undefined` and `null`/`undefined`
 *     compare equal.
 *   - Subjects: set-equality (sorted-array equality after dedup). Order in
 *     the array is irrelevant.
 *   - R2 keys (photo, intro video): exact string equality. `null` → `null`
 *     is no change. `null` → `<key>` IS a change. `<key>` → different `<key>`
 *     IS a change.
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
  if (normalizeText(oldValues.bio) !== normalizeText(newValues.bio)) {
    nonTriggerChanges.push("bio");
  }
  if (normalizeText(oldValues.city) !== normalizeText(newValues.city)) {
    nonTriggerChanges.push("city");
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
  if (!subjectsEqual(oldValues.subjects, newValues.subjects)) {
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

function subjectsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    // Length difference COULD still equal as sets if there were duplicates,
    // but the form serializer already dedupes via `parseSubmitInput`. Treat
    // a length mismatch as a change.
    const aSet = new Set(a);
    const bSet = new Set(b);
    if (aSet.size !== bSet.size) return false;
    for (const item of aSet) if (!bSet.has(item)) return false;
    return true;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}
