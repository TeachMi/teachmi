"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RoleCardPicker } from "@/components/auth/RoleCardPicker";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/registration";
import { MARKETING_OPTIN_LABEL_HE } from "@/lib/legal/marketing-consent";
import { registerAction } from "./actions";
import {
  REGISTER_INITIAL_STATE,
  type RegisterActionState,
} from "./register-state";

export interface SignupFormProps {
  /**
   * Story 3.3 — booking-funnel intent target. When non-empty, threaded into:
   *   1. A hidden `<input name="next">` so `registerAction` redirects post-
   *      verify to the booking-stub instead of /dashboard.
   *   2. The "התחברות" cross-link as `?callbackUrl=<encoded next>` so a
   *      visitor with an existing account can sign in without losing intent.
   * Page-level (`signup/page.tsx`) is responsible for parsing + sanitizing
   * the intent params; the form just plumbs the resolved `next` through.
   */
  next?: string;
}

export function SignupForm({ next }: SignupFormProps = {}) {
  const [state, formAction, pending] = useActionState<RegisterActionState, FormData>(
    registerAction,
    REGISTER_INITIAL_STATE,
  );

  const fieldErrors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  // Story 3.3: preserve booking intent across the cross-link to /signin.
  // The /signin page-level handler calls `decomposeNextToGateParams` on its
  // `callbackUrl` query param to reconstruct the gate payload + banner.
  const signinHref = next
    ? `/signin?callbackUrl=${encodeURIComponent(next)}`
    : "/signin";

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="mb-2 font-display text-3xl font-extrabold text-primary-container">
          ברוכים הבאים ל-TeachMe
        </h1>
        <p className="text-on-surface-variant">בואו נתחיל. למה אתם מצטרפים?</p>
        {/* Sign-in affordance kept at first-level visibility — NOT buried at
            the foot of the form. A logged-out *existing* student who hit the
            booking gate must be able to switch to /signin without hunting;
            `signinHref` carries the booking intent so they land back at
            checkout post-auth. */}
        <p className="mt-4 text-sm text-on-surface-variant">
          כבר רשומים?{" "}
          <Link
            className="font-bold text-primary-container underline underline-offset-2 hover:text-primary"
            href={signinHref}
          >
            התחברו לחשבון
          </Link>
        </p>
      </div>

      <div className="mb-8">
        <RoleCardPicker
          defaultValue={values.role === "tutor" ? "tutor" : "student"}
        />
      </div>

      <Card padding="lg" shadow="sm" className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">פרטי החשבון</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={formAction} className="space-y-5" noValidate>
            {/* Story 3.3 — booking-funnel intent target. Always rendered so the
                DOM is uniform regardless of intent state; empty value flows
                through registerAction as `null` (no intent). */}
            <input type="hidden" name="next" value={next ?? ""} />

            <Input
              name="name"
              type="text"
              label="שם מלא"
              placeholder="ישראל ישראלי"
              autoComplete="name"
              required
              minLength={2}
              defaultValue={values.name ?? ""}
              error={fieldErrors.name}
              size="lg"
              surface="linen"
            />

            <Input
              name="email"
              type="email"
              label="אימייל"
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              required
              dir="ltr"
              defaultValue={values.email ?? ""}
              error={fieldErrors.email}
              size="lg"
              surface="linen"
            />

            <Input
              name="password"
              type="password"
              label="סיסמה"
              placeholder="לפחות 10 תווים"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              hint={`לפחות ${PASSWORD_MIN_LENGTH} תווים, אות אחת ומספר אחד`}
              error={fieldErrors.password}
              size="lg"
              surface="linen"
            />

            <CheckboxField
              name="privacyPolicy"
              value="on"
              required
              defaultChecked={values.privacyPolicy === true}
              error={fieldErrors.privacyPolicy}
              label={
                <span>
                  אני מאשר/ת את{" "}
                  <Link
                    className="border-b border-primary-container text-primary-container"
                    href="/legal/privacy"
                    target="_blank"
                    rel="noopener"
                  >
                    מדיניות הפרטיות
                  </Link>
                </span>
              }
            />

            <CheckboxField
              name="tos"
              value="on"
              required
              defaultChecked={values.tos === true}
              error={fieldErrors.tos}
              label={
                <span>
                  אני מאשר/ת את{" "}
                  <Link
                    className="border-b border-primary-container text-primary-container"
                    href="/legal/terms"
                    target="_blank"
                    rel="noopener"
                  >
                    תנאי השימוש
                  </Link>
                </span>
              }
            />

            <CheckboxField
              name="marketingOptIn"
              value="on"
              defaultChecked={values.marketingOptIn === true}
              label={MARKETING_OPTIN_LABEL_HE}
            />

            {state.formError && (
              <p
                className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-bold text-danger"
                role="alert"
              >
                {state.formError}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth disabled={pending}>
              {pending ? "שולחים אימות…" : "צרו חשבון ←"}
            </Button>

            <p className="text-center text-sm text-on-surface-variant">
              יש לכם חשבון?{" "}
              <Link
                className="font-bold text-primary-container hover:underline"
                href={signinHref}
              >
                התחברות
              </Link>
            </p>
          </form>
        </CardBody>
      </Card>
    </section>
  );
}
