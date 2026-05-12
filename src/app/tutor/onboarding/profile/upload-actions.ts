"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getDb } from "../../../../lib/db/client";
import { runWithAuditEvent } from "../../../../lib/db/audit";
import { tutorDocuments } from "../../../../lib/db/schema";
import { track } from "../../../../lib/analytics";
import { anonymizeIpForAnalytics } from "../../../../lib/auth/rate-limit";
import { getFilesProvider } from "../../../../lib/providers/files";
import { readIp } from "../../../signup/_lib/origin";
import { requireTutor } from "../_lib/require-tutor";
import { checkTutorRateLimit } from "../_lib/tutor-rate-limit";
import {
  ALLOWED_INTRO_VIDEO_MIME_TYPES,
  ALLOWED_PHOTO_MIME_TYPES,
  PROFILE_FORM_LIMITS,
  isAllowedIntroVideoMime,
  isAllowedPhotoMime,
} from "./profile-form-schema";

const UPLOAD_URL_EXPIRES_SEC = 600;

export type UploadInitResult =
  | { ok: true; uploadUrl: string; r2Key: string; expiresAt: string }
  | { ok: false; formError: string };

export type UploadConfirmResult =
  | { ok: true; r2Key: string; previewUrl: string }
  | { ok: false; formError: string };

function mimeToExtension(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/quicktime") return "mov";
  if (contentType === "video/webm") return "webm";
  return "bin";
}

async function rateLimitOrReject(
  user: { id: string },
  ip: string,
): Promise<{ ok: false; formError: string } | null> {
  const db = getDb() as unknown as Parameters<typeof checkTutorRateLimit>[0]["db"];
  const limit = await checkTutorRateLimit({
    db,
    tutorUserId: user.id,
    action: "request_upload",
    ipForAudit: ip,
  });
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: "request_upload",
    });
    return { ok: false as const, formError: "יותר מדי בקשות העלאה. נסו שוב בעוד דקה." };
  }
  return null;
}

// --- Profile photo upload (optional) --------------------------------------

export async function requestProfilePhotoUploadUrlAction(input: {
  contentType: string;
  sizeBytes: number;
}): Promise<UploadInitResult> {
  const user = await requireTutor("/tutor/onboarding/profile");
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));

  const rejected = await rateLimitOrReject(user, ip);
  if (rejected) return rejected;

  if (!isAllowedPhotoMime(input.contentType)) {
    return {
      ok: false,
      formError: `סוג קובץ לא נתמך. בחרו ${ALLOWED_PHOTO_MIME_TYPES.join(" / ")}.`,
    };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > PROFILE_FORM_LIMITS.PHOTO_MAX_BYTES) {
    return { ok: false, formError: "התמונה גדולה מ-5MB. בחרו קובץ קטן יותר." };
  }

  const key = `photos/${user.id}/${randomUUID()}.${mimeToExtension(input.contentType)}`;
  const { uploadUrl, expiresAt } = await getFilesProvider().generatePresignedPutUrl({
    bucket: "tutor-profile-photos",
    key,
    contentType: input.contentType,
    maxSizeBytes: PROFILE_FORM_LIMITS.PHOTO_MAX_BYTES,
    expiresInSec: UPLOAD_URL_EXPIRES_SEC,
  });

  return { ok: true, uploadUrl, r2Key: key, expiresAt: expiresAt.toISOString() };
}

export async function confirmProfilePhotoUploadAction(input: {
  r2Key: string;
}): Promise<UploadConfirmResult> {
  const user = await requireTutor("/tutor/onboarding/profile");

  if (!input.r2Key.trim()) {
    return { ok: false, formError: "מפתח R2 חסר." };
  }

  const db = getDb();
  await runWithAuditEvent(
    db,
    async (tx) => {
      void tx;
      // Photo metadata lives directly on tutor_profiles, not in tutor_documents;
      // we stage the key in the form's hidden field and let submitProfileAction
      // write it. This action exists for the audit-trail symmetry with the
      // intro-video confirm path.
    },
    {
      eventType: "tutor.profile_photo_uploaded",
      actorKind: "user",
      actorId: user.id,
      targetType: "tutor_profile",
      targetId: user.id,
      payload: { r2Key: input.r2Key },
    },
  );

  const previewUrl = await getFilesProvider().generatePresignedGetUrl({
    bucket: "tutor-profile-photos",
    key: input.r2Key,
    expiresInSec: UPLOAD_URL_EXPIRES_SEC,
  });

  return { ok: true, r2Key: input.r2Key, previewUrl };
}

// --- Intro video upload (required at submit) ------------------------------

