import type { Metadata } from "next";
import { eq, and } from "drizzle-orm";
import { WizardShell } from "@/components/wizard/WizardShell";
import { getDb } from "@/lib/db/client";
import { subjects, tutorProfiles, tutorWizardState } from "@/lib/db/schema";
import { requireTutor } from "../_lib/require-tutor";
import { ProfileForm } from "./ProfileForm";
import { isTutorGender, type TutorGender } from "./profile-form-schema";
import { getTutorProfilePreviewUrls } from "./upload-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "בנו את הפרופיל · TeachMe",
  description: "אשף הכשרת מורה — שלב 2: פרופיל, מקצועות, מחירים, סרטון היכרות.",
};

type SubjectRow = { id: string; slug: string; displayNameHe: string };

interface DraftSnapshot {
  displayName?: string;
  gender?: TutorGender;
  bio?: string;
  subjects?: string[];
  prices?: Partial<Record<45 | 60 | 75 | 90, number | null>>;
  city?: string;
  photoR2Key?: string;
  introVideoR2Key?: string;
}

async function tryReadInitialState(userId: string) {
  // Same defensive pattern as /signin/page.tsx and /signup/page.tsx: degrade
  // to a fresh form rather than crashing the page if Drizzle/Neon is unreachable.
  // The E2E spec gracefully skips when DATABASE_URL is unset; this wrap is
  // for transient outages.
  try {
    const db = getDb();
    const [profile, wizardRow, subjectsRows] = await Promise.all([
      db
        .select({
          displayName: tutorProfiles.displayName,
          gender: tutorProfiles.gender,
          bio: tutorProfiles.bio,
          city: tutorProfiles.city,
          introVideoR2Key: tutorProfiles.introVideoR2Key,
          profilePhotoR2Key: tutorProfiles.profilePhotoR2Key,
          hourlyPriceIls: tutorProfiles.hourlyPriceIls,
          lesson45PriceIls: tutorProfiles.lesson45PriceIls,
          lesson75PriceIls: tutorProfiles.lesson75PriceIls,
          lesson90PriceIls: tutorProfiles.lesson90PriceIls,
          vettingStatus: tutorProfiles.vettingStatus,
        })
        .from(tutorProfiles)
        .where(eq(tutorProfiles.userId, userId)),
      db
        .select({ data: tutorWizardState.data, completedAt: tutorWizardState.completedAt })
        .from(tutorWizardState)
        .where(
          and(eq(tutorWizardState.userId, userId), eq(tutorWizardState.phase, 2)),
        ),
      db
        .select({
          id: subjects.id,
          slug: subjects.slug,
          displayNameHe: subjects.displayNameHe,
        })
        .from(subjects)
        .where(eq(subjects.isActive, true)),
    ]);
    return { profile: profile[0] ?? null, wizardRow: wizardRow[0] ?? null, subjectsRows };
  } catch (err) {
    console.error("[tutor/onboarding/profile] initial-state load failed", err);
    return { profile: null, wizardRow: null, subjectsRows: [] as SubjectRow[] };
  }
}

export default async function TutorOnboardingProfilePage() {
  const user = await requireTutor("/tutor/onboarding/profile");
  const { profile, wizardRow, subjectsRows } = await tryReadInitialState(user.id);

  const draft: DraftSnapshot = readDraftFromWizard(wizardRow?.data);

  // Profile column may not yet exist for a brand-new wizard run; profile
  // gender is the DB-side authoritative source once submitted.
  const profileGender = (profile?.gender as TutorGender | undefined) ?? null;
  const draftPrices = draft.prices ?? {};
  const initialValues = {
    displayName: draft.displayName ?? profile?.displayName ?? user.name ?? "",
    gender: draft.gender ?? profileGender ?? null,
    bio: draft.bio ?? profile?.bio ?? "",
    subjects: draft.subjects ?? [],
    prices: {
      45: draftPrices[45] ?? profile?.lesson45PriceIls ?? null,
      60: draftPrices[60] ?? profile?.hourlyPriceIls ?? null,
      75: draftPrices[75] ?? profile?.lesson75PriceIls ?? null,
      90: draftPrices[90] ?? profile?.lesson90PriceIls ?? null,
    },
    city: draft.city ?? profile?.city ?? "",
    photoR2Key: draft.photoR2Key ?? profile?.profilePhotoR2Key ?? null,
    introVideoR2Key: draft.introVideoR2Key ?? profile?.introVideoR2Key ?? null,
  };

  const { photoUrl, introVideoUrl } = await getTutorProfilePreviewUrls({
    introVideoR2Key: initialValues.introVideoR2Key,
    photoR2Key: initialValues.photoR2Key,
  });

  // Sort subjects by their on-disk sort_order is enforced at the DB query — we
  // pass the rows as-is. The component shape only needs the slug + Hebrew label.
  const subjectsForForm = subjectsRows.map((row) => ({
    slug: row.slug,
    displayNameHe: row.displayNameHe,
  }));

  return (
    <WizardShell currentPhase={2}>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 text-start">
          <h1 className="mb-2 font-display text-3xl font-extrabold text-primary-container">
            בנו את הפרופיל שלכם
          </h1>
          <p className="text-sm text-on-surface-variant">
            פרופיל איכותי = פי 2.5 הזמנות. השקיעו 5 דקות עכשיו, תרוויחו אלפים בהמשך.
          </p>
        </div>

        <ProfileForm
          availableSubjects={subjectsForForm}
          initialValues={initialValues}
          initialPreviews={{ photoUrl, introVideoUrl }}
          isResubmit={
            profile?.vettingStatus !== undefined && profile.vettingStatus !== "approved"
          }
        />
      </div>
    </WizardShell>
  );
}

function readDraftFromWizard(data: unknown): DraftSnapshot {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return {};
  const record = data as Record<string, unknown>;
  const rawGender = stringField(record.gender);
  return {
    displayName: stringField(record.displayName),
    gender: rawGender !== undefined && isTutorGender(rawGender) ? rawGender : undefined,
    bio: stringField(record.bio),
    subjects: stringArrayField(record.subjects),
    prices: readDraftPrices(record.prices),
    city: stringField(record.city),
    photoR2Key: stringField(record.photoR2Key),
    introVideoR2Key: stringField(record.introVideoR2Key),
  };
}

function readDraftPrices(
  value: unknown,
): Partial<Record<45 | 60 | 75 | 90, number | null>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const out: Partial<Record<45 | 60 | 75 | 90, number | null>> = {};
  for (const len of [45, 60, 75, 90] as const) {
    const v = record[String(len)];
    if (typeof v === "number" && Number.isFinite(v)) out[len] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numericField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayField(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}
