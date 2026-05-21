"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/registration";
import { registerAction, signInWithGoogle } from "./actions";
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
  /**
   * Account role for this signup, fixed by the entry point — the
   * become-a-tutor page passes `tutor` via `?role=tutor`; every other entry
   * defaults to `student`. There is no in-form role picker; the value is
   * submitted as a hidden field and re-validated server-side by `coerceRole`.
   */
  role?: "student" | "tutor";
}

export function SignupForm({ next, role = "student" }: SignupFormProps = {}) {
  const isTutor = role === "tutor";
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
          {isTutor ? "פתיחת חשבון מורה" : "ברוכים הבאים ל-TeachMe"}
        </h1>
        <p className="text-on-surface-variant">
          {isTutor
            ? "עוד כמה פרטים ואתם באשף בניית הפרופיל."
            : "פתחו חשבון ומצאו את המורה שמתאים לכם."}
        </p>
      </div>

      <Card padding="lg" shadow="sm" className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">פרטי החשבון</CardTitle>
        </CardHeader>
        <CardBody>
          {/* Google OAuth — available for both roles. The hidden `role` lets
              `signInWithGoogle` flag a tutor signup so `events.createUser`
              (auth.ts) promotes the new account from the default student. */}
          <div className="mb-5 space-y-5">
            <form action={signInWithGoogle}>
              <input type="hidden" name="callbackUrl" value={next ?? ""} />
              <input type="hidden" name="role" value={role} />
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
                המשך עם Google
              </Button>
            </form>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-linen-border" />
              <span className="text-xs text-on-surface-variant">או</span>
              <div className="h-px flex-1 bg-linen-border" />
            </div>
          </div>
          <form action={formAction} className="space-y-5" noValidate>
            {/* Story 3.3 — booking-funnel intent target. Always rendered so the
                DOM is uniform regardless of intent state; empty value flows
                through registerAction as `null` (no intent). */}
            <input type="hidden" name="next" value={next ?? ""} />

            {/* Role is fixed by the signup entry point (see `role` prop) and
                submitted as a hidden field — no in-form picker. `coerceRole`
                re-validates server-side and can never yield `admin`. */}
            <input type="hidden" name="role" value={role} />

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

            {/* Passive consent — submitting the form IS the acceptance event.
                runRegister writes the consent_receipts row server-side; there
                are no required checkboxes. Marketing opt-in moved to the tutor
                wizard (it legally must be a separate explicit opt-in). */}
            <p className="text-center text-xs leading-5 text-on-surface-variant">
              בהרשמה אני מאשר/ת את{" "}
              <Link
                className="border-b border-primary-container text-primary-container"
                href="/legal/terms"
                target="_blank"
                rel="noopener"
              >
                תנאי השימוש
              </Link>{" "}
              ו
              <Link
                className="border-b border-primary-container text-primary-container"
                href="/legal/privacy"
                target="_blank"
                rel="noopener"
              >
                מדיניות הפרטיות
              </Link>
            </p>

            <p className="text-center text-sm text-on-surface-variant">
              יש לכם חשבון?{" "}
              <Link
                className="font-bold text-primary-container hover:underline"
                href={
                  // Story 3.3: preserve booking intent across the cross-link.
                  // `/signin` page-level handler calls decomposeNextToGateParams
                  // on its `callbackUrl` query param to reconstruct the gate
                  // payload + render the same banner.
                  next
                    ? `/signin?callbackUrl=${encodeURIComponent(next)}`
                    : "/signin"
                }
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
