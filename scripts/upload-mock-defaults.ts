// Upload helper for the mock-tutor default photos + videos. Story 5.x
// 2026-05-19. Run once after dropping local files into `mock-assets/`
// (gitignored — see `.gitignore`).
//
// Expected files under `mock-assets/` (created locally, NOT checked in):
//   photo-shira-cohen.jpg     // any 600×600+ square portrait
//   photo-yossi-arbiv.jpg
//   photo-reuvit-ben-david.jpg
//   photo-daniel-margalit.jpg
//   photo-tamar-ezra.jpg
//   video-1.mp4               // 10-60s, .mp4 (H.264). Cycle across 5 tutors:
//   video-2.mp4               //   variant 1 → Shira + Daniel
//   video-3.mp4               //   variant 2 → Yossi + Tamar
//                             //   variant 3 → Reuvit
//
// Where to grab content quickly (founder direction 2026-05-19):
//   - Photos: any 5 free-for-use portraits. Suggestions:
//       https://www.pexels.com/search/teacher%20portrait/   (filter Free)
//       https://thispersondoesnotexist.com/                 (one click → save 5×)
//   - Videos: any 3 short talking-head clips. Suggestions:
//       https://www.pexels.com/search/videos/person%20talking/   (10-30s)
//       https://www.pexels.com/search/videos/explain/
//     Trim to ≤60s with ffmpeg or quicktime if needed.
//
// Then:
//   DATABASE_URL=<branch-url> pnpm tsx scripts/upload-mock-defaults.ts
//   (re-runs overwrite — idempotent at the object level)
//
// Buckets (logical names; physical buckets carry an `-e2e` suffix in
// non-prod environments per the provider config):
//   - tutor-profile-photos    for the 5 photos
//   - tutor-intro-videos      for the 3 videos
//
// Keys MUST match what `seed-mock-tutors.ts` writes into the DB:
//   tutor_profiles.profile_photo_r2_key = "mock-defaults/photo-<slug>.jpg"
//   tutor_profiles.intro_video_r2_key   = "mock-defaults/video-<1|2|3>.mp4"

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import "dotenv/config";
import { getFilesProvider } from "../src/lib/providers/files";

interface UploadSpec {
  bucket: "tutor-profile-photos" | "tutor-intro-videos";
  localPath: string;
  remoteKey: string;
  contentType: string;
  maxSizeBytes: number;
}

const PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const VIDEO_MAX_BYTES = 80 * 1024 * 1024; // 80 MB

const UPLOADS: UploadSpec[] = [
  // Photos — one per mock tutor.
  {
    bucket: "tutor-profile-photos",
    localPath: "mock-assets/photo-shira-cohen.jpg",
    remoteKey: "mock-defaults/photo-shira-cohen.jpg",
    contentType: "image/jpeg",
    maxSizeBytes: PHOTO_MAX_BYTES,
  },
  {
    bucket: "tutor-profile-photos",
    localPath: "mock-assets/photo-yossi-arbiv.jpg",
    remoteKey: "mock-defaults/photo-yossi-arbiv.jpg",
    contentType: "image/jpeg",
    maxSizeBytes: PHOTO_MAX_BYTES,
  },
  {
    bucket: "tutor-profile-photos",
    localPath: "mock-assets/photo-reuvit-ben-david.jpg",
    remoteKey: "mock-defaults/photo-reuvit-ben-david.jpg",
    contentType: "image/jpeg",
    maxSizeBytes: PHOTO_MAX_BYTES,
  },
  {
    bucket: "tutor-profile-photos",
    localPath: "mock-assets/photo-daniel-margalit.jpg",
    remoteKey: "mock-defaults/photo-daniel-margalit.jpg",
    contentType: "image/jpeg",
    maxSizeBytes: PHOTO_MAX_BYTES,
  },
  {
    bucket: "tutor-profile-photos",
    localPath: "mock-assets/photo-tamar-ezra.jpg",
    remoteKey: "mock-defaults/photo-tamar-ezra.jpg",
    contentType: "image/jpeg",
    maxSizeBytes: PHOTO_MAX_BYTES,
  },
  // Videos — 3 default clips, reused across the 5 tutors.
  {
    bucket: "tutor-intro-videos",
    localPath: "mock-assets/video-1.mp4",
    remoteKey: "mock-defaults/video-1.mp4",
    contentType: "video/mp4",
    maxSizeBytes: VIDEO_MAX_BYTES,
  },
  {
    bucket: "tutor-intro-videos",
    localPath: "mock-assets/video-2.mp4",
    remoteKey: "mock-defaults/video-2.mp4",
    contentType: "video/mp4",
    maxSizeBytes: VIDEO_MAX_BYTES,
  },
  {
    bucket: "tutor-intro-videos",
    localPath: "mock-assets/video-3.mp4",
    remoteKey: "mock-defaults/video-3.mp4",
    contentType: "video/mp4",
    maxSizeBytes: VIDEO_MAX_BYTES,
  },
];

async function main() {
  const provider = getFilesProvider();
  const cwd = process.cwd();

  // Pre-flight: warn (don't fail) about any missing files so the user can
  // fix all of them in one round-trip instead of one-by-one.
  const missing = UPLOADS.filter((u) => !existsSync(resolve(cwd, u.localPath)));
  if (missing.length === UPLOADS.length) {
    console.error(
      "All mock-asset files missing. Drop the photos + videos into `mock-assets/` first.",
    );
    console.error("See the comment block at the top of this script for source suggestions.");
    process.exit(1);
  }
  if (missing.length > 0) {
    console.warn(`Skipping ${missing.length} missing file(s):`);
    for (const m of missing) console.warn(`  ! ${m.localPath}`);
    console.warn("");
  }

  let uploaded = 0;
  for (const spec of UPLOADS) {
    const abs = resolve(cwd, spec.localPath);
    if (!existsSync(abs)) continue;

    const body = await readFile(abs);
    if (body.byteLength > spec.maxSizeBytes) {
      console.warn(
        `  ! ${spec.localPath} is ${body.byteLength} bytes (> ${spec.maxSizeBytes}). Skipping.`,
      );
      continue;
    }

    // Use the presigned-PUT URL, then PUT directly. This matches how the
    // app's upload flow works for tutor-managed uploads, so the path is
    // exercised end-to-end at seed time.
    const { uploadUrl } = await provider.generatePresignedPutUrl({
      bucket: spec.bucket,
      key: spec.remoteKey,
      contentType: spec.contentType,
      maxSizeBytes: spec.maxSizeBytes,
      expiresInSec: 600,
    });
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": spec.contentType },
      body,
    });
    if (!res.ok) {
      console.error(
        `  ! upload failed for ${spec.remoteKey}: HTTP ${res.status} ${res.statusText}`,
      );
      continue;
    }
    console.log(`  + ${spec.bucket}/${spec.remoteKey} (${body.byteLength} bytes)`);
    uploaded++;
  }

  console.log(`\nUploaded ${uploaded} of ${UPLOADS.length} files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
