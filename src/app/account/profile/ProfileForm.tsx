"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfilePhotoEditor } from "@/components/photo/ProfilePhotoEditor";
import { updateProfileAction } from "./actions";
import {
  confirmProfilePhotoUploadAction,
  requestProfilePhotoUploadUrlAction,
} from "./upload-actions";
import { PROFILE_INITIAL_STATE, type ProfileActionState } from "./profile-state";

interface ProfileFormProps {
  initialName: string;
  initialEmail: string;
  initialDateOfBirth: string; // YYYY-MM-DD or ""
  /** R2 key of the existing profile photo, if any. */
  initialPhotoR2Key: string | null;
  /** Pre-resolved presigned GET URL from the server. Null in stub mode. */
  initialPhotoUrl: string | null;
}

export function ProfileForm({
  initialName,
  initialEmail,
  initialDateOfBirth,
  initialPhotoR2Key,
  initialPhotoUrl,
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
    <div className="space-y-5">
      {/* Photo editor lives OUTSIDE the form: its upload server actions run
          independently and write to users.profile_photo_r2_key synchronously.
          Keeping it outside the <form> avoids the picker's hidden inputs from
          being submitted by `updateProfileAction` (which only cares about
          name + dateOfBirth). */}
      <ProfilePhotoEditor
        name={initialName || initialEmail}
        initialR2Key={initialPhotoR2Key}
        initialPreviewUrl={initialPhotoUrl}
        requestUploadUrl={requestProfilePhotoUploadUrlAction}
        confirmUpload={confirmProfilePhotoUploadAction}
      />

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
    </div>
  );
}
