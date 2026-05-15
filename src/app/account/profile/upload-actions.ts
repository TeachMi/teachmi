"use server";

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { toAuditEventValues } from "@/lib/db/audit";
import { auditEvents, users } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { getFilesProvider, isStubUrl } from "@/lib/providers/files";

// Per-user account-level profile photo upload. Used from /account/profile's
// פרטים אישיים pane (Story 5.0 follow-up). The R2 bucket is the LOGICAL
// `student-profile-photos`; physical bucket carries an `-e2e` suffix in
// non-prod environments — wired at the R2 provider impl in MVP 2.
//
// Mirrors the structure of the tutor-side photo upload at
// `src/app/tutor/onboarding/profile/upload-actions.ts`:
//   1. `requestProfilePhotoUploadUrlAction` issues a presigned PUT URL +
//      writes an audit row.
//   2. Client PUTs the cropped JPEG directly to R2 (no server proxy).
//   3. `confirmProfilePhotoUploadAction` writes the R2 key to
//      `users.profile_photo_r2_key` + audit + returns a presigned GET URL.
//
// Key-prefix guard: `photos/<userId>/...` — refuses to confirm a key that
// doesn't start with the caller's own userId prefix (defense against a
// client submitting another user's confirmed key). Same pattern Story 2.1's
// tutor upload-actions adopted post code-review (2026-05-12).

const UPLOAD_URL_EXPIRES_SEC = 600;
const PHOTO_MAX_BYTES = 5_000_000; // 5 MB — matches the tutor photo limit.

const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedPhotoMimeType = (typeof ALLOWED_PHOTO_MIME_TYPES)[number];

function isAllowedPhotoMime(value: string): value is AllowedPhotoMimeType {
  return (ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

function mimeToExtension(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "bin";
}

function ownsPhotoKey(userId: string, key: string): boolean {
  return key.startsWith(`photos/${userId}/`);
}

export type UploadInitResult =
  | { ok: true; uploadUrl: string; r2Key: string; expiresAt: string }
  | { ok: false; formError: string };

export type UploadConfirmResult =
  | { ok: true; r2Key: string; previewUrl: string }
  | { ok: false; formError: string };

export async function requestProfilePhotoUploadUrlAction(input: {
  contentType: string;
  sizeBytes: number;
}): Promise<UploadInitResult> {
  const user = await requireAuth("/account/profile");

  if (!isAllowedPhotoMime(input.contentType)) {
    return {
      ok: false,
      formError: `סוג קובץ לא נתמך. בחרו ${ALLOWED_PHOTO_MIME_TYPES.join(" / ")}.`,
    };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > PHOTO_MAX_BYTES) {
    return { ok: false, formError: "התמונה גדולה מ-5MB. בחרו קובץ קטן יותר." };
  }

  const key = `photos/${user.id}/${randomUUID()}.${mimeToExtension(input.contentType)}`;
  const { uploadUrl, expiresAt } = await getFilesProvider().generatePresignedPutUrl({
    bucket: "student-profile-photos",
    key,
    contentType: input.contentType,
    maxSizeBytes: PHOTO_MAX_BYTES,
    expiresInSec: UPLOAD_URL_EXPIRES_SEC,
  });

  // Audit on URL-issuance — best-effort, never blocks the upload init.
  try {
    const db = getDb();
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "account.profile_photo_upload_requested",
        actorKind: "user",
        actorId: user.id,
        targetType: "user",
        targetId: user.id,
        payload: { r2Key: key, contentType: input.contentType, sizeBytes: input.sizeBytes },
      }),
    );
  } catch (err) {
    console.error("[requestProfilePhotoUploadUrlAction] audit write failed", err);
  }

  return { ok: true, uploadUrl, r2Key: key, expiresAt: expiresAt.toISOString() };
}

export async function confirmProfilePhotoUploadAction(input: {
  r2Key: string;
}): Promise<UploadConfirmResult> {
  const user = await requireAuth("/account/profile");

  if (!input.r2Key.trim()) {
    return { ok: false, formError: "מפתח R2 חסר." };
  }
  if (!ownsPhotoKey(user.id, input.r2Key)) {
    return { ok: false, formError: "מפתח R2 לא תקין." };
  }

  const db = getDb();
  try {
    // Persist the R2 key on the users row. Subsequent renders (SiteHeader
    // avatar, /account/profile pane) resolve to a fresh presigned GET URL
    // via getFilesProvider. Sequential writes (no tx — neon-http
    // constraint); the audit row is best-effort.
    await db
      .update(users)
      .set({
        profilePhotoR2Key: input.r2Key,
        updatedAt: sql`now()`,
        updatedByKind: "user",
        updatedByActor: user.id,
      })
      .where(eq(users.id, user.id));
  } catch (err) {
    console.error("[confirmProfilePhotoUploadAction] users update failed", err);
    return { ok: false, formError: "שגיאה בשמירת התמונה. נסו שוב." };
  }

  try {
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "account.profile_photo_uploaded",
        actorKind: "user",
        actorId: user.id,
        targetType: "user",
        targetId: user.id,
        payload: { r2Key: input.r2Key },
      }),
    );
  } catch (err) {
    console.error("[confirmProfilePhotoUploadAction] audit write failed", err);
  }

  const previewUrl = await getFilesProvider().generatePresignedGetUrl({
    bucket: "student-profile-photos",
    key: input.r2Key,
    expiresInSec: UPLOAD_URL_EXPIRES_SEC,
  });

  return { ok: true, r2Key: input.r2Key, previewUrl };
}

/**
 * Server-side helper used by /account/profile + SiteHeader to resolve the
 * user's current photo to a fresh presigned GET URL. Returns `null` when:
 *   - the user has no `profile_photo_r2_key` set, OR
 *   - the stub provider returned a `stub.r2.local` URL the browser can't
 *     fetch (the consumer falls back to an `<Avatar>` initials block).
 */
export async function resolveProfilePhotoUrl(
  r2Key: string | null | undefined,
): Promise<string | null> {
  if (!r2Key) return null;
  try {
    const url = await getFilesProvider().generatePresignedGetUrl({
      bucket: "student-profile-photos",
      key: r2Key,
      expiresInSec: UPLOAD_URL_EXPIRES_SEC,
    });
    return isStubUrl(url) ? null : url;
  } catch (err) {
    console.error("[resolveProfilePhotoUrl] presign failed", err);
    return null;
  }
}
