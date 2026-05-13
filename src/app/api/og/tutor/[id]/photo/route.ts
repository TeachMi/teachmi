// OG-image proxy route — Story 3.2 review decision D2.
//
// Why this exists: `<meta property="og:image">` URLs are scraped + cached
// by Slack/Facebook/Twitter/etc. If we put the presigned-GET R2 URL there
// directly, the signature (with 1h TTL) gets pinned into third-party
// caches. After expiry, social previews break; before expiry, the signed
// URL sits in caches with the signature visible.
//
// The fix: serve a STABLE URL (`/api/og/tutor/<userId>/photo`) that
// re-signs the R2 URL per request and 302-redirects. Scrapers cache the
// stable URL; the signed URL never escapes a single request.
//
// Gate: only serves photos for tutors with `is_active=true`. A
// non-discoverable tutor returns 404, never leaks `profile_photo_r2_key`.

import { NextResponse, type NextRequest } from "next/server";
import { getDiscoverableTutorByUserId } from "@/lib/db/queries/tutor-queries";
import { getFilesProvider } from "@/lib/providers/files";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIGNED_URL_TTL_SEC = 3600;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let tutor;
  try {
    tutor = await getDiscoverableTutorByUserId(id);
  } catch (err) {
    console.error("[api/og/tutor/photo] discoverable lookup failed", err);
    return NextResponse.redirect(
      new URL("/og-default-tutor.png", _request.url),
      302,
    );
  }

  if (!tutor || !tutor.profilePhotoR2Key) {
    // Non-discoverable tutor OR no photo on record — redirect to the
    // default OG placeholder so social previews still render something.
    return NextResponse.redirect(
      new URL("/og-default-tutor.png", _request.url),
      302,
    );
  }

  try {
    const signedUrl = await getFilesProvider().generatePresignedGetUrl({
      bucket: "tutor-profile-photos",
      key: tutor.profilePhotoR2Key,
      expiresInSec: SIGNED_URL_TTL_SEC,
    });
    return NextResponse.redirect(signedUrl, 302);
  } catch (err) {
    console.error("[api/og/tutor/photo] presign failed", err);
    return NextResponse.redirect(
      new URL("/og-default-tutor.png", _request.url),
      302,
    );
  }
}
