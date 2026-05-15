// Cloudflare R2 implementation of FilesProvider.
//
// R2 speaks the S3 wire protocol. We use `aws4fetch` (~1KB) to sign
// SigV4 query-string-signed URLs — the lightweight option Cloudflare's own
// R2 docs recommend for non-Workers environments (we run on Vercel, so we
// can't use Workers R2 Bindings).
//
// Required env vars (set in .env.local + Vercel per environment):
//   R2_ENDPOINT           — full URL, e.g. `https://<account>.eu.r2.cloudflarestorage.com`
//                           Note the `.eu.` subdomain for EU-jurisdiction R2.
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_SUFFIX      — "" (prod) or "-e2e" (dev / preview / e2e)
//
// Bucket naming: <logical bucket> + R2_BUCKET_SUFFIX. The same code runs in
// dev, e2e, and prod; Vercel injects different env values per environment.
//
// CORS: each R2 bucket needs CORS configured in the Cloudflare dashboard
// before browser-direct PUTs work. See README / commit message for the
// JSON to paste in.

import { AwsClient } from "aws4fetch";
import type {
  FilesBucket,
  FilesProvider,
  PresignedGetUrlInput,
  PresignedPutUrlInput,
  PresignedPutUrlResult,
} from "./types";

const SIGNED_URL_SERVICE = "s3";
const SIGNED_URL_REGION = "auto"; // R2 ignores region but the signer needs a value

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `R2FilesProvider: required env var ${name} is missing or empty. ` +
        `Set ${name} in .env.local (dev) and Vercel project settings (e2e + prod).`,
    );
  }
  return value;
}

function getEndpoint(): URL {
  // Stored as a full URL so EU-jurisdiction users (`<acct>.eu.r2...`) and
  // global users (`<acct>.r2...`) can both be supported without parsing
  // the account id apart from the subdomain.
  const raw = requireEnv("R2_ENDPOINT");
  try {
    return new URL(raw);
  } catch {
    throw new Error(`R2FilesProvider: R2_ENDPOINT is not a valid URL: ${raw}`);
  }
}

function getClient(): AwsClient {
  return new AwsClient({
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    service: SIGNED_URL_SERVICE,
    region: SIGNED_URL_REGION,
  });
}

/**
 * Resolves a logical bucket name to its physical R2 name by appending the
 * env-specific suffix. Examples:
 *   ("student-profile-photos") + R2_BUCKET_SUFFIX="-e2e"  → "student-profile-photos-e2e"
 *   ("student-profile-photos") + R2_BUCKET_SUFFIX=""      → "student-profile-photos"
 *
 * Exported for the unit test; not used by callers (they hit the FilesProvider
 * interface).
 */
export function resolveBucketName(logicalBucket: FilesBucket): string {
  // Suffix is OPTIONAL and treated as "" when unset — that's the prod case.
  // We tolerate the missing var instead of failing loud so prod (where there
  // is no suffix) works with no extra env juggling.
  const suffix = process.env.R2_BUCKET_SUFFIX ?? "";
  return `${logicalBucket}${suffix}`;
}

function buildObjectUrl(endpoint: URL, bucket: string, key: string): URL {
  // R2's S3-compatible endpoint uses path-style access: <endpoint>/<bucket>/<key>
  // (Cloudflare R2 doesn't support virtual-hosted-style for the bucket name
  // unless you set up a custom domain.)
  const url = new URL(endpoint.toString());
  // Encode key segments so slashes in `key` are preserved, but other unsafe
  // chars are escaped. `key` itself is constructed by upload-actions.ts as
  // `photos/<userId>/<uuid>.<ext>` — already safe — but we encode segment-
  // by-segment defensively.
  const keySegments = key.split("/").map(encodeURIComponent).join("/");
  url.pathname = `/${encodeURIComponent(bucket)}/${keySegments}`;
  return url;
}

export class R2FilesProvider implements FilesProvider {
  async generatePresignedPutUrl(
    input: PresignedPutUrlInput,
  ): Promise<PresignedPutUrlResult> {
    const endpoint = getEndpoint();
    const bucket = resolveBucketName(input.bucket);
    const url = buildObjectUrl(endpoint, bucket, input.key);
    // Encode the expiry as a query string so aws4fetch picks it up via the
    // SigV4 `X-Amz-Expires` mechanism (query-style signing).
    url.searchParams.set("X-Amz-Expires", String(input.expiresInSec));

    const aws = getClient();
    // `signQuery: true` tells aws4fetch to embed credentials in the URL
    // (presigned URL) rather than in headers. This is what we want for
    // browser-direct PUTs: the client never sees the access key.
    const signed = await aws.sign(url.toString(), {
      method: "PUT",
      // R2 enforces ContentType on signed PUTs: the client's PUT must use
      // the same Content-Type that was signed. We require the client to send
      // `Content-Type: <input.contentType>` (ProfilePhotoEditor does this).
      headers: { "Content-Type": input.contentType },
      aws: { signQuery: true },
    });

    return {
      uploadUrl: signed.url,
      expiresAt: new Date(Date.now() + input.expiresInSec * 1000),
    };
  }

  async generatePresignedGetUrl(input: PresignedGetUrlInput): Promise<string> {
    const endpoint = getEndpoint();
    const bucket = resolveBucketName(input.bucket);
    const url = buildObjectUrl(endpoint, bucket, input.key);
    url.searchParams.set("X-Amz-Expires", String(input.expiresInSec));

    const aws = getClient();
    const signed = await aws.sign(url.toString(), {
      method: "GET",
      aws: { signQuery: true },
    });
    return signed.url;
  }

  async deleteObject(input: { bucket: FilesBucket; key: string }): Promise<void> {
    const endpoint = getEndpoint();
    const bucket = resolveBucketName(input.bucket);
    const url = buildObjectUrl(endpoint, bucket, input.key);

    const aws = getClient();
    // Header-signed (not query-signed) — we issue the DELETE server-side, so
    // creds-in-headers is fine and avoids leaking a delete URL.
    const res = await aws.fetch(url.toString(), { method: "DELETE" });
    // S3 semantic: DELETE returns 204 even when the key never existed. R2
    // matches this. Treat 404 leniently too — same logical outcome.
    if (!res.ok && res.status !== 404) {
      throw new Error(
        `R2FilesProvider.deleteObject: ${res.status} ${res.statusText} for ${bucket}/${input.key}`,
      );
    }
  }
}
