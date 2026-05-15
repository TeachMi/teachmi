// Shared route-slug validation. Story 3.2 originally inlined this regex in
// `src/app/tutor/[slug]/page.tsx`; Story 2.5 extracts here so its sibling
// `/tutor/[slug]/edit/page.tsx` shares one source of truth.
//
// Why plain TS (no zod): same convention `lib/auth/registration.ts` and
// `profile-form-schema.ts` follow — return a boolean from a regex test rather
// than reach for a schema library. The function is 4 lines; introducing zod
// here would be inconsistent with the rest of `lib/auth/*`.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
