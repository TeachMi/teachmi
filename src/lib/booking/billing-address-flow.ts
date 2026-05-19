// Upsert + read helpers for the new `billing_addresses` table (Story 4.3).
// One row per user; UPSERTed on each checkout submit. The future invoice
// flow (Story 8.x) reads from here to populate `customer_receipt` +
// `transaction_invoice` recipient fields.

import { eq } from "drizzle-orm";
import { auditEvents, billingAddresses } from "../db/schema";
import { toAuditEventValues } from "../db/audit";
import type { TutorDb } from "@/app/tutor/onboarding/profile/profile-flow";

export interface BillingAddressInput {
  fullName: string;
  phone: string;
  nationalId: string;
  street: string;
  city: string;
  zip: string;
}

export interface BillingAddressDeps {
  db: TutorDb;
  userId: string;
  logger?: { error: (message: string, err?: unknown) => void };
}

const FIELD_MAX = 200;

/**
 * Returns the user's saved billing address, or null when none exists yet.
 * Used to pre-fill the checkout form. Closed-beta callers fall back to
 * `MOCK_BILLING_ADDRESS_DEFAULTS` when this returns null.
 */
export async function getBillingAddressForUser(
  deps: BillingAddressDeps,
): Promise<BillingAddressInput | null> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };
  try {
    const rows = (await deps.db
      .select({
        fullName: billingAddresses.fullName,
        phone: billingAddresses.phone,
        nationalId: billingAddresses.nationalId,
        street: billingAddresses.street,
        city: billingAddresses.city,
        zip: billingAddresses.zip,
      })
      .from(billingAddresses)
      .where(eq(billingAddresses.userId, deps.userId))) as BillingAddressInput[];
    return rows[0] ?? null;
  } catch (err) {
    log.error("[getBillingAddressForUser] lookup failed", err);
    return null;
  }
}

/**
 * Validates + trims + UPSERTs the user's billing address. Returns ok|err
 * with a field-error map when validation fails. Audit row inserted last
 * on the INSERT-or-UPDATE path so we can distinguish first-save from
 * later edits in the audit trail.
 *
 * Closed-beta validation is permissive — strings are trimmed + length-
 * capped + non-empty checks only. Israeli ID check-digit + zip format
 * validation are deferred to Story 8.x (real invoice issuance).
 */
export type UpsertBillingAddressResult =
  | { ok: true; created: boolean }
  | { ok: false; fieldErrors: Partial<Record<keyof BillingAddressInput, string>> };

export async function upsertBillingAddress(
  raw: BillingAddressInput,
  deps: BillingAddressDeps,
): Promise<UpsertBillingAddressResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };

  const cleaned: BillingAddressInput = {
    fullName: raw.fullName.trim().slice(0, FIELD_MAX),
    phone: raw.phone.trim().slice(0, FIELD_MAX),
    nationalId: raw.nationalId.trim().slice(0, FIELD_MAX),
    street: raw.street.trim().slice(0, FIELD_MAX),
    city: raw.city.trim().slice(0, FIELD_MAX),
    zip: raw.zip.trim().slice(0, FIELD_MAX),
  };

  const fieldErrors: Partial<Record<keyof BillingAddressInput, string>> = {};
  if (cleaned.fullName.length === 0) fieldErrors.fullName = "שדה חובה.";
  if (cleaned.phone.length === 0) fieldErrors.phone = "שדה חובה.";
  if (cleaned.nationalId.length === 0) fieldErrors.nationalId = "שדה חובה.";
  if (cleaned.street.length === 0) fieldErrors.street = "שדה חובה.";
  if (cleaned.city.length === 0) fieldErrors.city = "שדה חובה.";
  if (cleaned.zip.length === 0) fieldErrors.zip = "שדה חובה.";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  try {
    const existing = (await deps.db
      .select({ id: billingAddresses.id })
      .from(billingAddresses)
      .where(eq(billingAddresses.userId, deps.userId))) as Array<{ id: string }>;

    let created: boolean;
    if (existing.length === 0) {
      await deps.db.insert(billingAddresses).values({
        userId: deps.userId,
        ...cleaned,
        createdByKind: "user",
        createdByActor: deps.userId,
      });
      created = true;
    } else {
      await deps.db
        .update(billingAddresses)
        .set({
          ...cleaned,
          updatedByKind: "user",
          updatedByActor: deps.userId,
          updatedAt: new Date(),
        })
        .where(eq(billingAddresses.userId, deps.userId));
      created = false;
    }

    // Audit last (non-fatal on failure).
    try {
      await deps.db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: created
            ? "billing_address.created"
            : "billing_address.updated",
          actorKind: "user",
          actorId: deps.userId,
          targetType: "billing_address",
          targetId: deps.userId, // 1:1 — userId doubles as the natural key
        }),
      );
    } catch (err) {
      log.error(
        "[upsertBillingAddress] audit INSERT failed (non-fatal)",
        err,
      );
    }

    return { ok: true, created };
  } catch (err) {
    log.error("[upsertBillingAddress] UPSERT failed", err);
    return {
      ok: false,
      fieldErrors: { fullName: "אירעה שגיאה. נסו שוב." },
    };
  }
}

/**
 * Mock-data prefill for the checkout form when no saved address exists.
 * Closed-beta only — pre-filling spares testers from typing real data
 * while still exercising the full INSERT path.
 *
 * `nationalId` is deliberately an all-zeros sentinel (NOT a real-looking
 * Israeli ת״ז that passes the check-digit). Code review 2026-05-19
 * (F10): a real-looking literal could leak into audit logs / future
 * Green-Invoice payloads if a beta tester submits the prefill unchanged.
 */
export const MOCK_BILLING_ADDRESS_DEFAULTS: Omit<BillingAddressInput, "fullName" | "phone"> = {
  nationalId: "000000000",
  street: "רחוב הדוגמה 1",
  city: "תל אביב",
  zip: "6100000",
};
