import { StubFilesProvider } from "./stub";
import type { FilesProvider } from "./types";

export type {
  FilesBucket,
  FilesProvider,
  PresignedGetUrlInput,
  PresignedPutUrlInput,
  PresignedPutUrlResult,
} from "./types";
export { FILES_BUCKETS } from "./types";

/**
 * Resolves the active FilesProvider from the FILES_PROVIDER env-var.
 * Defaults to "stub" when unset — same convention as the other providers.
 *
 * Real R2FilesProvider (`r2.ts`) is wired in MVP 2 once the Cloudflare R2 DPA
 * is signed (tracked in vendor-onboarding-checklist-2026-05-03.md). Until
 * then, the env-flag resolution throws fail-loud if someone sets
 * FILES_PROVIDER=r2 without the implementation being wired.
 */
export function getFilesProvider(): FilesProvider {
  const raw = process.env.FILES_PROVIDER;
  const trimmed = raw?.trim() ?? "";

  if (trimmed === "" || trimmed === "stub") {
    return new StubFilesProvider();
  }

  if (trimmed === "r2") {
    throw new Error(
      'FilesProvider "r2" is not yet implemented in this branch — the Cloudflare R2 wiring lands as a follow-up once the EU DPA is signed (vendor-onboarding-checklist-2026-05-03.md). Keep FILES_PROVIDER=stub for closed-beta.',
    );
  }

  throw new Error(
    `Invalid value for FILES_PROVIDER: "${raw}". Expected one of: stub, r2.`,
  );
}
