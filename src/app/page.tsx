import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import {
  getActiveSubjects,
  type MarketplaceSubject,
} from "@/lib/db/queries/subject-queries";
import { buildIndexableRobotsDirective } from "@/lib/seo/robots";
import { HeadlineFourSubjects } from "./_components/HeadlineFourSubjects";
import { HeroSection } from "./_components/HeroSection";
import { SubjectTaxonomyGrid } from "./_components/SubjectTaxonomyGrid";

// Marketplace homepage (FR17, Story 3.1). Hero + headline-four cards + full
// 11-subject taxonomy. All RSC; zero client JS.
//
// **Caching:** the `getActiveSubjects()` helper wraps its query in Next 16's
// `unstable_cache` with tag `"subjects"`. Story 3.6's admin taxonomy editor
// MUST call `revalidateTag("subjects")` after each mutation to invalidate
// this entry cross-request.
//
// **`dynamic = "force-dynamic"`** — required because static prerendering at
// build time would call `getActiveSubjects()` (which opens a Drizzle
// connection) without `DATABASE_URL` set in the build environment, breaking
// `next build`. Same pattern as Story 3.2's tutor profile page. The
// `unstable_cache` wrapper inside `getActiveSubjects` provides the
// cross-request caching this page actually wants; per-request rendering is
// cheap (one cached SELECT). Page does NOT call `auth()` — the CTAs work
// identically for signed-in / anonymous visitors.
export const dynamic = "force-dynamic";

const TITLE = "TeachMe — מורים פרטיים בעברית";
const DESCRIPTION =
  "פלטפורמת מורים פרטיים אונליין לתלמידי בגרות ופסיכומטרי. מורים מסודרים, חשבונית מס, ובלי וואטסאפ.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: TITLE,
    description: DESCRIPTION,
    robots: buildIndexableRobotsDirective(),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      type: "website",
      locale: "he_IL",
      images: [
        {
          url: "/og-default-home.png",
          width: 1200,
          height: 630,
          alt: "TeachMe",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    },
  };
}

// Wrap the subjects query so a missing `DATABASE_URL` (CI playwright webServer,
// preview-without-DB) or a Neon outage degrades to an empty taxonomy instead
// of 500-ing the homepage. The headline-four band still renders via the
// hardcoded fallback display names (per HeadlineFourSubjects AC2); the full
// taxonomy band renders its "המקצועות מתעדכנים, חזרו בקרוב" empty state.
// Same pattern Story 3.2's dashboard `readTutorOnboardingState` uses
// (catch + log + degrade) per AR-22 (periphery internet) resilience guidance.
async function getHomepageSubjects(): Promise<MarketplaceSubject[]> {
  try {
    return await getActiveSubjects();
  } catch (err) {
    console.error("[homepage] active subject lookup failed; rendering empty taxonomy", err);
    return [];
  }
}

export default async function Home() {
  const subjects = await getHomepageSubjects();

  return (
    <AppShell activeHref="/">
      <HeroSection />
      <HeadlineFourSubjects subjects={subjects} />
      <SubjectTaxonomyGrid subjects={subjects} />
      {/* Story 3.5 will insert <FeaturedTutors /> here */}
    </AppShell>
  );
}
