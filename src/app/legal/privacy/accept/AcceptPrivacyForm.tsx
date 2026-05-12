"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptPrivacyPolicyAction } from "./actions";
import { ACCEPT_INITIAL_STATE, type AcceptActionState } from "./accept-state";

interface AcceptPrivacyFormProps {
  next: string;
}

export function AcceptPrivacyForm({ next }: AcceptPrivacyFormProps) {
  const [state, formAction, pending] = useActionState<AcceptActionState, FormData>(
    acceptPrivacyPolicyAction,
    ACCEPT_INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      {state.formError && (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-bold text-danger"
          role="alert"
        >
          {state.formError}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "שומרים…" : "אני מאשר/ת ←"}
      </Button>
    </form>
  );
}
