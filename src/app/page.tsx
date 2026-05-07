import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { formatHebrewWeekday, formatIlsCurrency } from "@/lib/hebrew/format";

export default function Home() {
  const examplePrice = formatIlsCurrency(180);
  const nextLessonDay = formatHebrewWeekday("2026-05-03T12:00:00Z");

  return (
    <AppShell activeHref="/">
      <section className="bg-primary-container text-on-primary">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-6 py-20 lg:grid-cols-5 lg:items-center lg:py-28">
          <div className="space-y-8 text-start lg:col-span-3">
            <div className="space-y-5">
              <p className="text-sm font-bold text-on-primary-container">TeachMe</p>
              <h1 className="max-w-3xl font-display text-5xl font-extrabold leading-tight tracking-normal lg:text-6xl">
                המורה הנכון. תוך דקות.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-on-primary-container">
                שיעורים פרטיים אונליין עם מורים ישראלים מסודרים, זמינות ברורה,
                וחוויית למידה בעברית מהרגע הראשון.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center rounded-xl bg-tertiary-fixed px-6 text-sm font-bold text-on-tertiary-fixed shadow-lg transition hover:bg-tertiary-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-fixed"
                href="/browse"
              >
                חפשו מורה
              </Link>
              <Link
                className="inline-flex h-12 items-center justify-center rounded-xl border border-on-primary/25 px-6 text-sm font-bold text-on-primary transition hover:border-tertiary-fixed hover:text-tertiary-fixed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-fixed"
                href="/signin"
              >
                כניסה לחשבון
              </Link>
            </div>
          </div>

          <aside className="rounded-2xl border border-on-primary/15 bg-on-primary/10 p-6 text-start shadow-2xl lg:col-span-2">
            <p className="text-sm text-on-primary-container">מורה מומלץ</p>
            <h2 className="mt-3 font-display text-2xl font-bold">מתמטיקה - 5 יחידות</h2>
            <dl className="mt-6 grid grid-cols-1 gap-4 text-sm">
              <div className="rounded-xl bg-on-primary/10 p-4">
                <dt className="text-on-primary-container">מחיר שיעור</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-tertiary-fixed">
                  {examplePrice}
                </dd>
              </div>
              <div className="rounded-xl bg-on-primary/10 p-4">
                <dt className="text-on-primary-container">יום זמין קרוב</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-tertiary-fixed">
                  {nextLessonDay}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="bg-linen">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-10 md:grid-cols-3">
          <div className="rounded-xl border border-linen-border bg-surface-lowest p-5 text-start">
            <h2 className="font-display text-lg font-bold text-primary-container">
              לומדים בעברית
            </h2>
            <p className="mt-2 text-sm leading-7 text-on-surface-variant">
              כל החוויה בנויה לשפה, לקצב ולציפיות של תלמידים והורים בישראל.
            </p>
          </div>
          <div className="rounded-xl border border-linen-border bg-surface-lowest p-5 text-start">
            <h2 className="font-display text-lg font-bold text-primary-container">
              מורים מסודרים
            </h2>
            <p className="mt-2 text-sm leading-7 text-on-surface-variant">
              המטרה היא לחבר אתכם למורים שפועלים בצורה שקופה, חוקית וברורה.
            </p>
          </div>
          <div className="rounded-xl border border-linen-border bg-surface-lowest p-5 text-start">
            <h2 className="font-display text-lg font-bold text-primary-container">
              שיעור בלי בלגן
            </h2>
            <p className="mt-2 text-sm leading-7 text-on-surface-variant">
              חיפוש, כניסה לחשבון וניהול שיעורים מתחילים ממקום אחד ברור.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
