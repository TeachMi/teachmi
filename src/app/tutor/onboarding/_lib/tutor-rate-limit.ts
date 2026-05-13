// Thin rate-limit helper for tutor-onboarding Server Actions.
//
// Composes the PURE helpers from `lib/auth/rate-limit.ts` (read-only) — we
// can't extend that file's `AuthRateLimitAction` closed enum without touching
// it, and `lib/auth/**` is owned by the parallel 1.15 session this sprint.
// So we keep our own attempt-event builder here, sharing the underlying
// counter logic (windowed `audit_events` SELECT-then-INSERT).

import { and, eq, gte } from "drizzle-orm";
import { auditEvents } from "../../../../lib/db/schema";
import { toAuditEventValues, type AuditEventInput } from "../../../../lib/db/audit";
import {
  evaluateRateLimit,
  rateLimitWindowStart,
  type RateLimitResult,
} from "../../../../lib/auth/rate-limit";

export type TutorRateLimitAction =
  | "submit_profile"
  | "save_draft"
  | "request_upload";

export const TUTOR_RATE_LIMIT_EVENT_TYPES: Record<TutorRateLimitAction, string> = {
  submit_profile: "tutor.submit_profile_attempt",
  save_draft: "tutor.save_draft_attempt",
  request_upload: "tutor.request_upload_attempt",
};

export const TUTOR_RATE_LIMIT_THRESHOLDS: Record<TutorRateLimitAction, number> = {
  submit_profile: 5, // 5/min — submit is a heavyweight write; 5 is generous
  save_draft: 60, // 60/min — the 30s debounce makes 60/min comfortable
  request_upload: 20, // 20/min combined photo + video — covers retries
};

interface RateLimitDb {
  select(cols: unknown): {
    from(table: unknown): {
      where(condition: unknown): Promise<{ id: string }[]>;
    };
  };
  insert(table: unknown): {
    values(value: unknown): Promise<unknown>;
  };
}

export interface CheckTutorRateLimitInput {
  db: RateLimitDb;
  tutorUserId: string;
  action: TutorRateLimitAction;
  /** Optional anonymized-IP — surfaces in the `actorMeta` for forensics. */
  ipForAudit?: string | null;
}

/**
 * SELECT count of recent attempts for this (tutor, action) pair, then INSERT
 * the new attempt row regardless of allow/deny. The pure
 * `evaluateRateLimit` from `lib/auth/rate-limit.ts` decides allow/deny.
 *
 * Same count-before-insert race window the auth flows have — acceptable for
 * MVP 1; WAF edge layer absorbs serious bursts (deferred handoff per Story
 * 1.13 AC8).
 */
export async function checkTutorRateLimit(
  input: CheckTutorRateLimitInput,
): Promise<RateLimitResult> {
  const windowStart = rateLimitWindowStart();
  const threshold = TUTOR_RATE_LIMIT_THRESHOLDS[input.action];
  const eventType = TUTOR_RATE_LIMIT_EVENT_TYPES[input.action];

  const recent = await input.db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.eventType, eventType),
        eq(auditEvents.actorId, input.tutorUserId),
        gte(auditEvents.createdAt, windowStart),
      ),
    );

  // Always write the attempt audit row (powers the next bucket's count).
  await input.db
    .insert(auditEvents)
    .values(
      toAuditEventValues(
        buildTutorAttemptAuditEvent({
          tutorUserId: input.tutorUserId,
          action: input.action,
          ipForAudit: input.ipForAudit ?? null,
        }),
      ),
    );

  return evaluateRateLimit({ recentAttempts: recent.length, threshold });
}

interface AttemptAuditInput {
  tutorUserId: string;
  action: TutorRateLimitAction;
  ipForAudit: string | null;
}

export function buildTutorAttemptAuditEvent(input: AttemptAuditInput): AuditEventInput {
  return {
    eventType: TUTOR_RATE_LIMIT_EVENT_TYPES[input.action],
    actorKind: "user",
    actorId: input.tutorUserId,
    actorMeta: input.ipForAudit,
    targetType: "tutor_profile",
    targetId: input.tutorUserId,
    payload: {},
  };
}
