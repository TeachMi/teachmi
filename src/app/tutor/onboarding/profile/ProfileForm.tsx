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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { isStubUrl } from "@/lib/providers/files";
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
  PROFILE_FORM_LIMITS,
} from "./profile-form-schema";

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
}

const AUTO_SAVE_DEBOUNCE_MS = 30_000;

export function ProfileForm({
  availableSubjects,
  initialValues,
  initialPreviews,
  isResubmit,
  mode = "create",
  saveAction = profileFormAction,
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
  //  (#4) recompute "bio too short" / "name too short" client-side so the
  //       server-returned error dismisses live as the user types past the bound.
  // Code-review patch M10 (2026-05-13): `?? ""` everywhere — `initialValues.bio`
  // can be null/undefined when the tutor's draft is empty, and `bio.trim()`
  // on undefined would crash the form on first render.
  const [bio, setBio] = useState(initialValues.bio ?? "");
  const [displayName, setDisplayName] = useState(initialValues.displayName ?? "");
  const [price45, setPrice45] = useState<string>(
    initialValues.price45Ils?.toString() ?? "",
  );
  const [price60, setPrice60] = useState<string>(
    initialValues.price60Ils?.toString() ?? "",
  );

  const formRef = useRef<HTMLFormElement | null>(null);
  /** Pending debounce timer; cleared by the immediate-save path to prevent races. */
  const debounceTimerRef = useRef<number | null>(null);

  // Code-review patch H6 (2026-05-13): revoke blob: URLs from a useEffect
  // cleanup rather than inside a setState callback. React state updaters may
  // run multiple times (StrictMode dev, concurrent rendering) — revoking
  // inside the setter can free the URL while another render still references
  // it via `photoState.previewUrl`. The effect ties revocation to the URL's
  // lifetime: it revokes the previous URL only after a new URL is committed.
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
   * reload. Overrides pass directly into FormData since React state setters
   * are async and `new FormData(formEl)` would still see the pre-set value.
   *
   * Code-review patch H5 (2026-05-13): gate on `pending` AND clear any armed
   * debounce timer before firing. Without this, the immediate-save and a
   * still-pending debounced save can interleave; the second one's stale
   * FormData snapshot would overwrite the fresh R2 key.
   */
  function persistDraftImmediately(overrides: Record<string, string>) {
    // Story 2.10 amendment 2026-05-16: in edit mode, the user explicitly
    // clicks "שמרו" to save. Auto-saving on every upload would (a) bypass
    // the explicit-save UX contract, (b) trigger the redirect-to-/tutor/me
    // before the user has finished editing other fields. The r2Key still
    // lives in client state (`photoState.r2Key` / `videoState.r2Key`) and
    // ships via the hidden form input on the explicit submit.
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

  // Debounced auto-save on any field change. Story 2.10 amendment 2026-05-16:
  // disabled in edit mode — the user explicitly clicks "שמרו" in /tutor/me
  // and we don't want background saves bypassing that contract. The auto-save
  // remains active in create mode (Story 2.1 onboarding wizard) so the draft
  // doesn't get lost mid-wizard.
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
    // Track keystroke changes via a tick state. Subjects toggles also re-arm.
  }, [mode, selectedSubjects, photoState.r2Key, videoState.r2Key, pending, formAction]);

  const submitFieldErrors =
    state.intent === "submit" && !state.ok ? state.fieldErrors ?? {} : {};
  const submitFormError =
    state.intent === "submit" && !state.ok ? state.formError : undefined;
  const saveError =
    state.intent === "save" && !state.ok ? state.formError : undefined;
  const lastSavedAt =
    state.intent === "save" && state.ok ? state.savedAt : undefined;

  // (#4) Dismiss server-returned errors as the user fixes the underlying value
  // client-side. Without this, the "bio under 50 chars" error stays visible
  // even after the user types past the threshold — they'd have to submit again
  // to see it disappear.
  const bioTrimmedLen = bio.trim().length;
  const showBioError =
    submitFieldErrors.bio !== undefined &&
    (bioTrimmedLen < PROFILE_FORM_LIMITS.BIO_MIN_CHARS ||
      bioTrimmedLen > PROFILE_FORM_LIMITS.BIO_MAX_CHARS);
  const showDisplayNameError =
    submitFieldErrors.displayName !== undefined &&
    displayName.trim().length < PROFILE_FORM_LIMITS.DISPLAY_NAME_MIN_CHARS;
  // Price dismissal accounts for BOTH the per-field bounds AND the relational
  // invariant (price45 < price60). The latter is a "wrong combination" error
  // that doesn't go away just by typing — only by the user changing the values
  // so one is genuinely lower than the other.
  const bothPricesParseable = isValidPrice(price45) && isValidPrice(price60);
  const pricePairInvariantSatisfied =
    bothPricesParseable && Number(price45) < Number(price60);
  const showPrice45Error =
    submitFieldErrors.price45Ils !== undefined &&
    (!isValidPrice(price45) || !pricePairInvariantSatisfied);
  const showPrice60Error =
    submitFieldErrors.price60Ils !== undefined &&
    (!isValidPrice(price60) || !pricePairInvariantSatisfied);

  // Collect a flat list of remaining (post-client-dismissal) error messages so
  // we can surface them at the top of the form. Without this, a submit click
  // that fails validation on a field below the fold (intro video, subjects)
  // looks like the button "did nothing".
  const submitFieldErrorList: string[] = [];
  if (state.intent === "submit" && !state.ok) {
    if (showDisplayNameError && submitFieldErrors.displayName) submitFieldErrorList.push(submitFieldErrors.displayName);
    if (showBioError && submitFieldErrors.bio) submitFieldErrorList.push(submitFieldErrors.bio);
    if (submitFieldErrors.subjects) submitFieldErrorList.push(submitFieldErrors.subjects);
    if (showPrice45Error && submitFieldErrors.price45Ils) submitFieldErrorList.push(submitFieldErrors.price45Ils);
    if (showPrice60Error && submitFieldErrors.price60Ils) submitFieldErrorList.push(submitFieldErrors.price60Ils);
    if (submitFieldErrors.introVideoR2Key) submitFieldErrorList.push(submitFieldErrors.introVideoR2Key);
  }
  const submitHasErrors =
    state.intent === "submit" && !state.ok &&
    (submitFormError !== undefined || submitFieldErrorList.length > 0);

  // Scroll the error summary into view after a failed submit so the user
  // sees what's wrong instead of thinking the button did nothing.
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

  function handlePhotoPicked(file: File) {
    setPhotoError(null);
    if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setPhotoError(`סוג קובץ לא נתמך. בחרו ${ALLOWED_PHOTO_MIME_TYPES.join(" / ")}.`);
      return;
    }
    // Photo size check runs on the ORIGINAL pick — crop output is 400×400 JPEG
    // (~50KB) so the 5MB limit is really only a sanity guard against
    // multi-megapixel uploads tying up the browser's canvas memory.
    if (file.size > PROFILE_FORM_LIMITS.PHOTO_MAX_BYTES) {
      setPhotoError("התמונה גדולה מ-5MB.");
      return;
    }
    // Open the crop modal; uploading happens after the user confirms the crop.
    setPhotoToCrop(file);
  }

  async function handleCroppedPhoto(croppedBlob: Blob) {
    setPhotoToCrop(null);
    setPhotoError(null);
    // The crop output is always image/jpeg (see PhotoCropModal.tsx). Wrap as a
    // File so the upload-init action's MIME validation accepts it.
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
        // Stub endpoint isn't a real server; PUT will resolve as network error
        // in the browser but the form's contract is purely metadata-tracking
        // at MVP 1. Treat stub URLs as success regardless of fetch result.
      } else if (!putRes.ok) {
        setPhotoError(`העלאה נכשלה (${putRes.status}).`);
        return;
      }
    } catch {
      // Same stub-URL allowance as above.
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
    // Use the LOCAL object URL for preview when the server returned a stub URL.
    // The stub provider returns `https://stub.r2.local/...` which isn't a
    // real server — the browser would render the broken-image alt text
    // instead of the photo the user just chose. Real R2 (MVP 2) returns a
    // usable presigned GET URL; that path passes through unchanged.
    // Blob-URL lifecycle (revocation) lives in the useEffect above (H6).
    const previewUrl = isStubUrl(confirm.previewUrl)
      ? URL.createObjectURL(file)
      : confirm.previewUrl;
    setPhotoState({ r2Key: confirm.r2Key, previewUrl });
    // Persist the new R2 key into the wizard_state draft immediately — the
    // 30s auto-save debounce would lose this key if the user reloaded sooner.
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
    // Same stub-URL handling as the photo path. Blob-URL revocation lives in
    // the useEffect above (H6).
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
    // Persist the new R2 key into the wizard_state draft immediately.
    persistDraftImmediately({ introVideoR2Key: confirm.r2Key });
  }

  const isEditMode = mode === "edit";

  // CTA copy: create mode → "המשך לחתימת הסכם ←" (Story 2.1 wizard cap).
  // Edit mode → static "שמרו" (Story 2.10 — re-approval gate dropped; the
  // dynamic copy variant Story 2.5 introduced is removed).
  const ctaCopy = isEditMode ? "שמרו" : "המשך לחתימת הסכם ←";

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

      {/* ===== Photo + bio ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-4 font-display text-lg font-bold text-primary-container">
          תמונה וביוגרפיה
        </h3>
        {/* Display name (#2 resolution, 2026-05-13). The hidden input was */}
        {/* sending the session.user.name unchanged with no way to fix it; */}
        {/* tutors whose signup name was empty/short couldn't ever submit. */}
        {/* Now a real input — and this is the name students will see on */}
        {/* marketplace browse cards, so they should be able to refine it. */}
        <div className="mb-4">
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
            placeholder=""
            autoComplete="name"
          />
        </div>
        {/* Single shared row of labels above the two input columns. This is */}
        {/* the cleanest way to top-align the avatar with the textarea: both */}
        {/* columns start at the SAME baseline, and the labels live above. In */}
        {/* RTL the first child of `flex` is on the right. */}
        <div className="mb-1.5 flex items-baseline gap-5">
          <div className="w-24 shrink-0 text-center">
            <span className="text-xs font-bold text-on-surface">תמונת פרופיל</span>
          </div>
          <div className="flex-1">
            <span className="text-sm font-bold text-on-surface">ביוגרפיה קצרה</span>
          </div>
        </div>
        <div className="flex items-start gap-5">
          <div className="flex w-24 shrink-0 flex-col items-center">
            <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-linen-border bg-surface-container">
              {photoState.previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photoState.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : photoState.r2Key ? (
                // R2 key on file but no fetchable preview URL (stub mode, or
                // the user reloaded after upload). Acknowledge the upload
                // visually instead of showing the empty placeholder.
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
            <label className="mt-2 inline-block cursor-pointer text-center border-b border-primary-container text-xs font-bold text-primary-container">
              {photoState.r2Key ? "החליפו תמונה" : "העלו תמונה"}
              <input
                type="file"
                accept={ALLOWED_PHOTO_MIME_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoPicked(file);
                  // Reset input so picking the SAME file again still fires onChange
                  // (useful if the user cancels the crop and tries the same image).
                  e.target.value = "";
                }}
              />
            </label>
            {photoError && (
              <p role="alert" className="mt-1 text-center text-xs font-bold text-danger">
                {photoError}
              </p>
            )}
          </div>
          <div className="flex-1">
            <Textarea
              name="bio"
              rows={4}
              hint="המלצה: 50-1000 תווים. הזכירו ניסיון, גישה, ועל מי תוכלו לעזור."
              maxLength={PROFILE_FORM_LIMITS.BIO_MAX_CHARS}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              error={showBioError ? submitFieldErrors.bio : undefined}
              surface="linen"
              placeholder="ספרו על עצמכם בקצרה..."
            />
          </div>
        </div>
      </Card>

      {/* ===== Subjects ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-2 font-display text-lg font-bold text-primary-container">
          מקצועות שאתם מלמדים
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

      {/* ===== Pricing ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-2 font-display text-lg font-bold text-primary-container">
          תמחור — 2 אורכי שיעור
        </h3>
        <p className="mb-4 text-xs text-secondary">
          אתם קובעים את המחיר. הממוצע בתחום שלכם: ₪150-200 לשעה.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PriceInput
            name="price45Ils"
            label="שיעור 45 דק׳"
            value={price45}
            onChange={setPrice45}
            error={showPrice45Error ? submitFieldErrors.price45Ils : undefined}
          />
          <PriceInput
            name="price60Ils"
            label="שיעור 60 דק׳"
            value={price60}
            onChange={setPrice60}
            error={showPrice60Error ? submitFieldErrors.price60Ils : undefined}
          />
        </div>
      </Card>

      {/* ===== Intro video ===== */}
      <Card padding="md" className="text-start">
        <h3 className="mb-2 font-display text-lg font-bold text-primary-container">
          סרטון היכרות
        </h3>
        <p className="mb-4 text-xs text-secondary">
          סרטונים מקבלים פי 4 הזמנות. {PROFILE_FORM_LIMITS.INTRO_VIDEO_MIN_DURATION_SEC}-
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
          // R2 key recorded but no fetchable preview URL (stub mode, or page
          // reload after upload). Acknowledge the upload + offer to replace.
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
          <Link
            href="/tutor/me"
            className="text-sm font-bold text-on-surface bg-white border border-linen-border rounded-lg px-6 py-3.5 hover:border-primary-fixed-dim"
          >
            ביטול
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={pending && state.intent === "submit"}
            onClick={() => {
              // Reset intent on submit click so we can co-exist with the
              // explicit "save draft" button.
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
      // Code-review patch (2026-05-12, patch #12): some containers report
      // Infinity/NaN until the entire media is loaded; those values silently
      // bypass the upper-bound check both client-side and on the server.
      // Treat unreadable durations as 0 so the duration-bounds check fires.
      // Floor (not round) so a 4.6s video doesn't round up to 5 and squeak
      // past the minimum.
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
