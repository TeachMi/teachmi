"use client";

import { useState } from "react";
import { logoutAction } from "@/components/layout/logout-action";
import { ProfileForm } from "../../onboarding/profile/ProfileForm";
import type { TutorGender } from "../../onboarding/profile/profile-form-schema";
import { editProfileAction } from "../_lib/actions";
import { ProfileView } from "./ProfileView";

// Story 2.10 amendment 2026-05-16: the Profile tab renders a READ-ONLY view
// by default. The tutor explicitly toggles into edit mode via the
// "ערוך פרופיל" button.
//
// Story 2.11 (2026-05-18): updated FormInitialValues to mirror the new field
// set (tagline / shortBio / longBio / highlights / recommendation*).
// Dropped `bio` + `city`.

interface SubjectChoice {
  slug: string;
  displayNameHe: string;
}

interface FormInitialValues {
  displayName: string;
  gender: TutorGender;
  tagline: string;
  shortBio: string;
  longBio: string;
  highlights: string[];
  recommendationVisible: boolean;
  recommendationHeadline: string;
  recommendationSub: string;
  subjects: string[];
  prices: Record<45 | 60 | 75 | 90, number | null>;
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
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  // Translate subject SLUGS back to Hebrew display names for the read-only view.
  const subjectsHe = initialValues.subjects
    .map((slug) => availableSubjects.find((s) => s.slug === slug)?.displayNameHe)
    .filter((label): label is string => typeof label === "string");

  return (
    <div className="space-y-5">
      <ProfileView
        displayName={initialValues.displayName}
        tagline={initialValues.tagline}
        shortBio={initialValues.shortBio}
        longBio={initialValues.longBio}
        highlights={initialValues.highlights}
        recommendationVisible={initialValues.recommendationVisible}
        recommendationHeadline={initialValues.recommendationHeadline}
        recommendationSub={initialValues.recommendationSub}
        subjectsHe={subjectsHe}
        prices={initialValues.prices}
        photoUrl={initialPreviews.photoUrl}
        introVideoUrl={initialPreviews.introVideoUrl}
        onEdit={() => setIsEditing(true)}
      />
      {/* Logout — lives ONLY on the Profile tab (founder direction
          2026-05-18). Hidden when the user is in edit mode so it doesn't
          compete with the Save / Cancel actions. */}
      <form action={logoutAction}>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg border border-linen-border bg-white px-4 py-2 text-sm font-bold text-danger transition hover:bg-danger/5"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            logout
          </span>
          התנתקות
        </button>
      </form>
    </div>
  );
}
