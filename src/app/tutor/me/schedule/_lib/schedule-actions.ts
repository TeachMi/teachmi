"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "../../../../../lib/db/client";
import { anonymizeIpForAnalytics } from "../../../../../lib/auth/rate-limit";
import { track } from "../../../../../lib/analytics";
import { readIp } from "../../../../signup/_lib/origin";
import { requireTutor } from "../../../onboarding/_lib/require-tutor";
import { checkTutorRateLimit } from "../../../onboarding/_lib/tutor-rate-limit";
import type { TutorDb } from "../../../onboarding/profile/profile-flow";
import {
  runBulkRemoveRecurring,
  runBulkUpdateExceptions,
  runBulkUpdateRecurring,
  runResetAllAvailability,
  runToggleException,
  runToggleRecurringSlot,
  type ScheduleFlowResult,
  WEEKDAYS,
} from "./schedule-flow";

// Server Actions for the Schedule tab editor. Each one:
//   1. Auths the caller as a tutor (`requireTutor` — Story 2.1 helper).
//   2. Rate-limits via the shared per-tutor rate-limit (`checkTutorRateLimit`).
//      Same surface as the Story 2.10 edit-flow uses; reuses the existing
//      "submit_profile" action key — closed-beta scale doesn't need per-
//      action keys, and the canonical defense is the deferred Vercel WAF.
//   3. Dispatches to a pure orchestrator from `./schedule-flow`.
//   4. `revalidatePath("/tutor/me/schedule")` so the RSC reloads the rules
//      list after each mutation. No optimistic UI at MVP — the round-trip
//      is bounded by the Neon-HTTP latency budget (~80ms typical).

const RATE_LIMIT_ACTION = "submit_profile" as const;
const REVALIDATE_PATH = "/tutor/me/schedule";

function tutorRateLimitErr(): ScheduleFlowResult {
  return { ok: false, formError: "יותר מדי ניסיונות. נסו שוב בעוד דקה." };
}

async function buildDeps() {
  const user = await requireTutor("/tutor/me/schedule");
  const hdrs = await headers();
  const ip = readIp(hdrs.get("x-forwarded-for"));
  const db = getDb() as unknown as TutorDb &
    Parameters<typeof checkTutorRateLimit>[0]["db"];
  const limit = await checkTutorRateLimit({
    db,
    tutorUserId: user.id,
    action: RATE_LIMIT_ACTION,
    ipForAudit: ip,
  });
  return { user, db, ip, limit };
}

/** Toggle a recurring weekly slot. `weekday` 0..6 (Sun..Sat). */
export async function toggleRecurringSlotAction(input: {
  weekday: number;
  slotIdx: number;
}): Promise<ScheduleFlowResult> {
  const { user, db, ip, limit } = await buildDeps();
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: RATE_LIMIT_ACTION,
    });
    return tutorRateLimitErr();
  }
  const result = await runToggleRecurringSlot(input, {
    db,
    tutorUserId: user.id,
    now: () => new Date(),
  });
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

/**
 * Bulk recurring-slot apply. Story 2.10 follow-up 2026-05-17 — drag-paint +
 * batched Save commits via this single action instead of N per-click
 * actions. `addCells` and `removeCells` are arrays of `{weekday, slotIdx}`;
 * the orchestrator is idempotent so partial-success retries are safe.
 */
export async function bulkUpdateRecurringAction(input: {
  addCells: Array<{ weekday: number; slotIdx: number }>;
  removeCells: Array<{ weekday: number; slotIdx: number }>;
}): Promise<ScheduleFlowResult> {
  const { user, db, ip, limit } = await buildDeps();
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: RATE_LIMIT_ACTION,
    });
    return tutorRateLimitErr();
  }
  const result = await runBulkUpdateRecurring(input, {
    db,
    tutorUserId: user.id,
    now: () => new Date(),
  });
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

/**
 * Bulk exception apply (Tab 2 "היומן שלי" — Sally's drag-paint + Save
 * model extended to exceptions). 2026-05-18.
 */
export async function bulkUpdateExceptionsAction(input: {
  addCells: Array<{
    dateIso: string;
    slotIdx: number;
    kind: "exception_blocked" | "exception_available";
  }>;
  removeCells: Array<{
    dateIso: string;
    slotIdx: number;
    kind: "exception_blocked" | "exception_available";
  }>;
}): Promise<ScheduleFlowResult> {
  const { user, db, ip, limit } = await buildDeps();
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: RATE_LIMIT_ACTION,
    });
    return tutorRateLimitErr();
  }
  const result = await runBulkUpdateExceptions(input, {
    db,
    tutorUserId: user.id,
    now: () => new Date(),
  });
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

/** Toggle a date-specific exception. */
export async function toggleExceptionAction(input: {
  dateIso: string;
  slotIdx: number;
  kind: "exception_blocked" | "exception_available";
}): Promise<ScheduleFlowResult> {
  const { user, db, ip, limit } = await buildDeps();
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: RATE_LIMIT_ACTION,
    });
    return tutorRateLimitErr();
  }
  const result = await runToggleException(input, {
    db,
    tutorUserId: user.id,
    now: () => new Date(),
  });
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

/** Quick action — block weekend (Friday + Saturday). */
export async function blockWeekendAction(): Promise<ScheduleFlowResult> {
  const { user, db, ip, limit } = await buildDeps();
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: RATE_LIMIT_ACTION,
    });
    return tutorRateLimitErr();
  }
  const result = await runBulkRemoveRecurring(
    { weekdays: [5, 6] },
    { db, tutorUserId: user.id, now: () => new Date() },
  );
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

/** Quick action — block whole week (all 7 days). */
export async function blockWholeWeekAction(): Promise<ScheduleFlowResult> {
  const { user, db, ip, limit } = await buildDeps();
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: RATE_LIMIT_ACTION,
    });
    return tutorRateLimitErr();
  }
  const result = await runBulkRemoveRecurring(
    { weekdays: [...WEEKDAYS] },
    { db, tutorUserId: user.id, now: () => new Date() },
  );
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

/** Quick action — reset all availability (recurring + exceptions). */
export async function resetAvailabilityAction(): Promise<ScheduleFlowResult> {
  const { user, db, ip, limit } = await buildDeps();
  if (!limit.allowed) {
    track({
      event: "tutor_rate_limited",
      anonymizedIp: anonymizeIpForAnalytics(ip),
      action: RATE_LIMIT_ACTION,
    });
    return tutorRateLimitErr();
  }
  const result = await runResetAllAvailability({
    db,
    tutorUserId: user.id,
    now: () => new Date(),
  });
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}
