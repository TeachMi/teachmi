/**
 * Hand-rolled env-flag resolution for the `lib/providers/*` strategy interfaces (AD-13).
 * MVP-1 → MVP-2 cutover is a Vercel env-var flip on these names; defaults are "stub"
 * everywhere so a fresh checkout boots in StubProvider mode without ceremony.
 */

const PROVIDER_VALUES = {
  payment: ["stub", "payme"] as const,
  invoice: ["stub", "green-invoice"] as const,
  govil: ["stub", "deeplink"] as const,
  lessonRoom: ["stub", "daily"] as const,
  email: ["stub", "resend"] as const,
} as const;

const PROVIDER_ENV_VARS = {
  payment: "PAYMENTS_PROVIDER",
  invoice: "INVOICE_PROVIDER",
  govil: "GOVIL_PROVIDER",
  lessonRoom: "LESSON_ROOM_PROVIDER",
  email: "EMAIL_PROVIDER",
} as const;

export type ProviderKind = keyof typeof PROVIDER_VALUES;
export type ProviderName<TKind extends ProviderKind> =
  (typeof PROVIDER_VALUES)[TKind][number];

export function getProviderName<TKind extends ProviderKind>(
  kind: TKind,
): ProviderName<TKind> {
  const envVarName = PROVIDER_ENV_VARS[kind];
  const raw = process.env[envVarName];
  const trimmed = raw?.trim() ?? "";

  if (trimmed === "") {
    return "stub" as ProviderName<TKind>;
  }

  const allowed = PROVIDER_VALUES[kind] as readonly string[];
  if (!allowed.includes(trimmed)) {
    throw new Error(
      `Invalid value for ${envVarName}: "${raw}". Expected one of: ${allowed.join(", ")}.`,
    );
  }

  return trimmed as ProviderName<TKind>;
}
