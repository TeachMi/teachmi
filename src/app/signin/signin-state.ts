// Non-async exports must live OUTSIDE `"use server"` files. Same precedent as
// Story 1.13's `src/app/signup/register-state.ts`.

export interface SignInActionState {
  ok: false;
  formError?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
  };
  values?: {
    email?: string;
  };
}

export const SIGNIN_INITIAL_STATE: SignInActionState = { ok: false };
