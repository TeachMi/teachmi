"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { isStubUrl } from "@/lib/providers/files";
import { MARKETING_OPTIN_LABEL_HE } from "@/lib/legal/marketing-consent";
import {
  HIGHLIGHT_DEFS,
  HIGHLIGHT_MAX_SELECTED,
  type HighlightSlug,
} from "@/lib/highlights";
import { profileFormAction } from "./actions";
// PhotoCropModal moved to a shared location so the student /account/profile
// surface can reuse the same crop UX without a cross-feature import.
import { PhotoCropModal } from "@/components/photo/PhotoCropModal";
import { PROFILE_ACTION_INITIAL_STATE } from "./state";
import {
  confirmIntroVideoUploadAction,
  confirmProfilePhotoUploadAction,
  requestIntroVideoUploadUrlAction,
  requestProfilePhotoUploadUrlAction,
} from "./upload-actions";
import {
  ALLOWED_INTRO_VIDEO_MIME_TYPES,
  ALLOWED_PHOTO_MIME_TYPES,
  LESSON_LENGTH_MINUTES,
  PROFILE_FORM_LIMITS,
  type LessonLengthMinutes,
  type TutorGender,
} from "./profile-form-schema";

interface SubjectChoice {
  slug: string;
  displayNameHe: string;
}

interface FormInitialValues {
  displayName: string;
  /**
   * Grammatical gender (M/F). `null` only on first-time wizard mount where
   * the tutor hasn't picked yet — required at submit. Drives Hebrew-copy
   * gender agreement (see `verifiedTutorLabel` in profile-form-schema.ts).
   */
  gender: TutorGender | null;
  tagline: string;
  shortBio: string;
  longBio: string;
  highlights: string[];
  recommendationVisible: boolean;
  recommendationHeadline: string;
  recommendationSub: string;
  subjects: string[];
  /** Per-length pricing. `null` per length = "not offered." Story 2.10 follow-up 2026-05-17. */
  prices: Record<45 | 60 | 75 | 90, number | null>;
  photoR2Key: string | null;
  introVideoR2Key: string | null;
}

interface FormInitialPreviews {
  photoUrl: string | null;
  introVideoUrl: string | null;
}

interface ProfileFormProps {
  availableSubjects: SubjectChoice[];
  initialValues: FormInitialValues;
  initialPreviews: FormInitialPreviews;
  isResubmit: boolean;
  /**
   * "edit" mode swaps the create-flow CTAs ("המשך לחתימת הסכם" + "שמרו טיוטה")
   * for the simpler edit-mode CTAs ("שמרו" + "ביטול" → /tutor/me).
   * Defaults to "create" so Story 2.1's existing mount in
   * `/tutor/onboarding/profile/page.tsx` keeps its original behavior.
   *
   * Story 2.10 removed the re-approval warning banner + per-section badges
   * + dynamic CTA copy that Story 2.5 had wired here — every edit now saves
   * immediately for closed-beta. Restoration deferred per
   * `_bmad-output/planning-artifacts/deferred-work.md`.
   */
  mode?: "create" | "edit";
  /**
   * Server Action invoked by `useActionState`. Defaults to Story 2.1's
   * `profileFormAction`; edit-mode mounts pass `editProfileAction` here.
   */
  saveAction?: typeof profileFormAction;
  /**
   * Edit-mode only. Invoked when the user clicks "ביטול" (Cancel) to discard
   * in-progress edits and return to the read-only view. When omitted, the
   * Cancel control falls back to a Link to /tutor/me — but on /tutor/me the
   * Link is a same-URL navigation that doesn't actually unmount the form
   * (ProfileTabClient holds isEditing state). Pass `onCancel` from the
   * client wrapper to flip isEditing back to false.
   */
  onCancel?: () => void;
}

const AUTO_SAVE_DEBOUNCE_MS = 30_000;

