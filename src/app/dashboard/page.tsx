import { AppShell } from "@/components/layout/AppShell";
import { signOut } from "@/lib/auth/auth";
import { requireAuth } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";

  await signOut({ redirectTo: "/signin" });
}

export default async function DashboardPage() {
  const user = await requireAuth("/dashboard");
  const displayName = user.name ?? user.email ?? "TeachMe";

  return (
    <AppShell
      activeHref="/dashboard"
      headerAction={
        <form action={signOutAction}>
          <button
            className="h-10 rounded-lg border border-linen-border bg-surface-lowest px-4 text-sm font-bold text-on-surface shadow-sm transition hover:border-primary-fixed-dim hover:text-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container"
            type="submit"
          >
            יציאה
          </button>
        </form>
      }
      mainClassName="flex flex-1 px-6 py-16"
    >
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="space-y-3 text-start">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            לוח הבקרה
          </h1>
          <p className="text-base leading-7 text-on-surface-variant">{displayName}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-linen-border bg-surface-lowest p-5 text-start">
            <p className="text-sm text-on-surface-variant">השיעור הבא</p>
            <h2 className="mt-2 font-display text-xl font-bold text-primary-container">
              מוכן לסיפורי הדשבורד
            </h2>
          </div>
          <div className="rounded-xl border border-linen-border bg-surface-lowest p-5 text-start">
            <p className="text-sm text-on-surface-variant">מעטפת</p>
            <h2 className="mt-2 font-display text-xl font-bold text-primary-container">
              RTL מלא
            </h2>
          </div>
          <div className="rounded-xl border border-linen-border bg-surface-lowest p-5 text-start">
            <p className="text-sm text-on-surface-variant">חשבון</p>
            <h2 className="mt-2 font-display text-xl font-bold text-primary-container">
              מחובר
            </h2>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
