"use client";

// Checkout form — Story 4.3 (2026-05-18). Mirrors `mocks/checkout.html`
// lines 89–169. Three sections:
//   A. Student details (name/email-readonly/phone/national_id)
//   B. Billing address (street/city/zip)
//   C. Payment-method INFO BLOCK — "תשלום פיקטיבי" copy, no card form
//
// On submit, posts to `submitCheckoutAction`. The Server Action wraps
// upsertBillingAddress + runCreateBooking + revalidatePath +
// redirect(/booking/[id]/confirmed) — control flow never returns on
// success. Failures come back as discriminated union: form-level error
// (shows toast) or field-level errors (renders inline).

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { submitCheckoutAction } from "@/lib/booking/booking-actions";
import type { BillingAddressInput } from "@/lib/booking/billing-address-flow";

interface CheckoutFormProps {
  tutorUserId: string;
  slotIso: string;
  duration: 45 | 60 | 75 | 90;
  sig: string;
  /** Read-only — from session. */
  email: string;
  /** Pre-fill values (mock defaults or saved billing address). */
  initial: BillingAddressInput;
  /** Show the "we pre-filled with mock data" banner. */
  showMockDataBanner: boolean;
}

type FieldErrors = Partial<Record<keyof BillingAddressInput, string>>;

export function CheckoutForm({
  tutorUserId,
  slotIso,
  duration,
  sig,
  email,
  initial,
  showMockDataBanner,
}: CheckoutFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [nationalId, setNationalId] = useState(initial.nationalId);
  const [street, setStreet] = useState(initial.street);
  const [city, setCity] = useState(initial.city);
  const [zip, setZip] = useState(initial.zip);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await submitCheckoutAction({
        tutorUserId,
        slotIso,
        duration,
        sig,
        billing: { fullName, phone, nationalId, street, city, zip },
      });
      // submitCheckoutAction redirects on success — only error paths
      // reach this line.
      if (result && !result.ok) {
        if (result.failure.kind === "fields") {
          setFieldErrors(result.failure.fieldErrors);
        } else {
          setFormError(result.failure.formError);
        }
      }
      router.refresh();
    });
  }

  return (
    <form className="lg:col-span-2 space-y-5 text-start" onSubmit={onSubmit} noValidate>
      {showMockDataBanner && (
        <div
          role="status"
          className="bg-tertiary-fixed/30 border border-tertiary-fixed rounded-xl px-4 py-3 text-sm text-on-tertiary-fixed-variant"
        >
          השדות מולאו בנתוני דוגמה — אפשר לערוך לפני האישור. בבטא לא נדרשים
          פרטים אמיתיים.
        </div>
      )}

      {formError && (
        <div
          role="alert"
          className="bg-danger/10 border border-danger rounded-xl px-4 py-3 text-sm text-danger font-bold"
        >
          {formError}
        </div>
      )}

      {/* Section A — student details */}
      <section className="bg-white rounded-2xl border border-linen-border p-6">
        <header className="mb-1 flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary-container"
            aria-hidden="true"
          >
            person
          </span>
          <h2 className="font-display font-bold text-lg text-on-surface">
            פרטי הסטודנט
          </h2>
        </header>
        <p className="text-xs text-secondary mb-5">
          השדות מולאו מההרשמה שלך — אפשר לערוך לפני האישור.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם מלא"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={fieldErrors.fullName}
            required
          />
          <Input
            label="אימייל"
            type="email"
            value={email}
            readOnly
            dir="ltr"
          />
          <Input
            label="טלפון נייד"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={fieldErrors.phone}
            dir="ltr"
            required
          />
          <Input
            label={
              <span>
                תעודת זהות{" "}
                <span className="text-secondary font-normal">(לחשבונית)</span>
              </span>
            }
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            error={fieldErrors.nationalId}
            dir="ltr"
            placeholder="9 ספרות"
            required
          />
        </div>
      </section>

      {/* Section B — billing address */}
      <section className="bg-white rounded-2xl border border-linen-border p-6">
        <header className="mb-1 flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary-container"
            aria-hidden="true"
          >
            home
          </span>
          <h2 className="font-display font-bold text-lg text-on-surface">
            כתובת לחשבונית
          </h2>
        </header>
        <p className="text-xs text-secondary mb-5">
          לחשבונית המס שתישלח אליך בסיום השיעור — בהתאם לדרישות רשות המסים.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input
              label="רחוב ומספר"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              error={fieldErrors.street}
              required
            />
          </div>
          <Input
            label="עיר"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            error={fieldErrors.city}
            required
          />
          <Input
            label="מיקוד"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            error={fieldErrors.zip}
            dir="ltr"
            maxLength={7}
            required
          />
        </div>
      </section>

      {/* Section C — payment method info block (mock-payment MVP) */}
      <section className="bg-white rounded-2xl border border-linen-border p-6">
        <header className="mb-4 flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary-container"
            aria-hidden="true"
          >
            credit_card
          </span>
          <h2 className="font-display font-bold text-lg text-on-surface">
            אמצעי תשלום
          </h2>
        </header>

        <div className="border border-dashed border-linen-border rounded-xl bg-linen/60 p-5 flex items-start gap-3">
          <span
            className="material-symbols-outlined text-primary-container text-2xl shrink-0"
            aria-hidden="true"
          >
            lock
          </span>
          <div className="flex-1 text-start space-y-2">
            <p className="font-bold text-on-surface text-sm">תשלום פיקטיבי</p>
            <p className="text-xs text-secondary leading-relaxed">
              בבטא הסגורה לא יבוצע חיוב כספי בפועל.
            </p>
            <p className="text-[11px] text-secondary leading-relaxed">
              כאן יופיע טופס תשלום מאובטח כשנפעיל סליקה אמיתית.
            </p>
          </div>
        </div>
      </section>

      {/* Submit */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={isPending}
          loading={isPending}
        >
          אישור הזמנה
        </Button>
        <p className="text-[11px] text-secondary text-center mt-3">
          לחיצה על האישור תיצור הזמנה בלוח הזמנים של המורה ותחסום את השעה.
        </p>
      </div>
    </form>
  );
}
