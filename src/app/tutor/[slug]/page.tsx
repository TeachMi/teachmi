import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import {
  type DiscoverableTutorPublic,
  getDiscoverableTutorByUserId,
} from "@/lib/db/queries/tutor-queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Plain TS validation (no zod) — matches the codebase convention established
// by `profile-form-schema.ts` and `lib/auth/registration.ts`.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Wrap in `cache()` so `generateMetadata` and the page body share the same
// per-request lookup. Without this, Next 16 issues two DB round-trips per
// page render. React's `cache` is request-scoped automatically in server
// components.
//
// Pre-validates the slug as a UUID so a malformed string (e.g. someone hitting
// `/tutor/foo`) returns 404 without ever issuing the DB query — Postgres'
// `uuid` cast throws on malformed input, which would surface as a 500.
//
// At MVP 1 the `[slug]` route param contents are the tutor's `user_id` UUID.
// Story 3.2 may introduce a real human-readable slug column on `tutor_profiles`
// when it builds the full public-profile UX; the route filename stays the same
// (matches architecture.md's `tutor/[slug]/` directory plan).
const resolveDiscoverableTutor = cache(
  async (slug: string): Promise<DiscoverableTutorPublic | null> => {
    if (!isUuid(slug)) return null;
    try {
      return await getDiscoverableTutorByUserId(slug);
    } catch (err) {
      // Same defensive pattern as /tutor/onboarding/profile/page.tsx: a
      // transient DB outage shouldn't render a 500 page to the public —
      // degrade to 404, which is the same shape an unauthorized visitor sees
      // for an unapproved tutor. The PII-leak-avoidance argument applies
      // either way.
      console.error("[tutor/[slug]/page] discoverable lookup failed", err);
      return null;
    }
  },
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tutor = await resolveDiscoverableTutor(slug);
  if (!tutor) {
    return {
      title: "TeachMe",
    };
  }
  return {
    title: `${tutor.displayName} · TeachMe`,
    description: `${tutor.displayName} — TeachMe`,
  };
}

export default async function PublicTutorProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const tutor = await resolveDiscoverableTutor(slug);

  if (!tutor) {
    // Intentional 404 (not a friendly "pending approval" page) — leaking tutor
    // existence to anonymous visitors is the info-leak we're avoiding. Story
    // 2.3 spec AC1.
    notFound();
  }

  // STUB: Story 3.2 (public tutor profile page, FR18) replaces this body with
  // the real UX — intro video player, price block, embedded calendar, subject
  // chips, ratings, reviews. The route's existence check (404 vs 200) is
  // Story 2.3's deliverable; the visible page UX is Story 3.2's deliverable.
  return (
    <AppShell mainClassName="flex-1 bg-linen">
      <section className="mx-auto w-full max-w-4xl space-y-4 px-6 py-12 text-start">
        <h1 className="font-display text-3xl font-extrabold text-primary-container">
          {tutor.displayName}
        </h1>
        <p className="text-sm text-on-surface-variant">
          פרופיל המורה — בקרוב
        </p>
      </section>
    </AppShell>
  );
}
