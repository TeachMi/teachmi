import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { isUuid } from "@/lib/auth/slug-validation";
import { getDb } from "@/lib/db/client";
import { subjects, tutorSubjects } from "@/lib/db/schema";
import { getTutorProfileForOwner } from "@/lib/db/queries/tutor-queries";
import { getTutorProfilePreviewUrls } from "../../onboarding/profile/upload-actions";
import { ProfileForm } from "../../onboarding/profile/ProfileForm";
import { editProfileAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "עריכת פרופיל · TeachMe",
  description: "עריכת פרטי פרופיל מורה. שינויים מהותיים דורשים אישור מחדש.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

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
    console.error("[tutor/[slug]/edit] subjects lookup failed", err);
    return [];
  }
}

async function loadTutorSubjectSlugs(userId: string): Promise<string[]> {
  try {
    const db = getDb();
    const rows = (await db
      .select({ slug: subjects.slug })
      .from(tutorSubjects)
      // The Drizzle join chain isn't exposed on our minimal interfaces; for the
      // page-level read we use the production `getDb()` which has the full
      // chain via `innerJoin`.
      .innerJoin(subjects, eq(tutorSubjects.subjectId, subjects.id))
      .where(eq(tutorSubjects.tutorUserId, userId))) as Array<{ slug: string }>;
    return rows.map((row) => row.slug);
  } catch (err) {
    console.error("[tutor/[slug]/edit] tutor_subjects lookup failed", err);
    return [];
  }
}

export default async function TutorProfileEditPage({ params }: PageProps) {
  const { slug } = await params;

  // 1. UUID pre-validation — same shape as Story 3.2's public profile page.
  //    Leaks zero info about whether the route is meaningful.
  if (!isUuid(slug)) notFound();

  // 2. Auth — owner-only. Anonymous → signin; authenticated non-owner → 404.
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=/tutor/${slug}/edit`);
  }
  if (slug !== session.user.id) {
    // Info-leak guard: a 403 would confirm the edit route exists for another
    // user. 404 is the right shape per Story 2.3's AC1 precedent.
    notFound();
  }

  // 3. Owner-only profile lookup. Soft-deleted (deletedAt IS NOT NULL) → 404.
  //    No profile row at all → user hasn't completed onboarding yet, so we
  //    redirect them to the wizard.
  const profile = await getTutorProfileForOwner(slug);
  if (profile === null) {
    redirect("/tutor/onboarding/profile");
  }

  // 4. Load the rest in parallel.
  const [availableSubjects, currentSubjectSlugs, previewUrls] = await Promise.all([
    loadActiveSubjects(),
    loadTutorSubjectSlugs(slug),
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
    <main className="bg-linen min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="text-start">
            <h1 className="mb-1 font-display text-2xl font-extrabold text-primary-container">
              עריכת פרופיל מורה
            </h1>
            <p className="text-sm text-secondary">
              שינויים מהותיים (מחיר, סרטון, מקצועות) דורשים אישור מחדש מהצוות.
            </p>
          </div>
        </div>

        <ProfileForm
          availableSubjects={availableSubjects.map((row) => ({
            slug: row.slug,
            displayNameHe: row.displayNameHe,
          }))}
          initialValues={initialValues}
          initialPreviews={{
            photoUrl: previewUrls.photoUrl,
            introVideoUrl: previewUrls.introVideoUrl,
          }}
          isResubmit={false}
          mode="edit"
          saveAction={editProfileAction}
          ownerProfileUrl={`/tutor/${slug}`}
        />
      </div>
    </main>
  );
}
