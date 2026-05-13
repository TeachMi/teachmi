// Non-async exports must live OUTSIDE `"use server"` files. Same precedent as
// Story 1.13's `src/app/signup/register-state.ts` and Story 1.14's
// `src/app/signin/signin-state.ts`.

export interface ForgotPasswordActionState {
  ok: false;
  fieldErrors?: { email?: string };
  values?: { email?: string };
}

export const FORGOT_INITIAL_STATE: ForgotPasswordActionState = { ok: false };
