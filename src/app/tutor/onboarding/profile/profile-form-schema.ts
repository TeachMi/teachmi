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
  SUBJECTS_MAX: 8,
  /** UX hint surfaced in the form copy; the schema cap is SUBJECTS_MAX. */
  SUBJECTS_SOFT_HINT: 3,
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

export function isAllowedPhotoMime(value: string): value is AllowedPhotoMimeType {
  return (ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

export function isAllowedIntroVideoMime(
  value: string,
): value is AllowedIntroVideoMimeType {
  return (ALLOWED_INTRO_VIDEO_MIME_TYPES as readonly string[]).includes(value);
}

export interface ProfileDraftInput {
  displayName?: string;
  bio?: string;
  subjects?: string[];
  price45Ils?: number;
  price60Ils?: number;
  city?: string;
  photoR2Key?: string;
  introVideoR2Key?: string;
}

export interface ProfileSubmitInput {
  displayName: string;
  bio: string;
  subjects: string[];
  price45Ils: number;
  price60Ils: number;
  city: string | null;
  photoR2Key: string | null;
  introVideoR2Key: string;
}

export type ProfileFieldErrors = Partial<{
  displayName: string;
  bio: string;
  subjects: string;
  price45Ils: string;
  price60Ils: string;
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

  const bio = (raw.bio ?? "").trim();
  if (bio.length < PROFILE_FORM_LIMITS.BIO_MIN_CHARS) {
    fieldErrors.bio = `ביוגרפיה חייבת להכיל לפחות ${PROFILE_FORM_LIMITS.BIO_MIN_CHARS} תווים.`;
  } else if (bio.length > PROFILE_FORM_LIMITS.BIO_MAX_CHARS) {
    fieldErrors.bio = `ביוגרפיה לא יכולה לעלות על ${PROFILE_FORM_LIMITS.BIO_MAX_CHARS} תווים.`;
  }

  const subjects = (raw.subjects ?? []).filter((slug) => SUBJECT_SLUG_REGEX.test(slug));
  if (subjects.length < PROFILE_FORM_LIMITS.SUBJECTS_MIN) {
    fieldErrors.subjects = "בחרו לפחות מקצוע אחד.";
  } else if (subjects.length > PROFILE_FORM_LIMITS.SUBJECTS_MAX) {
    fieldErrors.subjects = `ניתן לבחור עד ${PROFILE_FORM_LIMITS.SUBJECTS_MAX} מקצועות.`;
  }

  const price45 = raw.price45Ils;
  if (price45 === undefined || !Number.isInteger(price45)) {
    fieldErrors.price45Ils = "המחיר ל-45 דק׳ חייב להיות מספר שלם.";
  } else if (price45 < PROFILE_FORM_LIMITS.PRICE_MIN_ILS) {
    fieldErrors.price45Ils = "המחיר חייב להיות חיובי.";
  } else if (price45 > PROFILE_FORM_LIMITS.PRICE_MAX_ILS) {
    fieldErrors.price45Ils = "המחיר גבוה מהסביר. בדקו שוב.";
  }

  const price60 = raw.price60Ils;
  if (price60 === undefined || !Number.isInteger(price60)) {
    fieldErrors.price60Ils = "המחיר ל-60 דק׳ חייב להיות מספר שלם.";
  } else if (price60 < PROFILE_FORM_LIMITS.PRICE_MIN_ILS) {
    fieldErrors.price60Ils = "המחיר חייב להיות חיובי.";
  } else if (price60 > PROFILE_FORM_LIMITS.PRICE_MAX_ILS) {
    fieldErrors.price60Ils = "המחיר גבוה מהסביר. בדקו שוב.";
  }

  // Sanity invariant — only check if both sides parsed cleanly.
  // TODO(product-review): consider downgrade to warning-not-error if tutors push back.
  if (
    fieldErrors.price45Ils === undefined &&
    fieldErrors.price60Ils === undefined &&
    price45 !== undefined &&
    price60 !== undefined &&
    price45 >= price60
  ) {
    fieldErrors.price45Ils = "מחיר 45 דק׳ חייב להיות נמוך ממחיר 60 דק׳.";
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
      bio,
      subjects,
      price45Ils: price45 as number,
      price60Ils: price60 as number,
      city: city.length > 0 ? city : null,
      photoR2Key: photoR2Key.length > 0 ? photoR2Key : null,
      introVideoR2Key,
    },
  };
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

  return {
    displayName: optionalString(formData.get("displayName")),
    bio: optionalString(formData.get("bio")),
    subjects: subjects.length > 0 ? subjects : undefined,
    price45Ils: numberOrUndefined(formData.get("price45Ils")),
    price60Ils: numberOrUndefined(formData.get("price60Ils")),
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
