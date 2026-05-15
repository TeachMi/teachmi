"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfileAction } from "./actions";
import { PROFILE_INITIAL_STATE, type ProfileActionState } from "./profile-state";

interface ProfileFormProps {
  initialName: string;
  initialEmail: string;
  initialDateOfBirth: string; // YYYY-MM-DD or ""
}

export function ProfileForm({
  initialName,
  initialEmail,
  initialDateOfBirth,
}: ProfileFormProps) {
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(
    updateProfileAction,
    PROFILE_INITIAL_STATE,
  );

  const fieldErrors = state.fieldErrors ?? {};
  const values = state.values;
  const nameValue = values?.name ?? initialName;
  const dobValue = values?.dateOfBirth ?? initialDateOfBirth;
  const justSaved = state.ok && state.savedAt;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          name="name"
          type="text"
          label="שם מלא"
          required
          minLength={2}
          defaultValue={nameValue}
          error={fieldErrors.name}
          size="lg"
          surface="linen"
        />
        <Input
          name="email"
          type="email"
          label="אימייל"
          defaultValue={initialEmail}
          readOnly
          disabled
          dir="ltr"
          size="lg"
          surface="linen"
        />
        <Input
          name="dateOfBirth"
          type="date"
          label="תאריך לידה"
          defaultValue={dobValue}
          error={fieldErrors.dateOfBirth}
          size="lg"
          surface="linen"
        />
      </div>

      {state.formError && (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-bold text-danger"
          role="alert"
        >
          {state.formError}
        </p>
      )}
      {justSaved && (
        <p
          className="rounded-lg border border-primary-container/40 bg-primary-fixed/30 px-4 py-3 text-sm font-bold text-primary-container"
          role="status"
        >
          הפרטים נשמרו בהצלחה.
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "שומרים…" : "שמרו שינויים"}
      </Button>
    </form>
  );
}
