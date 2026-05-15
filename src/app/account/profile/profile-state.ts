// Shared types + initial state for the profile-update server action. Lives
// outside actions.ts because "use server" files can only export async
// functions.

export interface ProfileActionState {
  ok: boolean;
  fieldErrors?: Partial<Record<"name" | "dateOfBirth", string>>;
  formError?: string;
  values?: { name: string; dateOfBirth: string };
  savedAt?: string;
}

export const PROFILE_INITIAL_STATE: ProfileActionState = { ok: false };
