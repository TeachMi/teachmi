import {
  FILES_BUCKETS,
  type FilesProvider,
  type PresignedGetUrlInput,
  type PresignedPutUrlInput,
  type PresignedPutUrlResult,
} from "./types";

const STUB_HOST = "https://stub.r2.local";

/**
 * In-memory FilesProvider for MVP 1 + tests. Generates deterministic URLs that
 * look enough like presigned R2 URLs to satisfy the form's "did the upload-init
 * action succeed?" gate, but stores nothing and verifies nothing on PUT.
 *
 * Per Story 1.6's stub validation philosophy (locked 2026-05-07): minimal
 * one-line invariants the real R2 would also reject. No branded types, no full
 * zod schemas — those live at the Server Action boundary.
 */
export class StubFilesProvider implements FilesProvider {
  async generatePresignedPutUrl(
    input: PresignedPutUrlInput,
  ): Promise<PresignedPutUrlResult> {
    if (!FILES_BUCKETS.includes(input.bucket)) {
      throw new RangeError(
        `StubFilesProvider.generatePresignedPutUrl: bucket must be one of [${FILES_BUCKETS.join(", ")}]`,
      );
    }
    if (!input.key.trim()) {
      throw new RangeError(
        "StubFilesProvider.generatePresignedPutUrl: key must be non-empty",
      );
    }
    if (input.maxSizeBytes <= 0) {
      throw new RangeError(
        "StubFilesProvider.generatePresignedPutUrl: maxSizeBytes must be positive",
      );
    }
    if (input.expiresInSec <= 0) {
      throw new RangeError(
        "StubFilesProvider.generatePresignedPutUrl: expiresInSec must be positive",
      );
    }
    if (!input.contentType.trim()) {
      throw new RangeError(
        "StubFilesProvider.generatePresignedPutUrl: contentType must be non-empty",
      );
    }

    const expiresAt = new Date(Date.now() + input.expiresInSec * 1000);
    const sig = `stub-${input.expiresInSec}-${encodeURIComponent(input.contentType)}-${input.maxSizeBytes}`;
    const uploadUrl = `${STUB_HOST}/${input.bucket}/${encodeKey(input.key)}?fake-sig=${sig}`;
    return { uploadUrl, expiresAt };
  }

  async generatePresignedGetUrl(input: PresignedGetUrlInput): Promise<string> {
    if (!FILES_BUCKETS.includes(input.bucket)) {
      throw new RangeError(
        `StubFilesProvider.generatePresignedGetUrl: bucket must be one of [${FILES_BUCKETS.join(", ")}]`,
      );
    }
    if (!input.key.trim()) {
      throw new RangeError(
        "StubFilesProvider.generatePresignedGetUrl: key must be non-empty",
      );
    }
    if (input.expiresInSec <= 0) {
      throw new RangeError(
        "StubFilesProvider.generatePresignedGetUrl: expiresInSec must be positive",
      );
    }
    return `${STUB_HOST}/${input.bucket}/${encodeKey(input.key)}?fake-get=${input.expiresInSec}`;
  }

  async deleteObject(input: { bucket: import("./types").FilesBucket; key: string }): Promise<void> {
    if (!FILES_BUCKETS.includes(input.bucket)) {
      throw new RangeError(
        `StubFilesProvider.deleteObject: bucket must be one of [${FILES_BUCKETS.join(", ")}]`,
      );
    }
    if (!input.key.trim()) {
      throw new RangeError("StubFilesProvider.deleteObject: key must be non-empty");
    }
    // No-op — stub tracks nothing. Real R2 returns success regardless of existence.
  }
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
