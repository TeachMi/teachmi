import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody } from "@/components/ui/card";
import { auth } from "@/lib/auth/auth";
import { track } from "@/lib/analytics";
import {
  decomposeNextToGateParams,
  parseGateParams,
  type GateParams,
} from "@/lib/booking/urls";
import { getDiscoverableTutorByUserId } from "@/lib/db/queries/tutor-queries";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "הרשמה · TeachMe",
  description: "פתיחת חשבון ב-TeachMe — חיפוש מורים מומחים או הצטרפות כמורה.",
};

interface SignupPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

async function tryReadSession() {
  // `auth()` lazily initializes the DrizzleAdapter, which calls `getDb()` —
  // that throws when DATABASE_URL is unset (e.g., CI E2E runner). The
  // already-signed-in redirect is a UX convenience, not a security boundary,
  // so degrade to "no session" rather than crashing the whole page.
  try {
    return await auth();
  } catch {
    return null;
  }
}

/**
 * Story 3.3 — resolve the booking-funnel intent target.
 *
 * Tries the two emission shapes in order:
 *   1. Multi-param: `?intent=book&tutorUserId=...&slotIso=...&duration=...&sig=...`
 *      (the canonical shape emitted by the tutor-profile calendar in 3.2).
 *   2. Single-param: `?callbackUrl=/booking-stub?tutor=...&slot=...&duration=...&sig=...`
 *      (cross-page navigation from /signin → /signup via the "הרשמה" link).
 *
 * On any validation failure, fires `signup_intent_book_tampered` with the
 * specific reason so the security dashboard can spot probing. Returns null
 * when no intent is present at all (plain signup landing).
 */
function resolveGateIntent(
  params: Record<string, string | string[] | undefined>,
): GateParams | null {
  const { payload, reason } = parseGateParams(params);
  if (payload) return payload;

  if (reason && reason !== "missing_intent") {
    // `intent=book` was present but validation failed — emit the security
    // signal. `missing_intent` is the no-intent default; not a tampering.
    track({
      event: "signup_intent_book_tampered",
      reason,
      source: "signup",
    });
  }

  // Second chance: a single `?callbackUrl=` pointing at /booking-stub.
  const callbackUrl = firstString(params.callbackUrl);
  if (!callbackUrl) return null;
  return decomposeNextToGateParams(callbackUrl);
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = (await searchParams) ?? {};

  const gate = resolveGateIntent(params);

  // Tutor lookup for the banner. Wrapped in try/catch so a Neon outage
  // doesn't break the whole page — same precedent as `tryReadSession`.
  let tutorDisplayName: string | null = null;
  if (gate) {
    try {
      const tutor = await getDiscoverableTutorByUserId(gate.tutorUserId);
      if (tutor) {
        tutorDisplayName = tutor.displayName;
      } else {
        // Sig was valid but tutor isn't discoverable (deactivated mid-funnel
        // via Story 2.5 re-approval, soft-deleted, etc.). Drop intent — we
        // can't confidently route to a /booking-stub for a tutor that has
        // gone away.
        track({
          event: "signup_intent_book_tutor_not_found",
          tutorUserId: gate.tutorUserId,
          source: "signup",
        });
      }
    } catch (err) {
      console.error("[signup] tutor lookup failed", err);
      // Treat lookup failure as "no banner" — keep the user moving through
      // signup; the URL they came in on still has the intent params so a
      // retry from the /tutor/[slug] page would work.
    }
  }

  const next = gate && tutorDisplayName ? gate.next : "";

  // Banner is only shown when validation passed AND tutor was found. Fire
  // the landed event symmetrically.
  if (gate && tutorDisplayName) {
    track({
      event: "signup_intent_book_landed",
      tutorUserId: gate.tutorUserId,
    });
  }

  const session = await tryReadSession();
  if (session?.user) {
    // Story 3.3: already-signed-in users with valid intent skip signup and
    // land directly on the booking-stub.
    redirect(next || "/dashboard");
  }

  return (
    <AppShell activeHref="/signin" mainClassName="flex-1 bg-linen">
      <div className="mx-auto w-full max-w-3xl px-6 pt-12">
        {tutorDisplayName && <IntentBanner tutorDisplayName={tutorDisplayName} />}
      </div>
      <SignupForm next={next || undefined} />
    </AppShell>
  );
}

function IntentBanner({ tutorDisplayName }: { tutorDisplayName: string }) {
  return (
    <Card
      tone="highlighted"
      padding="md"
      className="mx-auto mb-6 w-full max-w-md text-start"
    >
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
              הרשמה תחזיר אתכם לבחירת השעה — השלימו הרשמה ואימות אימייל, ונחזיר
              אתכם לסיכום ההזמנה.
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
