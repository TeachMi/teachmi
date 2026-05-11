import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { auth, signIn } from "@/lib/auth/auth";
import { defaultPostSignInPath, getSafeCallbackUrl } from "@/lib/auth/callback-url";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "כניסה · TeachMe",
  description: "כניסה לחשבון ב-TeachMe.",
};

interface SignInPageProps {
  searchParams?: Promise<{
    callbackUrl?: string | string[];
    verified?: string | string[];
  }>;
}

async function tryReadSession() {
  // `auth()` lazily initializes the DrizzleAdapter, which calls `getDb()` —
  // that throws when DATABASE_URL is unset (e.g., CI E2E runner). The
  // already-signed-in redirect is a UX convenience, not a security boundary,
  // so degrade to "no session" rather than crashing the whole page.
  // Same precedent as src/app/signup/page.tsx (commit 912124e).
  try {
    return await auth();
  } catch {
    return null;
  }
}

async function signInWithGoogle(formData: FormData) {
  "use server";

  const redirectTo = getSafeCallbackUrl(formData.get("callbackUrl"));
  await signIn("google", { redirectTo });
}

function readFirstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeCallbackUrl(params?.callbackUrl, defaultPostSignInPath);
  const verified = readFirstString(params?.verified) === "1";

  const session = await tryReadSession();

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
      <section className="w-full max-w-sm space-y-6 text-start">
        <div className="space-y-3">
          <p className="text-sm font-bold text-primary-container">TeachMe</p>
          <h1 className="font-display text-3xl font-extrabold text-primary-container">
            כניסה לחשבון
          </h1>
          <p className="text-sm leading-7 text-on-surface-variant">
            היכנסו כדי לחזור לשיעורים, להזמנות ולדשבורד האישי.
          </p>
        </div>

        {verified && (
          <div
            className="rounded-lg border border-primary-container/40 bg-primary-fixed/30 px-4 py-3 text-sm font-bold text-primary-container"
          >
            האימייל אומת בהצלחה — היכנסו לחשבון שלכם
          </div>
        )}

        <form action={signInWithGoogle}>
          <input name="callbackUrl" type="hidden" value={callbackUrl} />
          <Button
            type="submit"
            variant="outline"
            size="lg"
            fullWidth
            iconLeading={
              <span aria-hidden="true" className="text-lg">
                G
              </span>
            }
          >
            כניסה עם Google
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-linen-border" />
          <span className="text-xs text-on-surface-variant">או</span>
          <div className="h-px flex-1 bg-linen-border" />
        </div>

        <SignInForm callbackUrl={callbackUrl} />

        <p className="text-center text-sm text-on-surface-variant">
          אין לכם חשבון?{" "}
          <Link
            className="font-bold text-primary-container hover:underline"
            href="/signup"
          >
            הרשמה
          </Link>
        </p>
      </section>
    </AppShell>
  );
}
