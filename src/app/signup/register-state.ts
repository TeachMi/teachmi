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
