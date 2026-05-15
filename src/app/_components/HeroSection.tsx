import Link from "next/link";
import { Button } from "@/components/ui/button";

// Marketplace homepage hero band. Mirrors `mocks/landing.html` lines 88–164
// (right column only — text + CTA). Out of scope for Story 3.1:
//   - Left-column hero-card tutor stack (mock lines 167–202) — needs Story
//     3.5's featured-tutors data source. The 2-column slot is RESERVED via
//     the grid (`lg:col-span-2` empty cell) so 3.5 can drop in without a
//     layout change.
//   - Search-filter cluster (mock lines 102–163) — same filter UI Story 3.4
//     will build on `/browse`; duplicating here is a follow-up design call.
//
// RSC by default; zero client JS. `<Link>` from `next/link` is RSC-compatible.
//
// Grid: matches mock — `lg:grid-cols-5` with text in `lg:col-span-3`. In RTL
// flow, `col-span-3` sits in the right 3/5 of the viewport on `lg:`; mobile
// collapses to single-column. The 2/5 left gap stays empty for Story 3.5.
//
// Alignment: `text-start` (logical) → in RTL maps to `text-align: right`, so
// the headline hugs the right edge of its column. The earlier `text-end` was
// wrong — in RTL writing mode `end` is to the LEFT, which made the text drift
// toward the column's inner edge instead of toward the viewport-right. Per
// AR-21 we prefer logical properties (`start`/`end`) over physical
// (`left`/`right`); the mock used physical `text-right`, but `text-start` is
// the equivalent logical alias that always means "leading edge."
//
// Background layering (back to front):
//   1. `bg-primary-container` — solid TeachMe green base.
//   2. `bg-primary-container/40 mix-blend-multiply` overlay — soft tonal
//      shift the way the mock does, but kept lighter (40% vs mock's 50%)
//      so the texture below stays visible after the blend.
//   3. `.linen-texture` overlay layer (on top, NOT a section background) —
//      the SVG fabric grain composites over the multiply tone for legible
//      "woven" texture on the dark hero.
//   All overlays are `pointer-events-none aria-hidden` decoration.
export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-primary-container text-on-primary">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-primary-container/40 mix-blend-multiply"
      />
      <div
        aria-hidden="true"
        className="linen-texture pointer-events-none absolute inset-0 opacity-70 mix-blend-screen"
      />
      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 text-start lg:grid-cols-5 lg:py-28">
        <div className="space-y-8 lg:col-span-3">
          <div className="space-y-5">
            <h1 className="font-display text-5xl font-extrabold leading-tight tracking-normal lg:text-6xl">
              המורה הנכון.
              <br />
              תוך דקות.
            </h1>
            {/* Sub-copy speaks to the parent persona (mid-30s–mid-50s,
                Bagrut shopper — see product-brief-distillate.md §Personas).
                Three beats: trust signal (מורים מובילים), transparency
                jab at WhatsApp via the "real availability" framing
                (זמינות אמיתית), and frictionless commit (בלחיצה).
                Earlier copy mentioned "מורים חוקיים, חשבונית מס" — that's
                the investor-facing legalization wedge per the brief; the
                parent doesn't filter on tax compliance. Removed here per
                founder direction 2026-05-15. */}
            <p className="text-lg leading-8 text-on-primary-container">
              מורים מובילים. ראו זמינות אמיתית, הזמינו בלחיצה.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="accent" size="lg">
              <Link href="/browse">בחרו מורה</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
