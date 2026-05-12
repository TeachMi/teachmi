"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordAction } from "./reset-actions";
import { RESET_INITIAL_STATE, type ResetPasswordActionState } from "./reset-state";

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState<ResetPasswordActionState, FormData>(
    resetPasswordAction,
    RESET_INITIAL_STATE,
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />

      <Input
        name="password"
        type="password"
        label="סיסמה חדשה"
        placeholder="••••••••"
        autoComplete="new-password"
        required
        minLength={10}
        error={fieldErrors.password}
        hint="לפחות 10 תווים, אות וספרה."
        size="lg"
        surface="linen"
      />

      <Input
        name="passwordConfirm"
        type="password"
        label="אישור סיסמה"
        placeholder="••••••••"
        autoComplete="new-password"
        required
        minLength={10}
        error={fieldErrors.passwordConfirm}
        size="lg"
        surface="linen"
      />

      {state.formError && (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-bold text-danger"
          role="alert"
        >
          {state.formError}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "מעדכן…" : "עדכנו סיסמה"}
      </Button>
    </form>
  );
}
