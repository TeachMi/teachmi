// Shared `robots` directive helper for public pages.
//
// Closed-beta indexing guard: public marketplace surfaces are PUBLICLY VIEWABLE
// to anyone (FR17, FR18) but we only want search engines to index them when
// (a) we're running in production AND (b) the founder has explicitly opted in
// via the `ALLOW_PUBLIC_INDEX` env var.
//
// Until both gates pass, preview/dev/closed-beta deployments are `noindex,
// nofollow`. This avoids leaking unapproved tutor profiles or pre-launch
// homepage content to search engines.
//
// Originally introduced by Story 3.2 as an inline function in
// `src/app/tutor/[slug]/page.tsx`; extracted here by Story 3.1 (homepage)
// to avoid two copies drifting apart. Story 3.2's call site was refactored
// to import from this module — same behavior, single source of truth.
export function buildIndexableRobotsDirective(): { index: boolean; follow: boolean } {
  const allowed =
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PUBLIC_INDEX === "true";
  return { index: allowed, follow: allowed };
}
