/**
 * Validation helpers for the tutor-profile submission form.
 *
 * No zod — the codebase convention (see `src/lib/auth/registration.ts`,
 * `signup/registration-flow.ts`) is plain TS validation returning typed
 * results; we follow that. Adding zod here just for this story would be
 * inconsistent with 1.13/1.14.
 */

export const PROFILE_FORM_LIMITS = {
  PRICE_MIN_ILS: 1,
  PRICE_MAX_ILS: 10_000,
  BIO_MIN_CHARS: 50,
  BIO_MAX_CHARS: 1000,
  DISPLAY_NAME_MIN_CHARS: 2,
  DISPLAY_NAME_MAX_CHARS: 200,
  SUBJECTS_MIN: 1,
  /**
   * Story 2.10 amendment 2026-05-16: subject max + soft hint dropped per
   * founder direction. Closed-beta tutors should pick whatever subjects they
   * actually teach — the original "up to 3" soft hint was a Story-2.1-era
   * heuristic. Validation now only enforces SUBJECTS_MIN. The constants are
   * kept exported (set to large values acting as guard rails) so existing
   * imports don't break.
   */
  SUBJECTS_MAX: 100,
  SUBJECTS_SOFT_HINT: 100,
  PHOTO_MAX_BYTES: 5_000_000,
  INTRO_VIDEO_MAX_BYTES: 50_000_000,
  INTRO_VIDEO_MIN_DURATION_SEC: 5,
  INTRO_VIDEO_MAX_DURATION_SEC: 60,
  R2_KEY_MAX_CHARS: 500,
} as const;

export const ALLOWED_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedPhotoMimeType = (typeof ALLOWED_PHOTO_MIME_TYPES)[number];

export const ALLOWED_INTRO_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export type AllowedIntroVideoMimeType = (typeof ALLOWED_INTRO_VIDEO_MIME_TYPES)[number];

const SUBJECT_SLUG_REGEX = /^[a-z][a-z0-9-]*$/;

// Hebrew-grammar gender on the tutor profile. Drives gender-agreeing copy
// (e.g., the verified badge "מורה מאומת" male / "מורה מאומתת" female).
// Closed-beta enum is M/F only — see schema comment on tutor_profiles.gender.
export const TUTOR_GENDERS = ["male", "female"] as const;
export type TutorGender = (typeof TUTOR_GENDERS)[number];

export function isTutorGender(value: unknown): value is TutorGender {
  return typeof value === "string" && (TUTOR_GENDERS as readonly string[]).includes(value);
}

/**
 * Hebrew "verified tutor" badge copy — gender-agrees with the tutor's
 * grammatical gender. Surface in the Hero badge on the public profile,
 * the dashboard "approved" Card story, and any future copy that needs the
 * same agreement (e.g., "המורה המומלצת" / "המורה המומלץ" — add helpers as
 * those strings arrive; keep verbs/adjectives explicit rather than building
 * a general-purpose translator).
 */
export function verifiedTutorLabel(gender: TutorGender): string {
  return gender === "female" ? "מורה מאומתת" : "מורה מאומת";
}

/** Display label for the gender radio + ProfileView. */
export function genderLabel(gender: TutorGender): string {
  return gender === "female" ? "נקבה" : "זכר";
}

