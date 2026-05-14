"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeleteAccountState } from "./state";

interface DeleteAccountFormProps {
  action: (
    prevState: DeleteAccountState,
    formData: FormData,
  ) => Promise<DeleteAccountState>;
  initialState: DeleteAccountState;
}

export function DeleteAccountForm({ action, initialState }: DeleteAccountFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Input
        label="כתובת אימייל"
        name="confirmation"
        type="email"
        required
        inputMode="email"
        autoComplete="email"
        error={state.error}
      />
      <Button type="submit" variant="danger" disabled={isPending}>
        {isPending ? "מוחקים..." : "מחיקת החשבון"}
      </Button>
    </form>
  );
}
