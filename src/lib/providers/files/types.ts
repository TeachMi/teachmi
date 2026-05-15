/**
 * FilesProvider — strategy interface for object-storage uploads + reads.
 * MVP 1: StubFilesProvider (in-memory fakes, no network). MVP 2: R2FilesProvider
 * (Cloudflare R2 via the S3-compatible API; AD-10).
 *
 * Per AD-13 + AR-06: clients upload directly to R2 via pre-signed PUT URLs.
 * No server-side proxying of binary content.
 *
 * Selection via FILES_PROVIDER env-var.
 */

// Logical bucket names. The R2 provider implementation (Phase 2; wired
// after the EU DPA is signed — vendor-onboarding-checklist-2026-05-03.md)
// translates these to physical bucket names. Non-prod environments suffix
// the physical name with `-e2e` (e.g. `student-profile-photos` → physical
// `student-profile-photos-e2e`); the StubFilesProvider used at MVP 1
// doesn't actually hit any object storage, so the suffix is forward-looking.
export type FilesBucket =
  | "tutor-intro-videos"
  | "tutor-profile-photos"
  | "student-profile-photos";

export interface PresignedPutUrlInput {
  bucket: FilesBucket;
  /** Object key under the bucket — caller-controlled. Must be non-empty. */
  key: string;
  /** MIME type pinned into the signed URL. Real R2 rejects mismatched uploads. */
  contentType: string;
  /**
   * Caller-side size cap, in bytes. Stub validates against this directly;
   * the R2 impl uses it as documentation only — S3-style presigned PUT URLs
   * can't enforce a max Content-Length without switching to POST policies.
   * Server-side validation of the declared `sizeBytes` in `upload-actions.ts`
   * runs BEFORE we mint the URL, which is the actual gate. A client that
   * lies on `sizeBytes` and then PUTs more bytes than declared would not be
   * rejected by R2; bucket lifecycle rules + post-upload validation are the
   * defense-in-depth for that case (not implemented in MVP 1).
   */
  maxSizeBytes: number;
  /** TTL for the signed URL in seconds (real R2 max 7d; we use minutes). */
  expiresInSec: number;
}

export interface PresignedPutUrlResult {
  uploadUrl: string;
  /** Wall-clock expiry; mirrors `expiresInSec` for caller convenience. */
  expiresAt: Date;
}

export interface PresignedGetUrlInput {
  bucket: FilesBucket;
  key: string;
  expiresInSec: number;
}

export interface FilesProvider {
  generatePresignedPutUrl(input: PresignedPutUrlInput): Promise<PresignedPutUrlResult>;
  generatePresignedGetUrl(input: PresignedGetUrlInput): Promise<string>;
  /**
   * Best-effort delete — Stub no-ops without erroring; real R2 returns success
   * even when the key never existed (S3 semantic).
   */
  deleteObject(input: { bucket: FilesBucket; key: string }): Promise<void>;
}

export const FILES_BUCKETS: readonly FilesBucket[] = [
  "tutor-intro-videos",
  "tutor-profile-photos",
  "student-profile-photos",
];
