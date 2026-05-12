"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInAction } from "./actions";
import { SIGNIN_INITIAL_STATE, type SignInActionState } from "./signin-state";

interface SignInFormProps {
  callbackUrl: string;
}

export function SignInForm({ callbackUrl }: SignInFormProps) {
  const [state, formAction, pending] = useActionState<SignInActionState, FormData>(
    signInAction,
    SIGNIN_INITIAL_STATE,
  );

  const fieldErrors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

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

      <Input
        name="password"
        type="password"
        label="סיסמה"
        placeholder="••••••••"
        autoComplete="current-password"
        required
        error={fieldErrors.password}
        size="lg"
        surface="linen"
      />

      {/* TODO(post-MVP): expose session-duration choice (the mock's "remember me"
          checkbox was removed in 1.14 code-review — a rendered checkbox that
          ignored the user's preference would have been worse than no checkbox). */}

      {state.formError && (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-bold text-danger"
          role="alert"
        >
          {state.formError}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "מתחבר…" : "התחברו ←"}
      </Button>

      <p className="text-center text-sm text-on-surface-variant">
        <Link
          className="font-bold text-primary-container hover:underline"
          href="/signin/forgot"
        >
          שכחת סיסמה?
        </Link>
      </p>
    </form>
  );
}
