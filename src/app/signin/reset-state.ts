// Non-async exports must live OUTSIDE `"use server"` files (Next.js constraint;
// same precedent as register-state.ts + signin-state.ts + forgot-state.ts).

export type ResetFieldKey = "password" | "passwordConfirm" | "token";

export interface ResetPasswordActionState {
  ok: false;
  fieldErrors?: Partial<Record<ResetFieldKey, string>>;
  formError?: string;
}

export const RESET_INITIAL_STATE: ResetPasswordActionState = { ok: false };
