"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RoleCardPicker } from "@/components/auth/RoleCardPicker";
import { PrivacyPolicyBody } from "@/components/legal/PrivacyPolicyBody";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/registration";
import { registerAction } from "./actions";
import {
  REGISTER_INITIAL_STATE,
  type RegisterActionState,
} from "./register-state";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<RegisterActionState, FormData>(
    registerAction,
    REGISTER_INITIAL_STATE,
  );

  const fieldErrors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-10 text-center">
        <h1 className="mb-2 font-display text-3xl font-extrabold text-primary-container">
          ברוכים הבאים ל-TeachMe
        </h1>
        <p className="text-on-surface-variant">בואו נתחיל. למה אתם מצטרפים?</p>
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

            <section
              className="space-y-3 rounded-xl border border-linen-border bg-linen/50 p-4"
              aria-labelledby="privacy-policy-heading"
            >
              <h2
                id="privacy-policy-heading"
                className="font-display text-lg font-bold text-primary-container"
              >
                מדיניות פרטיות
              </h2>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-linen-border bg-surface p-4">
                <PrivacyPolicyBody />
              </div>
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
            </section>

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
                href="/signin"
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