export async function requestIntroVideoUploadUrlAction(input: {
  contentType: string;
  sizeBytes: number;
  durationSec: number;
}): Promise<UploadInitResult> {
  const user = await requireTutor("/tutor/onboarding/profile");
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));

  const rejected = await rateLimitOrReject(user, ip);
  if (rejected) return rejected;

  if (!isAllowedIntroVideoMime(input.contentType)) {
    return {
      ok: false,
      formError: `סוג קובץ לא נתמך. בחרו ${ALLOWED_INTRO_VIDEO_MIME_TYPES.join(" / ")}.`,
    };
  }
  if (
    input.sizeBytes <= 0 ||
    input.sizeBytes > PROFILE_FORM_LIMITS.INTRO_VIDEO_MAX_BYTES
  ) {
    return { ok: false, formError: "הסרטון גדול מ-50MB. בחרו קובץ קטן יותר." };
  }
  // Duration is client-probed and re-asserted here as a sanity gate. Server
  // cannot independently verify (ffprobe is out of scope at MVP 1; admin
  // vetting catches misuse during Story 2.4's queue review).
  if (
    input.durationSec < PROFILE_FORM_LIMITS.INTRO_VIDEO_MIN_DURATION_SEC ||
    input.durationSec > PROFILE_FORM_LIMITS.INTRO_VIDEO_MAX_DURATION_SEC
  ) {
    return {
      ok: false,
      formError: `אורך הסרטון חייב להיות בין ${PROFILE_FORM_LIMITS.INTRO_VIDEO_MIN_DURATION_SEC} ל-${PROFILE_FORM_LIMITS.INTRO_VIDEO_MAX_DURATION_SEC} שניות.`,
    };
  }

  const key = `intros/${user.id}/${randomUUID()}.${mimeToExtension(input.contentType)}`;
  const { uploadUrl, expiresAt } = await getFilesProvider().generatePresignedPutUrl({
    bucket: "tutor-intro-videos",
    key,
    contentType: input.contentType,
    maxSizeBytes: PROFILE_FORM_LIMITS.INTRO_VIDEO_MAX_BYTES,
    expiresInSec: UPLOAD_URL_EXPIRES_SEC,
  });

  return { ok: true, uploadUrl, r2Key: key, expiresAt: expiresAt.toISOString() };
}

export async function confirmIntroVideoUploadAction(input: {
  r2Key: string;
  sizeBytes: number;
  contentType: string;
}): Promise<UploadConfirmResult> {
  const user = await requireTutor("/tutor/onboarding/profile");

  if (!input.r2Key.trim()) {
    return { ok: false, formError: "מפתח R2 חסר." };
  }
  if (!isAllowedIntroVideoMime(input.contentType)) {
    return { ok: false, formError: "סוג קובץ לא נתמך." };
  }

  const db = getDb();

  // Insert the tutor_documents row + audit row in a single transaction.
  await runWithAuditEvent(
    db,
    async (tx) => {
      await tx.insert(tutorDocuments).values({
        tutorUserId: user.id,
        docType: "intro_video",
        r2Key: input.r2Key,
        mimeType: input.contentType,
        sizeBytes: input.sizeBytes,
        vettingStatus: "pending",
        createdByKind: "user",
        createdByActor: user.id,
      });
    },
    {
      eventType: "tutor.intro_video_uploaded",
      actorKind: "user",
      actorId: user.id,
      targetType: "tutor_profile",
      targetId: user.id,
      payload: { r2Key: input.r2Key, sizeBytes: input.sizeBytes, mimeType: input.contentType },
    },
  );

  const previewUrl = await getFilesProvider().generatePresignedGetUrl({
    bucket: "tutor-intro-videos",
    key: input.r2Key,
    expiresInSec: UPLOAD_URL_EXPIRES_SEC,
  });

  return { ok: true, r2Key: input.r2Key, previewUrl };
}

// Helper exposed for the dashboard CTA and other server-side readers.
export async function getTutorProfilePreviewUrls(input: {
  introVideoR2Key: string | null;
  photoR2Key: string | null;
}): Promise<{ photoUrl: string | null; introVideoUrl: string | null }> {
  const provider = getFilesProvider();
  const [photoUrl, introVideoUrl] = await Promise.all([
    input.photoR2Key
      ? provider.generatePresignedGetUrl({
          bucket: "tutor-profile-photos",
          key: input.photoR2Key,
          expiresInSec: UPLOAD_URL_EXPIRES_SEC,
        })
      : Promise.resolve(null as string | null),
    input.introVideoR2Key
      ? provider.generatePresignedGetUrl({
          bucket: "tutor-intro-videos",
          key: input.introVideoR2Key,
          expiresInSec: UPLOAD_URL_EXPIRES_SEC,
        })
      : Promise.resolve(null as string | null),
  ]);
  return { photoUrl, introVideoUrl };
}

