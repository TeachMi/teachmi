import Link from "next/link";
import { Button } from "@/components/ui/button";

// Marketplace homepage tutor-recruiting band from `landing-v2.html`. New
// section (no Story 3.1 equivalent); copy is a placeholder pending the
// founder's copy pass. The heading is the locked mission line (CLAUDE.md).
// The CTA points at `/signup`, where the role picker offers the tutor
// path. RSC; zero client JS.

export function TutorRecruitingBand() {
  return (
    <section className="bg-primary-container text-on-primary">
      <div className="mx-auto max-w-5xl px-6 py-14 text-start">
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="mb-2 font-display text-2xl font-extrabold md:text-3xl">
              הופכים את ההוראה למקצוע נגיש לכולם.
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-on-primary-container">
              אשף הצטרפות של 30 דקות מסדיר עבורכם את הכל — פתיחת עוסק זעיר, מס
              וביטוח לאומי. אתם מלמדים, אנחנו מטפלים בנייר.
            </p>
          </div>

          <Button asChild variant="accent" size="lg">
            <Link href="/signup">הצטרפו כמורה</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
