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

export type FilesBucket = "tutor-intro-videos" | "tutor-profile-photos";

export interface PresignedPutUrlInput {
  bucket: FilesBucket;
  /** Object key under the bucket — caller-controlled. Must be non-empty. */
  key: string;
  /** MIME type pinned into the signed URL. Real R2 rejects mismatched uploads. */
  contentType: string;
  /** Hard cap enforced by the signed URL (R2 returns 400 if exceeded). */
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
];
