import { signOut } from "@/lib/auth/auth";
import { requireAuth } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";

  await signOut({ redirectTo: "/signin" });
}

export default async function DashboardPage() {
  const user = await requireAuth("/dashboard");
  const displayName = user.name ?? user.email ?? "TeachMi";

  return (
    <main className="flex min-h-screen flex-1 bg-background px-6 py-16 text-foreground">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3 text-right">
            <p className="text-sm font-semibold text-emerald-800">TeachMi</p>
            <h1 className="text-3xl font-semibold text-emerald-950">לוח הבקרה</h1>
            <p className="text-base leading-7 text-zinc-700">{displayName}</p>
          </div>
          <form action={signOutAction}>
            <button
              className="h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-emerald-700 hover:text-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              type="submit"
            >
              יציאה
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
