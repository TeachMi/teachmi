import type { MarketplaceSubject } from "@/lib/db/queries/subject-queries";
import { HeroSearch } from "./HeroSearch";

// Marketplace homepage hero band. Restructured to the `landing-v2.html`
// layout (founder direction 2026-05-20): a plain solid-green background
// (the earlier linen-texture + multiply overlays are dropped) with the
// headline copy above an inline subject + lesson-length search cluster.
//
// Copy is the EXISTING Story 3.1 hero copy — the v2 mock's wording is not
// adopted (founder direction). The lone "בחרו מורה" button is replaced by
// the `<HeroSearch>` cluster, which is the only interactive (client) island
// on the page.
interface HeroSectionProps {
  subjects: MarketplaceSubject[];
}

export function HeroSection({ subjects }: HeroSectionProps) {
  return (
    <section className="bg-primary-container text-on-primary">
      <div className="mx-auto w-full max-w-7xl px-6 py-20 text-start lg:py-28">
        <div className="max-w-3xl space-y-8">
          <div className="space-y-5">
            <h1 className="font-display text-5xl font-extrabold leading-tight tracking-normal lg:text-6xl">
              המורה הנכון.
              <br />
              תוך דקות.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-on-primary-container">
              חפשו מורה. בחרו זמן. הזמינו בקליק.
            </p>
          </div>

          <div className="max-w-lg">
            <HeroSearch subjects={subjects} />
          </div>
        </div>
      </div>
    </section>
  );
}
