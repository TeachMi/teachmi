// /checkout?tutor=<uuid>&slot=<iso>&duration=<45|60|75|90>&sig=<hmac>
//
// Story 4.3 (2026-05-18). The post-modal checkout surface. Mirrors
// `mocks/checkout.html` — 3 form sections on the right (student details,
// billing address, payment-method info card), sticky tutor+lesson summary
// on the left.
//
// Auth: requires a signed-in user. Anonymous visitors who arrived via the
// public booking modal's gate URL are first walked through /signup +
// email verify (Story 3.3); after verification they're redirected here
// directly (the gate URL embedded /checkout as its callbackUrl).
//
// Sig validation: the page calls `parseGateParams` against the searchParams
// to verify the HMAC sig. A tampered URL renders a recovery panel instead
// of the form — same security posture as /signup's intent=book parser.

import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { auth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";
import { getDiscoverableTutorByUserId } from "@/lib/db/queries/tutor-queries";
import { getFilesProvider } from "@/lib/providers/files";
import { parseGateParams } from "@/lib/booking/urls";
import {
  getBillingAddressForUser,
  MOCK_BILLING_ADDRESS_DEFAULTS,
  type BillingAddressInput,
} from "@/lib/booking/billing-address-flow";
import type { TutorDb } from "@/app/tutor/onboarding/profile/profile-flow";
import { CheckoutForm } from "./_components/CheckoutForm";
import { CheckoutSummary } from "./_components/CheckoutSummary";
import { CheckoutStepper } from "./_components/CheckoutStepper";

export const dynamic = "force-dynamic";

interface CheckoutPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PRESIGNED_URL_TTL_SEC = 600;

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    const raw = await searchParams;
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") qs.set(key, value);
    }
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/checkout?${qs.toString()}`)}`);
  }
  const user = session.user;
  const userId = user.id!;

  const raw = await searchParams;
  // parseGateParams expects intent=book multi-params (the /signup gate
  // URL shape). The /checkout URL uses a flatter `tutor/slot/duration/sig`
  // shape — rebuild the same input here so parseGateParams' sig check
  // applies. (Alternative was duplicating the verifier; keeping a single
  // parser is cleaner.)
  const sig = firstParam(raw.sig);
  const tutorUserId = firstParam(raw.tutor);
  const slotIso = firstParam(raw.slot);
  const durationRaw = firstParam(raw.duration);
  const parseResult = parseGateParams({
    intent: "book",
    tutorUserId: tutorUserId ?? "",
    slotIso: slotIso ?? "",
    duration: durationRaw ?? "",
    sig: sig ?? "",
  });

  if (!parseResult.payload) {
    return <InvalidLinkPanel reason={parseResult.reason} />;
  }
  const params = parseResult.payload;

  // Resolve tutor public profile — bail to 404-ish if not discoverable.
  const tutor = await getDiscoverableTutorByUserId(params.tutorUserId);
  if (tutor === null) {
    return <InvalidLinkPanel reason="tutor_not_found" />;
  }

  // Per-duration price map.
  const priceMap: Record<45 | 60 | 75 | 90, number | null> = {
    45: tutor.lesson45PriceIls,
    60: tutor.hourlyPriceIls,
    75: tutor.lesson75PriceIls,
    90: tutor.lesson90PriceIls,
  };
  const priceIls = priceMap[params.duration];
  if (priceIls === null) {
    return <InvalidLinkPanel reason="price_unavailable" />;
  }

  // Pre-fill: existing billing address > mock defaults.
  const db = getDb() as unknown as TutorDb;
  const existing = await getBillingAddressForUser({ db, userId });
  const sessionEmail = user.email ?? "";
  const sessionName = user.name ?? "";
  const prefill: BillingAddressInput = existing ?? {
    fullName: sessionName,
    phone: "050-1234567",
    ...MOCK_BILLING_ADDRESS_DEFAULTS,
  };
  const usedMockDefaults = existing === null;

  // Profile photo for the summary aside.
  let tutorPhotoUrl: string | null = null;
  if (tutor.profilePhotoR2Key) {
    try {
      tutorPhotoUrl = await getFilesProvider().generatePresignedGetUrl({
        bucket: "tutor-profile-photos",
        key: tutor.profilePhotoR2Key,
        expiresInSec: PRESIGNED_URL_TTL_SEC,
      });
    } catch (err) {
      console.error("[checkout/page] photo presign failed", err);
    }
  }

  return (
    <AppShell mainClassName="flex-1 bg-surface">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <CheckoutStepper active={2} />

        <h1 className="font-display font-extrabold text-3xl text-on-surface text-start mb-1">
          פרטים לתשלום
        </h1>
        <p className="text-on-surface-variant text-start mb-8">
          בדקו את הפרטים לפני שתמשיכו לאישור ההזמנה.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CheckoutForm
            tutorUserId={params.tutorUserId}
            slotIso={params.slotIso}
            duration={params.duration}
            sig={params.sig}
            email={sessionEmail}
            initial={prefill}
            showMockDataBanner={usedMockDefaults}
          />

          <CheckoutSummary
            tutorDisplayName={tutor.displayName}
            tutorPhotoUrl={tutorPhotoUrl}
            slotIso={params.slotIso}
            duration={params.duration}
            priceIls={priceIls}
          />
        </div>
      </div>
    </AppShell>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function InvalidLinkPanel({ reason }: { reason: string | null | undefined }) {
  // Generic recovery panel for tamper / expiry / vanished-tutor. Does NOT
  // leak which specific check failed — an attacker probing the signing
  // scheme should not be able to distinguish "sig_invalid" from
  // "tutor_not_found" from "price_unavailable". The reason is logged
  // server-side instead so we keep the diagnostic trail without the leak.
  if (reason) {
    console.warn(`[checkout/page] invalid-link panel rendered (reason=${reason})`);
  }
  return (
    <AppShell mainClassName="flex-1 bg-surface">
      <div className="mx-auto w-full max-w-2xl px-6 py-16 text-start">
        <h1 className="font-display font-extrabold text-2xl text-on-surface mb-3">
          הקישור לא תקף יותר
        </h1>
        <p className="text-on-surface-variant mb-6">
          ייתכן שהשעה כבר נתפסה או שהמורה הפסיק/ה ללמד. חזרו לדף המורה ובחרו
          שעה חדשה.
        </p>
      </div>
    </AppShell>
  );
}
