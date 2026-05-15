"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { isStubUrl } from "@/lib/providers/files";
import { PhotoCropModal } from "./PhotoCropModal";

// Reusable circular photo editor: file picker → crop modal → upload → preview.
// Caller passes role-specific server actions (request-presigned-PUT +
// confirm-uploaded), keeping the wiring agnostic to which bucket the upload
// targets. Used by:
//   - /account/profile (this story) — `student-profile-photos` bucket
//   - tutor onboarding's ProfileForm (existing) — `tutor-profile-photos`
//     bucket (refactor candidate; for now the tutor flow keeps its inline
//     UX which is tangled with the rest of the wizard's preview state).

const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const PHOTO_MAX_BYTES = 5_000_000;

export type RequestUploadUrl = (input: {
  contentType: string;
  sizeBytes: number;
}) => Promise<
  | { ok: true; uploadUrl: string; r2Key: string; expiresAt: string }
  | { ok: false; formError: string }
>;

export type ConfirmUpload = (input: { r2Key: string }) => Promise<
  | { ok: true; r2Key: string; previewUrl: string }
  | { ok: false; formError: string }
>;

interface ProfilePhotoEditorProps {
  /** Friendly name shown as the Avatar fallback (initials). */
  name: string;
  /** Initial R2 key from the server-rendered page. Null when no photo set. */
  initialR2Key: string | null;
  /** Pre-resolved presigned GET URL from the server. Null in stub mode. */
  initialPreviewUrl: string | null;
  /** Role-specific server action that mints the presigned PUT URL. */
  requestUploadUrl: RequestUploadUrl;
  /** Role-specific server action that writes the R2 key + returns a GET URL. */
  confirmUpload: ConfirmUpload;
  /** Hidden form field name to plumb the R2 key into a parent form, if any. */
  hiddenInputName?: string;
}

export function ProfilePhotoEditor({
  name,
  initialR2Key,
  initialPreviewUrl,
  requestUploadUrl,
  confirmUpload,
  hiddenInputName,
}: ProfilePhotoEditorProps) {
  const router = useRouter();
  const [r2Key, setR2Key] = useState<string | null>(initialR2Key);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl);
  const [photoToCrop, setPhotoToCrop] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Track Blob URLs we mint locally so we can revoke them on unmount /
  // replacement. Stub mode generates Blob URLs as a preview fallback; real
  // R2 returns presigned URLs which need no cleanup.
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
  }, [localObjectUrl]);

  function onFilePicked(file: File) {
    setError(null);
    if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError(`סוג קובץ לא נתמך. בחרו ${ALLOWED_PHOTO_MIME_TYPES.join(" / ")}.`);
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError("התמונה גדולה מ-5MB.");
      return;
    }
    setPhotoToCrop(file);
  }

  async function onCropped(croppedBlob: Blob) {
    setPhotoToCrop(null);
    setError(null);
    setBusy(true);
    try {
      const file = new File([croppedBlob], "profile.jpg", {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

      const init = await requestUploadUrl({
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!init.ok) {
        setError(init.formError);
        return;
      }

      try {
        const putRes = await fetch(init.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok && isStubUrl(init.uploadUrl)) {
          // Stub endpoint resolves as network error; treat as success since
          // the form contract is metadata-tracking at MVP 1.
        } else if (!putRes.ok) {
          setError(`העלאה נכשלה (${putRes.status}).`);
          return;
        }
      } catch {
        if (!isStubUrl(init.uploadUrl)) {
          setError("העלאה נכשלה. נסו שוב.");
          return;
        }
      }

      const confirm = await confirmUpload({ r2Key: init.r2Key });
      if (!confirm.ok) {
        setError(confirm.formError);
        return;
      }

      const nextPreview = isStubUrl(confirm.previewUrl)
        ? URL.createObjectURL(file)
        : confirm.previewUrl;
      if (isStubUrl(confirm.previewUrl)) {
        // Revoke the previous blob URL before adopting the new one.
        if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
        setLocalObjectUrl(nextPreview);
      } else if (localObjectUrl) {
        URL.revokeObjectURL(localObjectUrl);
        setLocalObjectUrl(null);
      }
      setR2Key(confirm.r2Key);
      setPreviewUrl(nextPreview);
      // Re-render the server tree so the SiteHeader avatar (read from the
      // session-backed user record) reflects the new photo without a full
      // browser reload.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      {hiddenInputName && (
        <input type="hidden" name={hiddenInputName} value={r2Key ?? ""} />
      )}
      <Avatar
        size="xl"
        name={name}
        src={previewUrl ?? undefined}
        className="bg-primary-container text-on-primary"
      />
      <div className="flex flex-col gap-2">
        <label className="cursor-pointer text-sm font-bold text-primary-container">
          <span className="border-b border-primary-container">
            {r2Key ? "החליפו תמונת פרופיל" : "העלו תמונת פרופיל"}
          </span>
          <input
            type="file"
            accept={ALLOWED_PHOTO_MIME_TYPES.join(",")}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFilePicked(file);
              e.target.value = ""; // allow re-picking the same file
            }}
          />
        </label>
        <p className="text-xs text-secondary">JPG, PNG או WebP · עד 5MB</p>
        {busy && (
          <p className="text-xs font-bold text-primary-container" role="status">
            מעלים…
          </p>
        )}
        {error && (
          <p className="text-xs font-bold text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      {photoToCrop && (
        <PhotoCropModal
          file={photoToCrop}
          onConfirm={onCropped}
          onCancel={() => setPhotoToCrop(null)}
        />
      )}
    </div>
  );
}
