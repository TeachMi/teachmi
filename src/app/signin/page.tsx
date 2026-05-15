import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { auth, signIn } from "@/lib/auth/auth";
import { defaultPostSignInPath, getSafeCallbackUrl } from "@/lib/auth/callback-url";
import { track } from "@/lib/analytics";
import {
  decomposeNextToGateParams,
  parseGateParams,
  type GateParams,
} from "@/lib/booking/urls";
import { getDiscoverableTutorByUserId } from "@/lib/db/queries/tutor-queries";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "כניסה · TeachMe",
  description: "כניסה לחשבון ב-TeachMe.",
};

interface SignInPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

async function tryReadSession() {
  // `auth()` lazily initializes the DrizzleAdapter, which calls `getDb()` —
  // that throws when DATABASE_URL is unset (e.g., CI E2E runner). The
  // already-signed-in redirect is a UX convenience, not a security boundary,
  // so degrade to "no session" rather than crashing the whole page.
  // Same precedent as src/app/signup/page.tsx (commit 912124e).
  // We DO log the error: a transient Neon outage shouldn't be invisible.
  try {
    return await auth();
  } catch (err) {
    console.error("[signin/page] auth() failed; rendering as signed-out", err);
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

/**
 * Story 3.3 — resolve the booking-funnel intent target for the /signin page.
 *
 * Tries the same two emission shapes /signup accepts:
 *   1. Multi-param `?intent=book&tutorUserId=...&slotIso=...&duration=...&sig=...`
 *   2. Single-param `?callbackUrl=/booking-stub?tutor=...&slot=...&duration=...&sig=...`
 *      (this is what /signup's "התחברות" cross-link emits per AC7).
 *
 * Fires `signup_intent_book_tampered` with `source: "signin"` on validation
 * failure for security analytics.
 */
function resolveGateIntent(
  params: Record<string, string | string[] | undefined>,
): GateParams | null {
  const { payload, reason } = parseGateParams(params);
  if (payload) return payload;

  if (reason && reason !== "missing_intent") {
    track({
      event: "signup_intent_book_tampered",
      reason,
      source: "signin",
    });
  }

  const callbackUrl = readFirstString(params.callbackUrl);
  if (!callbackUrl) return null;
  return decomposeNextToGateParams(callbackUrl);
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = (await searchParams) ?? {};
  const gate = resolveGateIntent(params);

  // Story 3.3: when intent is valid + tutor discoverable, the gate's
  // booking-stub URL OVERRIDES any explicit `?callbackUrl=` query param.
  let tutorDisplayName: string | null = null;
  if (gate) {
    try {
      const tutor = await getDiscoverableTutorByUserId(gate.tutorUserId);
      if (tutor) {
        tutorDisplayName = tutor.displayName;
      } else {
        track({
          event: "signup_intent_book_tutor_not_found",
          tutorUserId: gate.tutorUserId,
          source: "signin",
        });
      }
    } catch (err) {
      console.error("[signin] tutor lookup failed", err);
    }
  }

  const effectiveCallbackUrl =
    gate && tutorDisplayName
      ? gate.next
      : getSafeCallbackUrl(params.callbackUrl, defaultPostSignInPath);
  const verified = readFirstString(params.verified) === "1";
  const reset = readFirstString(params.reset) === "1";

  if (gate && tutorDisplayName) {
    track({
      event: "signin_intent_book_landed",
      tutorUserId: gate.tutorUserId,
    });
  }

  const session = await tryReadSession();

  if (session?.user) {
    redirect(effectiveCallbackUrl);
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

        {tutorDisplayName && <IntentBanner tutorDisplayName={tutorDisplayName} />}

        {verified && (
          <div
            className="rounded-lg border border-primary-container/40 bg-primary-fixed/30 px-4 py-3 text-sm font-bold text-primary-container"
          >
            האימייל אומת בהצלחה — היכנסו לחשבון שלכם
          </div>
        )}

        {reset && (
          <div
            className="rounded-lg border border-primary-container/40 bg-primary-fixed/30 px-4 py-3 text-sm font-bold text-primary-container"
            role="status"
          >
            הסיסמה אופסה בהצלחה. היכנסו עם הסיסמה החדשה.
          </div>
        )}

        <form action={signInWithGoogle}>
          <input name="callbackUrl" type="hidden" value={effectiveCallbackUrl} />
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

        <SignInForm callbackUrl={effectiveCallbackUrl} />

        <p className="text-center text-sm text-on-surface-variant">
          אין לכם חשבון?{" "}
          <Link
            className="font-bold text-primary-container hover:underline"
            href={
              // Story 3.3: preserve booking intent across the cross-link.
              // `/signup` page-level handler calls decomposeNextToGateParams
              // on its callbackUrl param to reconstruct the gate payload.
              gate && tutorDisplayName
                ? `/signup?callbackUrl=${encodeURIComponent(gate.next)}`
                : "/signup"
            }
          >
            הרשמה
          </Link>
        </p>
      </section>
    </AppShell>
  );
}

function IntentBanner({ tutorDisplayName }: { tutorDisplayName: string }) {
  return (
    <Card tone="highlighted" padding="md" className="text-start">
      <CardBody>
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-primary-container"
          >
            info
          </span>
          <div className="flex-1 space-y-1">
            <p className="font-display text-base font-bold text-primary-container">
              {`צפיתם במורה ${tutorDisplayName}`}
            </p>
            <p className="text-sm leading-6 text-on-surface-variant">
              התחברו וחזרו לבחירת השעה — נחזיר אתכם לסיכום ההזמנה.
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
