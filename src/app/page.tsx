import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import {
  getActiveSubjects,
  type MarketplaceSubject,
} from "@/lib/db/queries/subject-queries";
import { getFeaturedTutors } from "@/lib/db/queries/browse-queries";
import { getFilesProvider, isStubUrl } from "@/lib/providers/files";
import { buildIndexableRobotsDirective } from "@/lib/seo/robots";
import { HeroSection } from "./_components/HeroSection";
import { SubjectGrid } from "./_components/SubjectGrid";
import { HowItWorks } from "./_components/HowItWorks";
import {
  FeaturedTutors,
  type FeaturedTutorEntry,
} from "./_components/FeaturedTutors";
import { TrustStrip } from "./_components/TrustStrip";
import { HomeFaq } from "./_components/HomeFaq";
import { TutorRecruitingBand } from "./_components/TutorRecruitingBand";

// Marketplace homepage. Rebuilt to the `mocks/landing-v2.html` structure
// (founder direction 2026-05-20): hero + subject search, subject grid,
// how-it-works, featured tutors, trust strip, FAQ, tutor-recruiting band.
// Existing Story 3.1 copy is kept — the v2 mock's wording is not adopted.
//
// **Caching:** `getActiveSubjects()` wraps its query in `unstable_cache`
// tagged `"subjects"`; Story 3.6's admin taxonomy editor must
// `revalidateTag("subjects")` after each mutation. The featured-tutor
// query is per-request (small, 3 rows).
//
// **`dynamic = "force-dynamic"`** — required because static prerendering
// at build time would open a Drizzle connection without `DATABASE_URL`
// set, breaking `next build`. Do NOT remove it to "optimize": the
// cross-request caching this page wants comes from `unstable_cache` inside
// `getActiveSubjects`, and per-request rendering is cheap. The page does
// NOT call `auth()` — every section renders identically for signed-in and
// anonymous visitors. The only client island is `<HeroSearch>` inside the
// hero.
export const dynamic = "force-dynamic";

const TITLE = "TeachMe — מורים פרטיים בעברית";
const DESCRIPTION =
  "פלטפורמת מורים פרטיים אונליין לתלמידי בגרות ופסיכומטרי. מורים מסודרים, חשבונית מס, ובלי וואטסאפ.";

const FEATURED_TUTOR_LIMIT = 3;
const FEATURED_PHOTO_TTL_SEC = 3600; // 1 hour

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

// Wrap the subjects query so a missing `DATABASE_URL` (CI playwright
// webServer, preview-without-DB) or a Neon outage degrades to an empty
// taxonomy instead of 500-ing the homepage. The hero search renders with
// an empty subject list; `SubjectGrid` renders its empty-state copy.
async function getHomepageSubjects(): Promise<MarketplaceSubject[]> {
  try {
    return await getActiveSubjects();
  } catch (err) {
    console.error(
      "[homepage] active subject lookup failed; rendering empty taxonomy",
      err,
    );
    return [];
  }
}

// Featured tutors for the "מורים מובילים" band. Degrade-don't-crash, same
// posture as the subjects query: ANY failure drops the band rather than
// 500-ing the page. The whole body is inside one try/catch so a throw from
// the query, `getFilesProvider()`, or `Promise.all` is all caught; the
// inner per-photo try/catch additionally keeps one unreachable photo from
// taking down its siblings. `FeaturedTutors` renders nothing for [].
async function getHomepageFeaturedTutors(): Promise<FeaturedTutorEntry[]> {
  try {
    const tutors = await getFeaturedTutors(FEATURED_TUTOR_LIMIT);
    const files = getFilesProvider();
    return await Promise.all(
      tutors.map(async (tutor) => {
        let profilePhotoUrl: string | null = null;
        if (tutor.profilePhotoR2Key) {
          try {
            const url = await files.generatePresignedGetUrl({
              bucket: "tutor-profile-photos",
              key: tutor.profilePhotoR2Key,
              expiresInSec: FEATURED_PHOTO_TTL_SEC,
            });
            profilePhotoUrl = isStubUrl(url) ? null : url;
          } catch (err) {
            console.error(
              "[homepage] featured tutor photo presign failed",
              err,
            );
          }
        }
        return { tutor, profilePhotoUrl };
      }),
    );
  } catch (err) {
    console.error(
      "[homepage] featured tutor band failed to resolve; omitting it",
      err,
    );
    return [];
  }
}

export default async function Home() {
  const [subjects, featuredTutors] = await Promise.all([
    getHomepageSubjects(),
    getHomepageFeaturedTutors(),
  ]);

  return (
    <AppShell activeHref="/">
      <HeroSection subjects={subjects} />
      <SubjectGrid subjects={subjects} />
      <HowItWorks />
      <FeaturedTutors tutors={featuredTutors} />
      <TrustStrip />
      <HomeFaq />
      <TutorRecruitingBand />
    </AppShell>
  );
}