export function isAllowedPhotoMime(value: string): value is AllowedPhotoMimeType {
  return (ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

export function isAllowedIntroVideoMime(
  value: string,
): value is AllowedIntroVideoMimeType {
  return (ALLOWED_INTRO_VIDEO_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Lesson-length pricing model. Story 2.10 follow-up (founder direction
 * 2026-05-17): tutors can opt into any subset of these four lengths and
 * set per-length pricing. Schema-level relaxation: 60-min is no longer
 * required; "at least one length set" is the new invariant.
 *
 * Cross-length consistency (e.g. price45 < price60) is intentionally NOT
 * enforced at this revision — see the relaxed founder call. Revisit when
 * pricing-policy data shows up post-closed-beta.
 */
export const LESSON_LENGTH_MINUTES = [45, 60, 75, 90] as const;
export type LessonLengthMinutes = (typeof LESSON_LENGTH_MINUTES)[number];

export interface ProfileDraftInput {
  displayName?: string;
  gender?: string;
  bio?: string;
  subjects?: string[];
  /** Per-length price in whole shekels. `null` = length not offered. */
  prices?: Partial<Record<LessonLengthMinutes, number | null>>;
  city?: string;
  photoR2Key?: string;
  introVideoR2Key?: string;
}

export interface ProfileSubmitInput {
  displayName: string;
  gender: TutorGender;
  bio: string;
  subjects: string[];
  /** Per-length price in whole shekels. `null` = length not offered. */
  prices: Record<LessonLengthMinutes, number | null>;
  city: string | null;
  photoR2Key: string | null;
  introVideoR2Key: string;
}

export type ProfileFieldErrors = Partial<{
  displayName: string;
  gender: string;
  bio: string;
  subjects: string;
  /** Field-level error for a specific lesson length, keyed by minutes. */
  price45Ils: string;
  price60Ils: string;
  price75Ils: string;
  price90Ils: string;
  /** Cross-cutting "at least one length" error. */
  prices: string;
  introVideoR2Key: string;
  city: string;
  photoR2Key: string;
}>;

export type ProfileSubmitParseResult =
  | { ok: true; value: ProfileSubmitInput }
  | { ok: false; fieldErrors: ProfileFieldErrors };

export function parseSubmitInput(raw: ProfileDraftInput): ProfileSubmitParseResult {
  const fieldErrors: ProfileFieldErrors = {};

  const displayName = (raw.displayName ?? "").trim();
  if (displayName.length < PROFILE_FORM_LIMITS.DISPLAY_NAME_MIN_CHARS) {
    fieldErrors.displayName = `השם חייב להכיל לפחות ${PROFILE_FORM_LIMITS.DISPLAY_NAME_MIN_CHARS} תווים.`;
  } else if (displayName.length > PROFILE_FORM_LIMITS.DISPLAY_NAME_MAX_CHARS) {
    fieldErrors.displayName = "השם ארוך מדי.";
  }

  const genderRaw = (raw.gender ?? "").trim();
  let gender: TutorGender | undefined;
  if (genderRaw.length === 0) {
    fieldErrors.gender = "יש לבחור מין.";
  } else if (!isTutorGender(genderRaw)) {
    fieldErrors.gender = "ערך לא תקין.";
  } else {
    gender = genderRaw;
  }

  const bio = (raw.bio ?? "").trim();
  if (bio.length < PROFILE_FORM_LIMITS.BIO_MIN_CHARS) {
    fieldErrors.bio = `ביוגרפיה חייבת להכיל לפחות ${PROFILE_FORM_LIMITS.BIO_MIN_CHARS} תווים.`;
  } else if (bio.length > PROFILE_FORM_LIMITS.BIO_MAX_CHARS) {
    fieldErrors.bio = `ביוגרפיה לא יכולה לעלות על ${PROFILE_FORM_LIMITS.BIO_MAX_CHARS} תווים.`;
  }

  // Code-review patch (2026-05-12, patch #10): dedupe slugs before the
  // count check. Without this, ["math","math","math"] passed the min check
  // and INSERTed three rows into tutor_subjects — either causing a PK
  // collision (junction-table unique) or polluting the row count.
  const subjects = Array.from(
    new Set((raw.subjects ?? []).filter((slug) => SUBJECT_SLUG_REGEX.test(slug))),
  );
  if (subjects.length < PROFILE_FORM_LIMITS.SUBJECTS_MIN) {
    fieldErrors.subjects = "בחרו לפחות מקצוע אחד.";
  } else if (subjects.length > PROFILE_FORM_LIMITS.SUBJECTS_MAX) {
    fieldErrors.subjects = `ניתן לבחור עד ${PROFILE_FORM_LIMITS.SUBJECTS_MAX} מקצועות.`;
  }

  // Per-length pricing. Each length is optional individually; the only
  // cross-cutting rule is "at least one length must be offered with a
  // positive price." Cross-length consistency (e.g. price45 < price60) is
  // deferred per founder direction 2026-05-17.
  const rawPrices = raw.prices ?? {};
  const cleanedPrices: Record<LessonLengthMinutes, number | null> = {
    45: null,
    60: null,
    75: null,
    90: null,
  };
  let anyPriceOffered = false;
  for (const len of LESSON_LENGTH_MINUTES) {
    const value = rawPrices[len];
    if (value === undefined || value === null) {
      continue; // length not offered
    }
    if (!Number.isInteger(value)) {
      fieldErrors[priceFieldErrorKey(len)] = `המחיר ל-${len} דק׳ חייב להיות מספר שלם.`;
      continue;
    }
    if (value < PROFILE_FORM_LIMITS.PRICE_MIN_ILS) {
      fieldErrors[priceFieldErrorKey(len)] = "המחיר חייב להיות חיובי.";
      continue;
    }
    if (value > PROFILE_FORM_LIMITS.PRICE_MAX_ILS) {
      fieldErrors[priceFieldErrorKey(len)] = "המחיר גבוה מהסביר. בדקו שוב.";
      continue;
    }
    cleanedPrices[len] = value;
    anyPriceOffered = true;
  }
  if (!anyPriceOffered && fieldErrors.prices === undefined) {
    fieldErrors.prices = "יש להגדיר מחיר עבור לפחות אורך שיעור אחד.";
  }

  const introVideoR2Key = (raw.introVideoR2Key ?? "").trim();
  if (introVideoR2Key.length === 0) {
    fieldErrors.introVideoR2Key = "סרטון היכרות חובה לפני שליחה לבדיקה.";
  } else if (introVideoR2Key.length > PROFILE_FORM_LIMITS.R2_KEY_MAX_CHARS) {
    fieldErrors.introVideoR2Key = "מפתח סרטון לא תקין.";
  }

  const photoR2Key = (raw.photoR2Key ?? "").trim();
  if (photoR2Key.length > PROFILE_FORM_LIMITS.R2_KEY_MAX_CHARS) {
    fieldErrors.photoR2Key = "מפתח תמונה לא תקין.";
  }

  const city = (raw.city ?? "").trim();
  if (city.length > 80) {
    fieldErrors.city = "שם העיר ארוך מדי.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      displayName,
      gender: gender as TutorGender,
      bio,
      subjects,
      prices: cleanedPrices,
      city: city.length > 0 ? city : null,
      photoR2Key: photoR2Key.length > 0 ? photoR2Key : null,
      introVideoR2Key,
    },
  };
}

function priceFieldErrorKey(len: LessonLengthMinutes): keyof ProfileFieldErrors {
  return `price${len}Ils` as keyof ProfileFieldErrors;
}

/**
 * Convert a flat FormData into a draft input. Subjects come in as a single
 * comma-separated string (the form serializer); we split, trim, and drop empties.
 */
export function parseFormDataIntoDraftInput(formData: FormData): ProfileDraftInput {
  const subjectsRaw = String(formData.get("subjects") ?? "");
  const subjects = subjectsRaw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  // Read the four per-length prices. A length is "offered" iff its
  // corresponding form field is a parseable positive integer; absent /
  // blank fields stay `undefined` and the parse layer treats them as
  // "length not offered."
  const prices: Partial<Record<LessonLengthMinutes, number | null>> = {};
  for (const len of LESSON_LENGTH_MINUTES) {
    const value = numberOrUndefined(formData.get(`price${len}Ils`));
    if (value !== undefined) prices[len] = value;
  }

  return {
    displayName: optionalString(formData.get("displayName")),
    gender: optionalString(formData.get("gender")),
    bio: optionalString(formData.get("bio")),
    subjects: subjects.length > 0 ? subjects : undefined,
    prices: Object.keys(prices).length > 0 ? prices : undefined,
    city: optionalString(formData.get("city")),
    photoR2Key: optionalString(formData.get("photoR2Key")),
    introVideoR2Key: optionalString(formData.get("introVideoR2Key")),
  };
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numberOrUndefined(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
