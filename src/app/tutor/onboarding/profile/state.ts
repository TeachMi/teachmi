import type { ProfileDraftInput, ProfileFieldErrors } from "./profile-form-schema";

/**
 * Discriminated state returned to the form's `useActionState` for both the
 * draft-save and submit Server Actions.
 *
 * The `intent` field disambiguates which action's outcome we are reporting,
 * so the client can render different UX (silent toast for draft save, inline
 * error for submit).
 */
export type ProfileActionState =
  | { intent: "idle" }
  | { intent: "submit"; ok: false; formError?: string; fieldErrors?: ProfileFieldErrors; values: ProfileDraftInput }
  | { intent: "submit"; ok: true; redirectTo: string }
  | { intent: "save"; ok: true; savedAt: string }
  | { intent: "save"; ok: false; formError: string };

export const PROFILE_ACTION_INITIAL_STATE: ProfileActionState = { intent: "idle" };
