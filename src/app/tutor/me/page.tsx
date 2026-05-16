import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { subjects, tutorSubjects } from "@/lib/db/schema";
import { getTutorProfileForOwner } from "@/lib/db/queries/tutor-queries";
import { requireTutor } from "../onboarding/_lib/require-tutor";
import { getTutorProfilePreviewUrls } from "../onboarding/profile/upload-actions";
import { ProfileTabClient } from "./_components/ProfileTabClient";

// Story 2.10. Profile tab — the default mount of the /tutor/me shell.
// Owner-only by namespace: the parent layout's `requireTutor` gate ensures
// only authenticated tutors reach this page, so there's no UUID validation
// or slug-vs-session comparison ceremony like Story 2.5's /tutor/[slug]/edit
// route had. `getTutorProfileForOwner` is still called with the session's
// own user id; the helper enforces the "soft-deleted → null" contract on
// top of the namespace guard.

export const dynamic = "force-dynamic";

type ActiveSubject = { id: string; slug: string; displayNameHe: string };

async function loadActiveSubjects(): Promise<ActiveSubject[]> {
  try {
    const db = getDb();
    return (await db
      .select({
        id: subjects.id,
        slug: subjects.slug,
        displayNameHe: subjects.displayNameHe,
      })
      .from(subjects)
      .where(eq(subjects.isActive, true))) as ActiveSubject[];
  } catch (err) {
    console.error("[tutor/me] subjects lookup failed", err);
    return [];
  }
}

async function loadTutorSubjectSlugs(userId: string): Promise<string[]> {
  try {
    const db = getDb();
    const rows = (await db
      .select({ slug: subjects.slug })
      .from(tutorSubjects)
      .innerJoin(subjects, eq(tutorSubjects.subjectId, subjects.id))
      .where(eq(tutorSubjects.tutorUserId, userId))) as Array<{ slug: string }>;
    return rows.map((row) => row.slug);
  } catch (err) {
    console.error("[tutor/me] tutor_subjects lookup failed", err);
    return [];
  }
}

export default async function TutorMeProfilePage() {
  // The /tutor/me/layout.tsx ALREADY ran requireTutor. We call it again here
  // to grab the user id without threading it through a context — the helper
  // is cheap (next-auth session cookie read) and idempotent.
  const user = await requireTutor("/tutor/me");

  const profile = await getTutorProfileForOwner(user.id);
  if (profile === null) {
    // No tutor_profiles row (or soft-deleted) — redirect to onboarding wizard.
    redirect("/tutor/onboarding/profile");
  }

  const [availableSubjects, currentSubjectSlugs, previewUrls] = await Promise.all([
    loadActiveSubjects(),
    loadTutorSubjectSlugs(user.id),
    getTutorProfilePreviewUrls({
      introVideoR2Key: profile.introVideoR2Key,
      photoR2Key: profile.profilePhotoR2Key,
    }),
  ]);

  const initialValues = {
    displayName: profile.displayName,
    bio: profile.bio ?? "",
    subjects: currentSubjectSlugs,
    price45Ils: profile.lesson45PriceIls,
    price60Ils: profile.hourlyPriceIls,
    city: profile.city ?? "",
    photoR2Key: profile.profilePhotoR2Key,
    introVideoR2Key: profile.introVideoR2Key,
  };

  return (
    <ProfileTabClient
      availableSubjects={availableSubjects.map((row) => ({
        slug: row.slug,
        displayNameHe: row.displayNameHe,
      }))}
      initialValues={initialValues}
      initialPreviews={{
        photoUrl: previewUrls.photoUrl,
        introVideoUrl: previewUrls.introVideoUrl,
      }}
    />
  );
}
