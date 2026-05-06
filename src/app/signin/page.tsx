import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth/auth";
import { defaultPostSignInPath, getSafeCallbackUrl } from "@/lib/auth/callback-url";

export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams?: Promise<{
    callbackUrl?: string | string[];
  }>;
}

async function signInWithGoogle(formData: FormData) {
  "use server";

  const redirectTo = getSafeCallbackUrl(formData.get("callbackUrl"));
  await signIn("google", { redirectTo });
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeCallbackUrl(params?.callbackUrl, defaultPostSignInPath);
  const session = await auth();

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
      <section className="w-full max-w-sm space-y-8 text-right">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-emerald-800">TeachMi</p>
          <h1 className="text-3xl font-semibold text-emerald-950">כניסה לחשבון</h1>
        </div>
        <form action={signInWithGoogle}>
          <input name="callbackUrl" type="hidden" value={callbackUrl} />
          <button
            className="flex h-12 w-full items-center justify-center gap-3 rounded-md border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 shadow-sm transition hover:border-emerald-700 hover:text-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            type="submit"
          >
            <span aria-hidden="true" className="text-lg">
              G
            </span>
            <span>כניסה עם Google</span>
          </button>
        </form>
      </section>
    </main>
  );
}
