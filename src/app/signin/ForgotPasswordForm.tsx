"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction } from "./forgot-actions";
import {
  FORGOT_INITIAL_STATE,
  type ForgotPasswordActionState,
} from "./forgot-state";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordActionState, FormData>(
    forgotPasswordAction,
    FORGOT_INITIAL_STATE,
  );

  const fieldErrors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Input
        name="email"
        type="email"
        label="אימייל"
        placeholder="you@example.com"
        autoComplete="email"
        inputMode="email"
        required
        dir="ltr"
        defaultValue={values.email ?? ""}
        error={fieldErrors.email}
        size="lg"
        surface="linen"
      />

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "שולח…" : "שלחו לי קישור"}
      </Button>

      <p className="text-center text-sm text-on-surface-variant">
        <Link
          className="font-bold text-primary-container hover:underline"
          href="/signin"
        >
          חזרה לכניסה
        </Link>
      </p>
    </form>
  );
}
