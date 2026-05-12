"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../../lib/db/client";
import { toAuditEventValues } from "../../../../lib/db/audit";
import { auditEvents, tutorDocuments } from "../../../../lib/db/schema";
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

// Code-review patch (2026-05-12): R2-key prefix guards.
// The orchestrator must verify any client-supplied r2Key is under the
// caller's own tutor-id prefix. Without this, a tutor who learns another
// tutor's r2Key (e.g., via a leaked presigned GET URL) can submit it in
// their own FormData and either claim that video as their own OR (via the
// tutor_documents UPDATE in runSubmitProfile) flip the other tutor's
// vetting_status back to "pending". The orchestrator-side check in
// runSubmitProfile is the canonical defense; these confirm-action checks
// are the second line.
function ownsPhotoKey(userId: string, key: string): boolean {
  return key.startsWith(`photos/${userId}/`);
}
function ownsIntroKey(userId: string, key: string): boolean {
  return key.startsWith(`intros/${userId}/`);
}

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

  // Code-review patch (2026-05-12): spec AC5 requires
  // `tutor.profile_photo_upload_requested` audit on URL-issuance. Best-effort
  // write — a failure here should not block the upload URL return.
  try {
    const db = getDb() as unknown as {
      insert: (table: typeof auditEvents) => {
        values: (v: unknown) => Promise<unknown>;
      };
    };
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "tutor.profile_photo_upload_requested",
        actorKind: "user",
        actorId: user.id,
        targetType: "tutor_profile",
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
  const user = await requireTutor("/tutor/onboarding/profile");

  if (!input.r2Key.trim()) {
    return { ok: false, formError: "מפתח R2 חסר." };
  }
  // Code-review patch (2026-05-12): refuse R2 keys not under this user's
  // prefix. Without this, a tutor could send another tutor's confirmed key.
  if (!ownsPhotoKey(user.id, input.r2Key)) {
    return { ok: false, formError: "מפתח R2 לא תקין." };
  }

  // Photo metadata lives directly on tutor_profiles, not in tutor_documents;
  // we stage the key in the form's hidden field and let submitProfileAction
  // write it. This action only records the audit row for the trail.
  //
  // Sequential write (no tx) — neon-http driver does not support transactions
  // (`No transactions support in neon-http driver`). Stories 1.13/1.14 use the
  // same sequential pattern with cleanup-on-failure.
  const db = getDb();
  await db.insert(auditEvents).values(
    toAuditEventValues({
      eventType: "tutor.profile_photo_uploaded",
      actorKind: "user",
      actorId: user.id,
      targetType: "tutor_profile",
      targetId: user.id,
      payload: { r2Key: input.r2Key },
    }),
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

  // Code-review patch (2026-05-12): spec AC6 requires
  // `tutor.intro_video_upload_requested` audit on URL-issuance.
  try {
    const db = getDb() as unknown as {
      insert: (table: typeof auditEvents) => {
        values: (v: unknown) => Promise<unknown>;
      };
    };
    await db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "tutor.intro_video_upload_requested",
        actorKind: "user",
        actorId: user.id,
        targetType: "tutor_profile",
        targetId: user.id,
        payload: {
          r2Key: key,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          durationSec: input.durationSec,
        },
      }),
    );
  } catch (err) {
    console.error("[requestIntroVideoUploadUrlAction] audit write failed", err);
  }

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
  // Code-review patch (2026-05-12): refuse keys not under this user's prefix.
  if (!ownsIntroKey(user.id, input.r2Key)) {
    return { ok: false, formError: "מפתח R2 לא תקין." };
  }
  if (!isAllowedIntroVideoMime(input.contentType)) {
    return { ok: false, formError: "סוג קובץ לא נתמך." };
  }

  const db = getDb();

  // Code-review patch (2026-05-12): idempotency. A tutor triple-clicking
  // "החליפו סרטון" (or hitting the action via network retry) previously
  // created multiple `tutor_documents` rows with `vetting_status="pending"`,
  // polluting the admin queue (Story 2.4) with duplicates. DELETE prior
  // pending rows for THIS user before inserting the new one. The orphan
  // R2 objects this leaves behind are already a documented deferred issue
  // (deferred-work.md under Story 2.1) — DELETE keeps the admin queue clean,
  // which is the more important invariant. The audit row written below
  // preserves the trail. Filter: (tutorUserId, docType, status=pending).
  //
  // Sequential writes (no tx) — neon-http does not support transactions.
  // Failure between the DELETE and the INSERT would leave the tutor with no
  // pending intro_video row; the submit action's validation surfaces a clear
  // "intro video required" error, so the worst case is a re-upload prompt.
  await db
    .delete(tutorDocuments)
    .where(
      and(
        eq(tutorDocuments.tutorUserId, user.id),
        eq(tutorDocuments.docType, "intro_video"),
        eq(tutorDocuments.vettingStatus, "pending"),
      ),
    );
  await db.insert(tutorDocuments).values({
    tutorUserId: user.id,
    docType: "intro_video",
    r2Key: input.r2Key,
    mimeType: input.contentType,
    sizeBytes: input.sizeBytes,
    vettingStatus: "pending",
    createdByKind: "user",
    createdByActor: user.id,
  });
  await db.insert(auditEvents).values(
    toAuditEventValues({
      eventType: "tutor.intro_video_uploaded",
      actorKind: "user",
      actorId: user.id,
      targetType: "tutor_profile",
      targetId: user.id,
      payload: { r2Key: input.r2Key, sizeBytes: input.sizeBytes, mimeType: input.contentType },
    }),
  );

  const previewUrl = await getFilesProvider().generatePresignedGetUrl({
    bucket: "tutor-intro-videos",
    key: input.r2Key,
    expiresInSec: UPLOAD_URL_EXPIRES_SEC,
  });

  return { ok: true, r2Key: input.r2Key, previewUrl };
}

// Helper exposed for the dashboard CTA and other server-side readers. Stub
// URLs (`https://stub.r2.local/...`) are filtered to null because the browser
// can't fetch them — the form renders an "uploaded" placeholder instead. Real
// R2 presigned GET URLs pass through unchanged.
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
  return {
    photoUrl: filterStubUrl(photoUrl),
    introVideoUrl: filterStubUrl(introVideoUrl),
  };
}

function filterStubUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("https://stub.r2.local/") ? null : url;
}

