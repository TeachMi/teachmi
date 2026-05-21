// Shared types + constants for the signup `registerAction`. Lives outside
// `actions.ts` because Next.js `"use server"` files can only export async functions
// — exporting a non-function from there is a hard build-time error.

import type { AppRole } from "@/lib/auth/roles";

export type SignupFieldKey =
  | "name"
  | "email"
  | "password"
  | "role"
  | "tos"
  | "privacyPolicy"
  | "marketingOptIn";

export interface RegisterActionState {
  ok: boolean;
  /**
   * Set only on a successful signup — the destination the client should
   * hard-navigate to via `window.location.assign`. `registerAction`
   * deliberately does NOT `redirect()`: a soft RSC redirect out of the
   * `(.)signup` intercepting-modal route into the multi-hop /dashboard
   * redirect chain crashes React ("Rendered more hooks…"). A full-document
   * navigation — what a manual reload does — is the known-good path.
   */
  redirectTo?: string;
  fieldErrors?: Partial<Record<SignupFieldKey, string>>;
  formError?: string;
  values?: {
    name?: string;
    email?: string;
    role?: AppRole;
    tos?: boolean;
    privacyPolicy?: boolean;
    marketingOptIn?: boolean;
  };
}

export const REGISTER_INITIAL_STATE: RegisterActionState = { ok: false };
