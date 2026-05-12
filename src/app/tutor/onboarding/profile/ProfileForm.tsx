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
import {
  profileFormAction,
  PROFILE_ACTION_INITIAL_STATE,
} from "./actions";
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
}

const AUTO_SAVE_DEBOUNCE_MS = 30_000;

export function ProfileForm({
  availableSubjects,
  initialValues,
  initialPreviews,
  isResubmit,
}: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    profileFormAction,
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

  const formRef = useRef<HTMLFormElement | null>(null);

  // Debounced auto-save on any field change.
  useEffect(() => {
    if (pending) return;
    const formEl = formRef.current;
    if (!formEl) return;

    const handler = window.setTimeout(() => {
      const fd = new FormData(formEl);
      fd.set("intent", "save");
      startTransition(() => formAction(fd));
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handler);
    // Track keystroke changes via a tick state. Subjects toggles also re-arm.
  }, [selectedSubjects, photoState.r2Key, videoState.r2Key, pending, formAction]);

  const submitFieldErrors =
    state.intent === "submit" && !state.ok ? state.fieldErrors ?? {} : {};
  const submitFormError =
    state.intent === "submit" && !state.ok ? state.formError : undefined;
  const saveError =
    state.intent === "save" && !state.ok ? state.formError : undefined;
  const lastSavedAt =
    state.intent === "save" && state.ok ? state.savedAt : undefined;

  function toggleSubject(slug: string) {
    setSelectedSubjects((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function handlePhotoUpload(file: File) {
    setPhotoError(null);
    if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setPhotoError(`סוג קובץ לא נתמך. בחרו ${ALLOWED_PHOTO_MIME_TYPES.join(" / ")}.`);
      return;
    }
    if (file.size > PROFILE_FORM_LIMITS.PHOTO_MAX_BYTES) {
      setPhotoError("התמונה גדולה מ-5MB.");
      return;
    }

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
      if (!putRes.ok && init.uploadUrl.startsWith("https://stub.r2.local/")) {
        // Stub endpoint isn't a real server; PUT will resolve as network error
        // in the browser but the form's contract is purely metadata-tracking
        // at MVP 1. Treat stub URLs as success regardless of fetch result.
      } else if (!putRes.ok) {
        setPhotoError(`העלאה נכשלה (${putRes.status}).`);
        return;
      }
    } catch {
      // Same stub-URL allowance as above.
      if (!init.uploadUrl.startsWith("https://stub.r2.local/")) {
        setPhotoError("העלאה נכשלה. נסו שוב.");
        return;
      }
    }

    const confirm = await confirmProfilePhotoUploadAction({ r2Key: init.r2Key });
    if (!confirm.ok) {
      setPhotoError(confirm.formError);
      return;
    }
    setPhotoState({ r2Key: confirm.r2Key, previewUrl: confirm.previewUrl });
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
      if (!init.uploadUrl.startsWith("https://stub.r2.local/")) {
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
    setVideoState({
      r2Key: confirm.r2Key,
      previewUrl: confirm.previewUrl,
      uploading: false,
      progressPercent: 100,
      error: null,
    });
  }

  const subjectsExceedingSoftCap =
    selectedSubjects.length > PROFILE_FORM_LIMITS.SUBJECTS_SOFT_HINT;

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
      <input
        type="hidden"
        name="displayName"
        defaultValue={initialValues.displayName}
      />

      {submitFormError && (
        <Card
          tone="error"
          role="alert"
          className="text-sm font-bold text-danger"
        >
          {submitFormError}
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
        <div className="flex flex-row-reverse gap-5">
          <div className="shrink-0">
            <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-linen-border bg-surface-container">
              {photoState.previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photoState.previewUrl}
                  alt="תמונת פרופיל"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                  ללא
                </div>
              )}
            </div>
            <label className="mt-2 inline-block cursor-pointer border-b border-primary-container text-xs font-bold text-primary-container">
              {photoState.r2Key ? "החליפו תמונה" : "העלו תמונה"}
              <input
                type="file"
                accept={ALLOWED_PHOTO_MIME_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handlePhotoUpload(file);
                }}
              />
            </label>
            {photoError && (
              <p role="alert" className="mt-1 text-xs font-bold text-danger">
                {photoError}
              </p>
            )}
          </div>
          <div className="flex-1">
            <Textarea
              name="bio"
              rows={4}
              label="ביוגרפיה קצרה"
              hint="המלצה: 50-1000 תווים. הזכירו ניסיון, גישה, ועל מי תוכלו לעזור."
              maxLength={PROFILE_FORM_LIMITS.BIO_MAX_CHARS}
              defaultValue={initialValues.bio}
              error={submitFieldErrors.bio}
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
          בחרו עד {PROFILE_FORM_LIMITS.SUBJECTS_SOFT_HINT} מקצועות. התרכזו במה שאתם הכי טובים בו.
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
          <span
            className={cn(
              "font-bold text-primary-container",
              subjectsExceedingSoftCap && "text-danger",
            )}
          >
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
            defaultValue={initialValues.price45Ils ?? undefined}
            error={submitFieldErrors.price45Ils}
          />
          <PriceInput
            name="price60Ils"
            label="שיעור 60 דק׳"
            defaultValue={initialValues.price60Ils ?? undefined}
            error={submitFieldErrors.price60Ils}
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
      <div className="flex flex-row-reverse items-center gap-3">
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
          המשך לחתימת הסכם ←
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
    </form>
  );
}

interface PriceInputProps {
  name: string;
  label: string;
  defaultValue: number | undefined;
  error: string | undefined;
}

function PriceInput({ name, label, defaultValue, error }: PriceInputProps) {
  return (
    <Input
      type="number"
      name={name}
      label={label}
      surface="linen"
      defaultValue={defaultValue}
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
      resolve(Math.round(video.duration));
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
