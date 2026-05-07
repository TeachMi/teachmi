import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
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
    <AppShell
      activeHref="/signin"
      headerAction={
        <Link
          className="text-sm font-bold text-on-surface-variant transition hover:text-primary-container"
          href="/"
        >
          חזרה לבית
        </Link>
      }
      mainClassName="flex flex-1 items-center justify-center px-6 py-16"
    >
      <section className="w-full max-w-sm space-y-8 text-start">
        <div className="space-y-3">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            כניסה לחשבון
          </h1>
          <p className="text-sm leading-7 text-on-surface-variant">
            היכנסו כדי לחזור לשיעורים, להזמנות ולדשבורד האישי.
          </p>
        </div>
        <form action={signInWithGoogle}>
          <input name="callbackUrl" type="hidden" value={callbackUrl} />
          <button
            className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-linen-border bg-surface-lowest px-4 text-base font-bold text-on-surface shadow-sm transition hover:border-primary-fixed-dim hover:text-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container"
            type="submit"
          >
            <span aria-hidden="true" className="text-lg">
              G
            </span>
            <span>כניסה עם Google</span>
          </button>
        </form>
      </section>
    </AppShell>
  );
}
