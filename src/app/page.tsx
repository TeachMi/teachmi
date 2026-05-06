export default function Home() {
  return (
    <div className="flex flex-1 bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-16 sm:px-10">
        <p className="text-sm font-semibold text-emerald-800">TeachMe</p>
        <section className="max-w-2xl space-y-5">
          <h1 className="text-4xl font-semibold leading-tight text-emerald-950 sm:text-5xl">
            בסיס האפליקציה מוכן לפיתוח
          </h1>
          <p className="text-lg leading-8 text-zinc-700">
            שלד Next.js פעיל עבור TeachMe. מסכי המוצר, מעטפת ה-RTL ומערכת העיצוב
            ייכנסו בסיפורי הבסיס הבאים.
          </p>
        </section>
      </main>
    </div>
  );
}