export function ProfileForm({
  availableSubjects,
  initialValues,
  initialPreviews,
  isResubmit,
  mode = "create",
  saveAction = profileFormAction,
  onCancel,
}: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    saveAction,
    PROFILE_ACTION_INITIAL_STATE,
  );

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    initialValues.subjects,
  );
  const [photoState, setPhotoState] = useState<{ r2Key: string | null; previewUrl: string | null }>(
    { r2Key: initialValues.photoR2Key, previewUrl: initialPreviews.photoUrl },
  );
  const [videoState, setVideoState] = useState<{
    r2Key: string | null;
    previewUrl: string | null;
    uploading: boolean;
    progressPercent: number;
    error: string | null;
  }>({
    r2Key: initialValues.introVideoR2Key,
    previewUrl: initialPreviews.introVideoUrl,
    uploading: false,
    progressPercent: 0,
    error: null,
  });
  const [photoError, setPhotoError] = useState<string | null>(null);

  /** Source File for the crop modal. Non-null while the modal is open. */
  const [photoToCrop, setPhotoToCrop] = useState<File | null>(null);

  // Client-mirrored copies of the text fields. Two purposes:
  //  (#5) preserve what the user typed when the submit action returns an error.
  //  (#4) recompute client-side bounds so the server-returned error dismisses
  //       live as the user types past the bound.
  const [displayName, setDisplayName] = useState(initialValues.displayName ?? "");
  const [gender, setGender] = useState<TutorGender | "">(initialValues.gender ?? "");
  const [tagline, setTagline] = useState(initialValues.tagline ?? "");
  const [shortBio, setShortBio] = useState(initialValues.shortBio ?? "");
  const [longBio, setLongBio] = useState(initialValues.longBio ?? "");
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>(
    initialValues.highlights ?? [],
  );
  const [recommendationVisible, setRecommendationVisible] = useState<boolean>(
    initialValues.recommendationVisible ?? false,
  );
  const [recommendationHeadline, setRecommendationHeadline] = useState(
    initialValues.recommendationHeadline ?? "",
  );
  const [recommendationSub, setRecommendationSub] = useState(
    initialValues.recommendationSub ?? "",
  );
  // Per-length pricing — one editable string per supported length. Empty
  // string = "length not offered" (the submit parser treats it as undefined
  // and the row's column stays NULL).
  const [prices, setPrices] = useState<Record<LessonLengthMinutes, string>>({
    45: initialValues.prices[45]?.toString() ?? "",
    60: initialValues.prices[60]?.toString() ?? "",
    75: initialValues.prices[75]?.toString() ?? "",
    90: initialValues.prices[90]?.toString() ?? "",
  });
  function setPriceFor(len: LessonLengthMinutes, value: string) {
    setPrices((prev) => ({ ...prev, [len]: value }));
  }

  const formRef = useRef<HTMLFormElement | null>(null);
  /** Pending debounce timer; cleared by the immediate-save path to prevent races. */
  const debounceTimerRef = useRef<number | null>(null);

  // Code-review patch H6 (2026-05-13): revoke blob: URLs from a useEffect
  // cleanup rather than inside a setState callback.
  useEffect(() => {
    const url = photoState.previewUrl;
    if (!url?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(url);
  }, [photoState.previewUrl]);
  useEffect(() => {
    const url = videoState.previewUrl;
    if (!url?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(url);
  }, [videoState.previewUrl]);

  /**
   * Fire a save-draft action right now (not on the 30s debounce). Used after
   * uploads so the R2 key reaches `tutor_wizard_state` before the user can
   * reload.
   */
  function persistDraftImmediately(overrides: Record<string, string>) {
    if (mode === "edit") return;
    if (pending) return;
    const formEl = formRef.current;
    if (!formEl) return;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const fd = new FormData(formEl);
    fd.set("intent", "save");
    for (const [key, value] of Object.entries(overrides)) {
      fd.set(key, value);
    }
    startTransition(() => formAction(fd));
  }

  // Debounced auto-save on any field change. Disabled in edit mode.
  useEffect(() => {
    if (mode === "edit") return;
    if (pending) return;
    const formEl = formRef.current;
    if (!formEl) return;

    debounceTimerRef.current = window.setTimeout(() => {
      const fd = new FormData(formEl);
      fd.set("intent", "save");
      startTransition(() => formAction(fd));
      debounceTimerRef.current = null;
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [mode, selectedSubjects, photoState.r2Key, videoState.r2Key, pending, formAction]);

  const submitFieldErrors =
    state.intent === "submit" && !state.ok ? state.fieldErrors ?? {} : {};
  const submitFormError =
    state.intent === "submit" && !state.ok ? state.formError : undefined;
  const saveError =
    state.intent === "save" && !state.ok ? state.formError : undefined;
  const lastSavedAt =
    state.intent === "save" && state.ok ? state.savedAt : undefined;

  // Dismiss server-returned errors as the user fixes the underlying value
  // client-side, using the new Story 2.11 limits.
  const taglineTrimmedLen = tagline.trim().length;
  const showTaglineError =
    submitFieldErrors.tagline !== undefined &&
    (taglineTrimmedLen < PROFILE_FORM_LIMITS.TAGLINE_MIN_CHARS ||
      taglineTrimmedLen > PROFILE_FORM_LIMITS.TAGLINE_MAX_CHARS);
  const shortBioTrimmedLen = shortBio.trim().length;
  const showShortBioError =
    submitFieldErrors.shortBio !== undefined &&
    (shortBioTrimmedLen < PROFILE_FORM_LIMITS.SHORT_BIO_MIN_CHARS ||
      shortBioTrimmedLen > PROFILE_FORM_LIMITS.SHORT_BIO_MAX_CHARS);
  const longBioTrimmedLen = longBio.trim().length;
  const showLongBioError =
    submitFieldErrors.longBio !== undefined &&
    (longBioTrimmedLen < PROFILE_FORM_LIMITS.LONG_BIO_MIN_CHARS ||
      longBioTrimmedLen > PROFILE_FORM_LIMITS.LONG_BIO_MAX_CHARS);
  const recoHeadlineTrimmedLen = recommendationHeadline.trim().length;
  const showRecoHeadlineError =
    submitFieldErrors.recommendationHeadline !== undefined &&
    recommendationVisible &&
    (recoHeadlineTrimmedLen === 0 ||
      recoHeadlineTrimmedLen > PROFILE_FORM_LIMITS.RECOMMENDATION_HEADLINE_MAX_CHARS);
  const recoSubTrimmedLen = recommendationSub.trim().length;
  const showRecoSubError =
    submitFieldErrors.recommendationSub !== undefined &&
    recommendationVisible &&
    (recoSubTrimmedLen === 0 ||
      recoSubTrimmedLen > PROFILE_FORM_LIMITS.RECOMMENDATION_SUB_MAX_CHARS);
  const showDisplayNameError =
    submitFieldErrors.displayName !== undefined &&
    displayName.trim().length < PROFILE_FORM_LIMITS.DISPLAY_NAME_MIN_CHARS;
  // Per-length price dismissal — show server-returned error only if the
  // field's value still doesn't parse as a positive price.
  const showPriceError: Record<LessonLengthMinutes, boolean> = {
    45: submitFieldErrors.price45Ils !== undefined && !isValidPrice(prices[45]),
    60: submitFieldErrors.price60Ils !== undefined && !isValidPrice(prices[60]),
    75: submitFieldErrors.price75Ils !== undefined && !isValidPrice(prices[75]),
    90: submitFieldErrors.price90Ils !== undefined && !isValidPrice(prices[90]),
  };

  // Collect a flat list of remaining (post-client-dismissal) error messages.
  const submitFieldErrorList: string[] = [];
  if (state.intent === "submit" && !state.ok) {
    if (showDisplayNameError && submitFieldErrors.displayName) submitFieldErrorList.push(submitFieldErrors.displayName);
    if (submitFieldErrors.gender) submitFieldErrorList.push(submitFieldErrors.gender);
    if (showTaglineError && submitFieldErrors.tagline) submitFieldErrorList.push(submitFieldErrors.tagline);
    if (showShortBioError && submitFieldErrors.shortBio) submitFieldErrorList.push(submitFieldErrors.shortBio);
    if (showLongBioError && submitFieldErrors.longBio) submitFieldErrorList.push(submitFieldErrors.longBio);
    if (submitFieldErrors.highlights) submitFieldErrorList.push(submitFieldErrors.highlights);
    if (showRecoHeadlineError && submitFieldErrors.recommendationHeadline) submitFieldErrorList.push(submitFieldErrors.recommendationHeadline);
    if (showRecoSubError && submitFieldErrors.recommendationSub) submitFieldErrorList.push(submitFieldErrors.recommendationSub);
    if (submitFieldErrors.subjects) submitFieldErrorList.push(submitFieldErrors.subjects);
    if (submitFieldErrors.prices) submitFieldErrorList.push(submitFieldErrors.prices);
    if (showPriceError[45] && submitFieldErrors.price45Ils) submitFieldErrorList.push(submitFieldErrors.price45Ils);
    if (showPriceError[60] && submitFieldErrors.price60Ils) submitFieldErrorList.push(submitFieldErrors.price60Ils);
    if (showPriceError[75] && submitFieldErrors.price75Ils) submitFieldErrorList.push(submitFieldErrors.price75Ils);
    if (showPriceError[90] && submitFieldErrors.price90Ils) submitFieldErrorList.push(submitFieldErrors.price90Ils);
    if (submitFieldErrors.photoR2Key) submitFieldErrorList.push(submitFieldErrors.photoR2Key);
    if (submitFieldErrors.introVideoR2Key) submitFieldErrorList.push(submitFieldErrors.introVideoR2Key);
  }
  const submitHasErrors =
    state.intent === "submit" && !state.ok &&
    (submitFormError !== undefined || submitFieldErrorList.length > 0);

  // Scroll the error summary into view after a failed submit.
  useEffect(() => {
    if (submitHasErrors && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [submitHasErrors]);

  function toggleSubject(slug: string) {
    setSelectedSubjects((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function toggleHighlight(slug: HighlightSlug) {
    setSelectedHighlights((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((s) => s !== slug);
      }
      // At cap — silently refuse (UX is: the unselected chips are visually
      // disabled, but defensive guard here too in case keyboard activation
      // bypasses the disabled attribute).
      if (prev.length >= HIGHLIGHT_MAX_SELECTED) return prev;
      return [...prev, slug];
    });
  }

  function handlePhotoPicked(file: File) {
    setPhotoError(null);
    if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setPhotoError(`סוג קובץ לא נתמך. בחרו ${ALLOWED_PHOTO_MIME_TYPES.join(" / ")}.`);
      return;
    }
    if (file.size > PROFILE_FORM_LIMITS.PHOTO_MAX_BYTES) {
      setPhotoError("התמונה גדולה מ-5MB.");
      return;
    }
    setPhotoToCrop(file);
  }

  async function handleCroppedPhoto(croppedBlob: Blob) {
    setPhotoToCrop(null);
    setPhotoError(null);
    const file = new File([croppedBlob], "profile.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    const init = await requestProfilePhotoUploadUrlAction({
      contentType: file.type,
      sizeBytes: file.size,
    });
    if (!init.ok) {
      setPhotoError(init.formError);
      return;
    }

    try {
      const putRes = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok && isStubUrl(init.uploadUrl)) {
        // stub provider — treat as success
      } else if (!putRes.ok) {
        setPhotoError(`העלאה נכשלה (${putRes.status}).`);
        return;
      }
    } catch {
      if (!isStubUrl(init.uploadUrl)) {
        setPhotoError("העלאה נכשלה. נסו שוב.");
        return;
      }
    }

    const confirm = await confirmProfilePhotoUploadAction({ r2Key: init.r2Key });
    if (!confirm.ok) {
      setPhotoError(confirm.formError);
      return;
    }
    const previewUrl = isStubUrl(confirm.previewUrl)
      ? URL.createObjectURL(file)
      : confirm.previewUrl;
    setPhotoState({ r2Key: confirm.r2Key, previewUrl });
    persistDraftImmediately({ photoR2Key: confirm.r2Key });
  }

  async function handleVideoUpload(file: File) {
    setVideoState((prev) => ({ ...prev, error: null }));
    if (!(ALLOWED_INTRO_VIDEO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setVideoState((prev) => ({
        ...prev,
        error: `סוג קובץ לא נתמך. בחרו ${ALLOWED_INTRO_VIDEO_MIME_TYPES.join(" / ")}.`,
      }));
      return;
    }
    if (file.size > PROFILE_FORM_LIMITS.INTRO_VIDEO_MAX_BYTES) {
      setVideoState((prev) => ({ ...prev, error: "הסרטון גדול מ-50MB." }));
      return;
    }

    const durationSec = await probeVideoDuration(file).catch(() => 0);
    if (
      durationSec < PROFILE_FORM_LIMITS.INTRO_VIDEO_MIN_DURATION_SEC ||
      durationSec > PROFILE_FORM_LIMITS.INTRO_VIDEO_MAX_DURATION_SEC
    ) {
      setVideoState((prev) => ({
        ...prev,
        error: `אורך הסרטון חייב להיות בין ${PROFILE_FORM_LIMITS.INTRO_VIDEO_MIN_DURATION_SEC} ל-${PROFILE_FORM_LIMITS.INTRO_VIDEO_MAX_DURATION_SEC} שניות.`,
      }));
      return;
    }

    const init = await requestIntroVideoUploadUrlAction({
      contentType: file.type,
      sizeBytes: file.size,
      durationSec,
    });
    if (!init.ok) {
      setVideoState((prev) => ({ ...prev, error: init.formError }));
      return;
    }

    setVideoState((prev) => ({ ...prev, uploading: true, progressPercent: 0 }));

    try {
      await uploadWithProgress(init.uploadUrl, file, (percent) =>
        setVideoState((prev) => ({ ...prev, progressPercent: percent })),
      );
    } catch (err) {
      if (!isStubUrl(init.uploadUrl)) {
        setVideoState((prev) => ({
          ...prev,
          uploading: false,
          error: err instanceof Error ? err.message : "העלאה נכשלה.",
        }));
        return;
      }
    }

    const confirm = await confirmIntroVideoUploadAction({
      r2Key: init.r2Key,
      sizeBytes: file.size,
      contentType: file.type,
    });
    if (!confirm.ok) {
      setVideoState((prev) => ({
        ...prev,
        uploading: false,
        error: confirm.formError,
      }));
      return;
    }
    const previewUrl = isStubUrl(confirm.previewUrl)
      ? URL.createObjectURL(file)
      : confirm.previewUrl;
    setVideoState({
      r2Key: confirm.r2Key,
      previewUrl,
      uploading: false,
      progressPercent: 100,
      error: null,
    });
    persistDraftImmediately({ introVideoR2Key: confirm.r2Key });
  }

  const isEditMode = mode === "edit";

  // CTA copy: create mode → "המשך לחתימת הסכם ←". Edit mode → "שמרו".
  const ctaCopy = isEditMode ? "שמרו" : "המשך לחתימת הסכם ←";

  const highlightsAtCap =
    selectedHighlights.length >= HIGHLIGHT_MAX_SELECTED;

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="intent" value="submit" />
      <input
        type="hidden"
        name="subjects"
        value={selectedSubjects.join(",")}
      />
      <input
        type="hidden"
        name="highlights"
        value={selectedHighlights.join(",")}
      />
      <input
        type="hidden"
        name="photoR2Key"
        value={photoState.r2Key ?? ""}
      />
      <input
        type="hidden"
        name="introVideoR2Key"
        value={videoState.r2Key ?? ""}
      />

      {submitHasErrors && (
        <Card
          tone="error"
          role="alert"
          className="text-sm text-danger"
        >
          <p className="font-bold">{submitFormError ?? "השליחה נכשלה. תקנו את השדות המסומנים ונסו שוב."}</p>
          {submitFieldErrorList.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs">
              {submitFieldErrorList.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {isResubmit && (
        <Card tone="highlighted" className="text-sm text-on-surface">
          הפרופיל שלכם מוגש מחדש. אחרי השליחה הוא יחזור לבדיקה ב-48 השעות הקרובות.
        </Card>
      )}

      {/* ===== 1. Identity (photo + name + tagline) ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            account_circle
          </span>
          תמונה וזהות
        </h3>

        {/* Photo block (square, rounded-xl per mock) */}
        <div className="mb-5 flex items-center gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-linen-border bg-surface-container shadow-sm ring-2 ring-white">
            {photoState.previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photoState.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : photoState.r2Key ? (
              <div className="flex h-full w-full flex-col items-center justify-center text-primary-container">
                <span aria-hidden="true" className="text-2xl leading-none">✓</span>
                <span className="mt-1 text-[10px] font-bold">הועלתה</span>
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                ללא
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary-fixed-dim px-4 py-2 text-sm font-bold text-primary-container transition-colors hover:bg-primary-fixed/30">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                upload
              </span>
              {photoState.r2Key ? "החליפו תמונה" : "העלו תמונה"}
              <input
                type="file"
                accept={ALLOWED_PHOTO_MIME_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoPicked(file);
                  // Reset input so picking the SAME file again still fires onChange.
                  e.target.value = "";
                }}
              />
            </label>
            <p className="mt-2 text-[11px] leading-relaxed text-secondary">
              JPG או PNG · ריבועית · עד 5MB
            </p>
            {photoError && (
              <p role="alert" className="mt-1 text-xs font-bold text-danger">
                {photoError}
              </p>
            )}
            {submitFieldErrors.photoR2Key && !photoState.r2Key && (
              <p role="alert" className="mt-1 text-xs font-bold text-danger">
                {submitFieldErrors.photoR2Key}
              </p>
            )}
          </div>
        </div>

        {/* Display name + tagline stacked */}
        <div className="space-y-4">
          <Input
            name="displayName"
            label="שם תצוגה"
            hint="זה השם שיופיע לסטודנטים בכרטיסי החיפוש."
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={showDisplayNameError ? submitFieldErrors.displayName : undefined}
            surface="linen"
            minLength={PROFILE_FORM_LIMITS.DISPLAY_NAME_MIN_CHARS}
            maxLength={PROFILE_FORM_LIMITS.DISPLAY_NAME_MAX_CHARS}
            autoComplete="name"
          />

          {/* Gender. Set once at onboarding (create mode); hidden in edit
              mode. Code review 2026-05-19 (F15): if the tutor's stored
              gender is somehow null/empty (legacy row, manual DB poke), the
              hidden input would post "" and the server validator would
              reject without any UI to fix it. Fall back to the radio
              fieldset in that case so the tutor can self-heal. */}
          {isEditMode && gender !== "" ? (
            <input type="hidden" name="gender" value={gender} />
          ) : (
            <fieldset>
              <legend className="mb-1 text-sm font-bold text-on-surface">מין</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-on-surface">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={gender === "male"}
                    onChange={() => setGender("male")}
                    className="h-4 w-4 accent-primary-container"
                  />
                  זכר
                </label>
                <label className="flex items-center gap-2 text-sm text-on-surface">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={gender === "female"}
                    onChange={() => setGender("female")}
                    className="h-4 w-4 accent-primary-container"
                  />
                  נקבה
                </label>
              </div>
              {submitFieldErrors.gender && (
                <p className="mt-1 text-xs text-error" role="alert">
                  {submitFieldErrors.gender}
                </p>
              )}
            </fieldset>
          )}

          {/* Tagline */}
          <div>
            <Input
              name="tagline"
              label="כותרת קצרה"
              hint="שורה אחת שמופיעה מתחת לשם — תחום ההוראה במילים פשוטות."
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              error={showTaglineError ? submitFieldErrors.tagline : undefined}
              surface="linen"
              maxLength={PROFILE_FORM_LIMITS.TAGLINE_MAX_CHARS}
            />
            <div className="mt-1 flex justify-between text-[11px] text-secondary">
              <span>מומלץ: 30-60 תווים</span>
              <span className={cn("tabular-nums", tagline.length > PROFILE_FORM_LIMITS.TAGLINE_MAX_CHARS && "font-bold text-danger")}>
                {tagline.length}/{PROFILE_FORM_LIMITS.TAGLINE_MAX_CHARS}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* ===== 2. Intro video (optional) ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            videocam
          </span>
          סרטון היכרות
        </h3>
        <p className="mb-3 text-xs text-secondary">
          אופציונלי. {PROFILE_FORM_LIMITS.INTRO_VIDEO_MIN_DURATION_SEC}-
          {PROFILE_FORM_LIMITS.INTRO_VIDEO_MAX_DURATION_SEC} שניות, עד 50MB.
        </p>

        {videoState.previewUrl ? (
          <div className="space-y-3">
            <video
              controls
              src={videoState.previewUrl}
              className="w-full rounded-lg border border-linen-border bg-black"
            />
            <label className="inline-block cursor-pointer border-b border-primary-container text-xs font-bold text-primary-container">
              החליפו סרטון
              <input
                type="file"
                accept={ALLOWED_INTRO_VIDEO_MIME_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleVideoUpload(file);
                }}
              />
            </label>
          </div>
        ) : videoState.r2Key ? (
          <Card tone="success" padding="md" className="text-start">
            <p className="mb-1 font-display font-bold text-primary-container">
              ✓ סרטון הועלה
            </p>
            <p className="mb-3 text-xs text-on-surface-variant">
              הסרטון נשמר ויוצג לסטודנטים אחרי אישור האדמין.
            </p>
            <label className="inline-block cursor-pointer">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-linen-border bg-surface-lowest px-4 py-2 text-sm font-bold text-on-surface hover:border-primary-fixed-dim">
                החליפו סרטון
              </span>
              <input
                type="file"
                accept={ALLOWED_INTRO_VIDEO_MIME_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleVideoUpload(file);
                }}
              />
            </label>
          </Card>
        ) : (
          <Card
            tone="highlighted"
            padding="lg"
            className="text-center"
          >
            <p className="mb-1 font-display font-bold text-primary-container">
              העלו סרטון היכרות
            </p>
            <p className="mb-4 text-xs text-secondary">
              MP4, MOV, או WebM · עד 50MB
            </p>
            <label className="inline-block cursor-pointer">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-on-primary">
                העלו קובץ
              </span>
              <input
                type="file"
                accept={ALLOWED_INTRO_VIDEO_MIME_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleVideoUpload(file);
                }}
              />
            </label>
          </Card>
        )}

        {videoState.uploading && (
          <div className="mt-3" aria-live="polite">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-container"
              role="progressbar"
              aria-valuenow={videoState.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-primary-container transition-all"
                style={{ width: `${videoState.progressPercent}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-on-surface-variant">
              מעלים... {videoState.progressPercent}%
            </p>
          </div>
        )}

        {videoState.error && (
          <p role="alert" className="mt-2 text-xs font-bold text-danger">
            {videoState.error}
          </p>
        )}
        {submitFieldErrors.introVideoR2Key && (
          <p role="alert" className="mt-2 text-xs font-bold text-danger">
            {submitFieldErrors.introVideoR2Key}
          </p>
        )}
      </Card>

      {/* ===== 3. Short bio ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            short_text
          </span>
          תיאור קצר
        </h3>
        <p className="mb-3 text-xs text-secondary">
          1-2 משפטים שמופיעים ישר מתחת לשם בפרופיל הציבורי. הזדמנות לתפוס את העין.
        </p>
        <Textarea
          name="shortBio"
          rows={3}
          maxLength={PROFILE_FORM_LIMITS.SHORT_BIO_MAX_CHARS}
          value={shortBio}
          onChange={(e) => setShortBio(e.target.value)}
          error={showShortBioError ? submitFieldErrors.shortBio : undefined}
          surface="linen"
          hint="מומלץ: 120-200 תווים"
        />
      </Card>

      {/* ===== 4. Long bio (about) ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            article
          </span>
          אודות
        </h3>
        <p className="mb-3 text-xs text-secondary">
          סיפור מלא יותר על השיטה, הניסיון והגישה האישית. 2-3 פסקאות.
        </p>
        <Textarea
          name="longBio"
          rows={8}
          maxLength={PROFILE_FORM_LIMITS.LONG_BIO_MAX_CHARS}
          value={longBio}
          onChange={(e) => setLongBio(e.target.value)}
          error={showLongBioError ? submitFieldErrors.longBio : undefined}
          surface="linen"
          hint="מומלץ: 400-800 תווים"
        />
      </Card>

      {/* ===== 5. Highlights ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            auto_awesome
          </span>
          נקודות חוזק
        </h3>
        <p className="mb-3 text-xs text-secondary">
          בחרו עד {HIGHLIGHT_MAX_SELECTED} תכונות שמייצגות אתכם. יוצגו בפרופיל הציבורי כתגיות.
        </p>
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHT_DEFS.map((def) => {
            const isActive = selectedHighlights.includes(def.slug);
            const disabled = !isActive && highlightsAtCap;
            return (
              <button
                type="button"
                key={def.slug}
                onClick={() => toggleHighlight(def.slug)}
                aria-pressed={isActive}
                aria-disabled={disabled || undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors",
                  isActive
                    ? "border-primary-fixed-dim bg-primary-fixed/40 text-primary-container"
                    : "border-linen-border bg-surface-lowest text-on-surface-variant",
                  !isActive && !disabled && "hover:border-primary-fixed-dim",
                  disabled && "opacity-45",
                )}
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {def.icon}
                </span>
                {def.labelHe}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-secondary">
          {selectedHighlights.length}/{HIGHLIGHT_MAX_SELECTED} נבחרו
        </p>
        {submitFieldErrors.highlights && (
          <p role="alert" className="mt-2 text-xs font-bold text-danger">
            {submitFieldErrors.highlights}
          </p>
        )}
      </Card>

      {/* ===== 6. Subjects ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            menu_book
          </span>
          מקצועות
        </h3>
        <p className="mb-4 text-xs text-secondary">
          בחרו את המקצועות שאתם מלמדים.
        </p>
        <div className="flex flex-wrap gap-2">
          {availableSubjects.map((subject) => {
            const isActive = selectedSubjects.includes(subject.slug);
            return (
              <button
                type="button"
                key={subject.slug}
                onClick={() => toggleSubject(subject.slug)}
                aria-pressed={isActive}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-bold transition-colors",
                  isActive
                    ? "border-primary-container bg-primary-container text-on-primary"
                    : "border-linen-border bg-surface-lowest text-on-surface-variant hover:border-primary-fixed-dim",
                )}
              >
                {subject.displayNameHe}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-secondary">
          נבחרו:{" "}
          <span className="font-bold text-primary-container">
            {selectedSubjects.length}
          </span>{" "}
          מקצועות
        </p>
        {submitFieldErrors.subjects && (
          <p role="alert" className="mt-2 text-xs font-bold text-danger">
            {submitFieldErrors.subjects}
          </p>
        )}
      </Card>

      {/* ===== 7. Recommendation card ===== */}
      <Card padding="md" className="text-start">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold text-primary-container">
            <span className="material-symbols-outlined" aria-hidden="true">
              trending_up
            </span>
            מומלצת במיוחד
          </h3>
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="recommendationVisible"
              checked={recommendationVisible}
              onChange={(e) => setRecommendationVisible(e.target.checked)}
              className="rounded border-linen-border text-primary-container focus:ring-primary-container"
            />
            <span className="font-bold text-on-surface">הציגו בפרופיל</span>
          </label>
        </div>
        <p className="mb-3 text-xs text-secondary">
          קופסת המלצה שמופיעה בראש הפרופיל הציבורי. אופציונלי.
        </p>
        <div
          className={cn(
            "space-y-3 transition-opacity",
            !recommendationVisible && "pointer-events-none opacity-45",
          )}
        >
          <Input
            name="recommendationHeadline"
            label="כותרת"
            value={recommendationHeadline}
            onChange={(e) => setRecommendationHeadline(e.target.value)}
            disabled={!recommendationVisible}
            maxLength={PROFILE_FORM_LIMITS.RECOMMENDATION_HEADLINE_MAX_CHARS}
            error={showRecoHeadlineError ? submitFieldErrors.recommendationHeadline : undefined}
            surface="linen"
          />
          <Input
            name="recommendationSub"
            label="תיאור משלים"
            value={recommendationSub}
            onChange={(e) => setRecommendationSub(e.target.value)}
            disabled={!recommendationVisible}
            maxLength={PROFILE_FORM_LIMITS.RECOMMENDATION_SUB_MAX_CHARS}
            error={showRecoSubError ? submitFieldErrors.recommendationSub : undefined}
            surface="linen"
          />
        </div>
      </Card>

      {/* ===== 8. Pricing ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            payments
          </span>
          תמחור — בחרו אורכי שיעור
        </h3>
        <p className="mb-4 text-xs text-secondary">
          אתם קובעים את המחיר. סמנו רק את אורכי השיעור שאתם מציעים. הממוצע בתחום: ₪150-200 לשעה.
        </p>
        {submitFieldErrors.prices && (
          <p role="alert" className="mb-3 text-xs font-bold text-danger">
            {submitFieldErrors.prices}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {LESSON_LENGTH_MINUTES.map((len) => (
            <PriceInput
              key={len}
              name={`price${len}Ils`}
              label={`שיעור ${len} דק׳`}
              value={prices[len]}
              onChange={(v) => setPriceFor(len, v)}
              error={
                showPriceError[len]
                  ? submitFieldErrors[`price${len}Ils` as `price${typeof len}Ils`]
                  : undefined
              }
            />
          ))}
        </div>
      </Card>

      {/* Marketing opt-in (FR60) — optional, captured in the wizard. Moved
          out of signup: Israeli Spam Law requires a separate, explicit
          opt-in, which the signup form's passive small-print consent can't
          satisfy. The profile submit action records it via
          `recordMarketingOptIn`. Onboarding-only — not shown on profile edits. */}
      {!isEditMode && (
        <Card padding="md">
          <CheckboxField
            name="marketingOptIn"
            value="on"
            label={MARKETING_OPTIN_LABEL_HE}
          />
        </Card>
      )}

      {/* ===== CTAs ===== */}
      {isEditMode ? (
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={pending && state.intent === "submit"}
            onClick={() => {
              const formEl = formRef.current;
              const intentInput = formEl?.querySelector(
                'input[name="intent"]',
              ) as HTMLInputElement | null;
              if (intentInput) intentInput.value = "submit";
            }}
          >
            {ctaCopy}
          </Button>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm font-bold text-on-surface bg-white border border-linen-border rounded-lg px-6 py-3.5 hover:border-primary-fixed-dim"
            >
              ביטול
            </button>
          ) : (
            <Link
              href="/tutor/me"
              className="text-sm font-bold text-on-surface bg-white border border-linen-border rounded-lg px-6 py-3.5 hover:border-primary-fixed-dim"
            >
              ביטול
            </Link>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={pending && state.intent === "submit"}
            onClick={() => {
              const formEl = formRef.current;
              const intentInput = formEl?.querySelector(
                'input[name="intent"]',
              ) as HTMLInputElement | null;
              if (intentInput) intentInput.value = "submit";
            }}
          >
            {ctaCopy}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => {
              const formEl = formRef.current;
              if (!formEl) return;
              const fd = new FormData(formEl);
              fd.set("intent", "save");
              startTransition(() => formAction(fd));
            }}
          >
            שמרו טיוטה
          </Button>
          <Link
            href="/dashboard"
            className="text-sm text-on-surface-variant hover:text-primary-container"
          >
            → חזרה
          </Link>
        </div>
      )}

      {(lastSavedAt || saveError) && (
        <div
          aria-live="polite"
          className={cn(
            "text-xs",
            lastSavedAt ? "text-on-surface-variant" : "font-bold text-danger",
          )}
        >
          {lastSavedAt && `טיוטה נשמרה • ${new Date(lastSavedAt).toLocaleTimeString("he-IL")}`}
          {saveError && saveError}
        </div>
      )}

      {photoToCrop && (
        <PhotoCropModal
          file={photoToCrop}
          onConfirm={(blob) => void handleCroppedPhoto(blob)}
          onCancel={() => setPhotoToCrop(null)}
        />
      )}
    </form>
  );
}

interface PriceInputProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
}

function isValidPrice(raw: string): boolean {
  if (raw.trim() === "") return false;
  const parsed = Number(raw);
  return (
    Number.isInteger(parsed) &&
    parsed >= PROFILE_FORM_LIMITS.PRICE_MIN_ILS &&
    parsed <= PROFILE_FORM_LIMITS.PRICE_MAX_ILS
  );
}

function PriceInput({ name, label, value, onChange, error }: PriceInputProps) {
  return (
    <Input
      type="number"
      name={name}
      label={label}
      surface="linen"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={PROFILE_FORM_LIMITS.PRICE_MIN_ILS}
      max={PROFILE_FORM_LIMITS.PRICE_MAX_ILS}
      step={1}
      error={error}
      dir="ltr"
      inputMode="numeric"
      placeholder="₪"
    />
  );
}

function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const raw = video.duration;
      if (!Number.isFinite(raw) || raw <= 0) {
        reject(new Error("לא ניתן לקרוא את אורך הסרטון."));
        return;
      }
      resolve(Math.floor(raw));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("לא ניתן לקרוא את הסרטון."));
    };
    video.src = url;
  });
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`העלאה נכשלה (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("שגיאת רשת בהעלאה."));
    xhr.send(file);
  });
}
