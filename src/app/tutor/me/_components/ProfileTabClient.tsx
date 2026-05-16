"use client";

import { useState } from "react";
import { ProfileForm } from "../../onboarding/profile/ProfileForm";
import { editProfileAction } from "../_lib/actions";
import { ProfileView } from "./ProfileView";

// Story 2.10 amendment 2026-05-16: the Profile tab now renders a READ-ONLY
// view by default. The tutor explicitly toggles into edit mode via the
// "ערוך פרופיל" button. While viewing, nothing is editable — no save button
// in the layout, no input fields. Save only exists in edit mode (the
// ProfileForm's own "שמרו" CTA).
//
// On successful save, `editProfileAction` redirects to /tutor/me which
// reloads this client component fresh — `isEditing` defaults back to false
// and the view re-renders with the updated values pulled from the DB.

interface SubjectChoice {
  slug: string;
  displayNameHe: string;
}

interface FormInitialValues {
  displayName: string;
  bio: string;
  subjects: string[];
  price45Ils: number | null;
  price60Ils: number | null;
  city: string;
  photoR2Key: string | null;
  introVideoR2Key: string | null;
}

interface FormInitialPreviews {
  photoUrl: string | null;
  introVideoUrl: string | null;
}

interface ProfileTabClientProps {
  availableSubjects: SubjectChoice[];
  initialValues: FormInitialValues;
  initialPreviews: FormInitialPreviews;
}

export function ProfileTabClient({
  availableSubjects,
  initialValues,
  initialPreviews,
}: ProfileTabClientProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <ProfileForm
        availableSubjects={availableSubjects}
        initialValues={initialValues}
        initialPreviews={initialPreviews}
        isResubmit={false}
        mode="edit"
        saveAction={editProfileAction}
      />
    );
  }

  // Translate subject SLUGS back to Hebrew display names for the read-only
  // view. The lookup is O(n*m) but n=11 (launch subjects) and m≤11 so it's
  // trivial.
  const subjectsHe = initialValues.subjects
    .map((slug) => availableSubjects.find((s) => s.slug === slug)?.displayNameHe)
    .filter((label): label is string => typeof label === "string");

  return (
    <ProfileView
      displayName={initialValues.displayName}
      bio={initialValues.bio}
      city={initialValues.city}
      subjectsHe={subjectsHe}
      price45Ils={initialValues.price45Ils}
      price60Ils={initialValues.price60Ils}
      photoUrl={initialPreviews.photoUrl}
      introVideoUrl={initialPreviews.introVideoUrl}
      onEdit={() => setIsEditing(true)}
    />
  );
}
