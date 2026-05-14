import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import {
  listActiveMarketplaceSubjects,
  type MarketplaceSubject,
} from "@/lib/db/queries/subject-queries";

export const metadata: Metadata = {
  title: "TeachMe - מצאו מורה פרטי בעברית",
  description:
    "חיפוש מורים פרטיים מאומתים בישראל לפי מקצוע, בעברית ובחוויית RTL מלאה.",
};

// Story 3.6 will add taxonomy admin invalidation. Until cache tags exist for
// subjects, keep the homepage dynamic so hidden/reordered subjects update from DB.
export const dynamic = "force-dynamic";

const HEADLINE_SUBJECT_SLUGS = [
  "mathematics",
  "english",
  "hebrew-lashon",
  "psychometric",
] as const;

async function getHomepageSubjects(): Promise<MarketplaceSubject[]> {
  try {
    return await listActiveMarketplaceSubjects();
  } catch (err) {
    console.error("[homepage] active subject lookup failed", err);
    return [];
  }
}

function browseHref(subject: MarketplaceSubject): string {
  return `/browse?subject=${encodeURIComponent(subject.slug)}`;
}

export default async function Home() {
  const subjects = await getHomepageSubjects();
  const bySlug = new Map(subjects.map((subject) => [subject.slug, subject]));
  const headlineSubjects = HEADLINE_SUBJECT_SLUGS.map((slug) => bySlug.get(slug)).filter(
    (subject): subject is MarketplaceSubject => Boolean(subject),
  );

  return (
    <AppShell activeHref="/" mainClassName="flex-1 bg-linen">
      <section className="bg-primary-container text-on-primary">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-6 py-12 lg:grid-cols-5 lg:items-center lg:py-16">
          <div className="space-y-7 text-start lg:col-span-3">
            <div className="space-y-5">
              <p className="text-sm font-bold text-on-primary-container">TeachMe</p>
              <h1 className="max-w-3xl font-display text-5xl font-extrabold leading-tight tracking-normal lg:text-6xl">
                המורה הנכון.
                <br />
                תוך דקות.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-on-primary-container">
                הכנה לבגרות ולפסיכומטרי עם מורים ישראלים מאומתים, זמינות
                ברורה וחוויית למידה בעברית מהרגע הראשון.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="accent" size="lg">
                <Link href="/browse">חפשו מורה</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/tutor/onboarding/profile">הצטרפו כמורה</Link>
              </Button>
            </div>
          </div>

          <aside className="rounded-2xl border border-on-primary/15 bg-on-primary/10 p-5 text-start shadow-2xl lg:col-span-2">
            <p className="text-sm text-on-primary-container">המקצועות הפופולריים</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {headlineSubjects.map((subject) => (
                <Link
                  key={subject.slug}
                  href={browseHref(subject)}
                  className="group rounded-xl border border-on-primary/15 bg-on-primary/10 p-4 text-start transition-colors hover:border-tertiary-fixed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-fixed"
                >
                  <SubjectMark slug={subject.slug} variant="hero" />
                  <span className="mt-3 block font-display text-xl font-bold text-on-primary">
                    {subject.displayNameHe}
                  </span>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="border-b border-linen-border bg-linen">
        <div className="mx-auto flex max-w-7xl flex-row-reverse flex-wrap items-center justify-center gap-x-12 gap-y-3 px-6 py-4">
          <TrustItem label="מורים מאומתים ידנית" />
          <TrustDivider />
          <TrustItem label="תשלום מאובטח בהמשך הדרך" />
          <TrustDivider />
          <TrustItem label="מסלול חוקי ושקוף" />
        </div>
      </section>

      <section className="bg-linen">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="mb-8 text-start">
            <h2 className="font-display text-3xl font-extrabold text-primary-container">
              כל המקצועות
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-on-surface-variant">
              בחרו מקצוע כדי לפתוח את עמוד החיפוש עם הסינון המתאים.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {subjects.map((subject) => (
              <Link
                key={subject.slug}
                href={browseHref(subject)}
                className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container"
              >
                <Card
                  padding="sm"
                  radius="lg"
                  interactive
                  className="h-full"
                  aria-label={`חיפוש מורים עבור ${subject.displayNameHe}`}
                >
                  <CardBody className="flex items-center justify-between gap-3 text-start">
                    <span className="font-bold text-on-surface">
                      {subject.displayNameHe}
                    </span>
                    <SubjectMark slug={subject.slug} variant="grid" />
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-surface-lowest">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-10 md:grid-cols-3">
          <Card padding="sm">
            <CardTitle className="text-lg">לומדים בעברית</CardTitle>
            <CardBody className="mt-2 leading-7 text-on-surface-variant">
              כל החוויה בנויה לשפה, לקצב ולציפיות של תלמידים והורים בישראל.
            </CardBody>
          </Card>
          <Card padding="sm">
            <CardTitle className="text-lg">מורים מאומתים</CardTitle>
            <CardBody className="mt-2 leading-7 text-on-surface-variant">
              פרופילים ציבוריים נפתחים רק אחרי בדיקה ידנית של צוות TeachMe.
            </CardBody>
          </Card>
          <Card padding="sm">
            <CardTitle className="text-lg">שיעור בלי בלגן</CardTitle>
            <CardBody className="mt-2 leading-7 text-on-surface-variant">
              חיפוש, בחירת מורה והמשך להזמנה מתחילים ממקום אחד ברור.
            </CardBody>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}

function SubjectMark({
  slug,
  variant,
}: {
  slug: string;
  variant: "hero" | "grid";
}) {
  const hue = Math.abs([...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 360;
  const size = variant === "hero" ? "h-9 w-9" : "h-4 w-4";

  return (
    <span
      className={`${size} inline-block rounded-full border border-on-primary/20`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 78%), hsl(${(hue + 42) % 360} 72% 68%))`,
      }}
      aria-hidden="true"
    />
  );
}

function TrustItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
      <span className="h-2.5 w-2.5 rounded-full bg-primary-container" aria-hidden="true" />
      <span className="font-bold">{label}</span>
    </div>
  );
}

function TrustDivider() {
  return <div className="hidden h-5 w-px bg-linen-border md:block" />;
}
