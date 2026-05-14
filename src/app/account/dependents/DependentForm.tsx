"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DependentActionState } from "./state";

interface DependentFormProps {
  action: (
    prevState: DependentActionState,
    formData: FormData,
  ) => Promise<DependentActionState>;
  initialState: DependentActionState;
}

export function DependentForm({ action, initialState }: DependentFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Input
        label="שם מלא"
        name="name"
        required
        autoComplete="name"
        error={state.fieldErrors?.name}
      />
      <Input
        label="תאריך לידה"
        name="dateOfBirth"
        type="date"
        required
        error={state.fieldErrors?.dateOfBirth}
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "מוסיפים..." : "הוספת תלמיד/ה"}
      </Button>
    </form>
  );
}
