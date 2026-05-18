// Pure orchestrators for the Schedule tab Server Actions (Story 2.10
// extension — tutor availability editor).
//
// FakeDb-testable via schedule-flow.test.ts. `actions.ts` ("use server") is
// the thin Next.js wrapper that builds the real dependencies (getDb +
// requireTutor()).
//
// DATA MODEL — row-per-30min-cell. Each click in the editor creates or
// deletes a single `tutor_availability` row whose [startTime, endTime) spans
// exactly 30 minutes. We deliberately do NOT merge adjacent cells into
// longer spans server-side — it keeps every toggle a single INSERT or
// DELETE with no split-on-delete / merge-on-insert logic. ~50–100 rows per
// tutor at closed-beta scale is fine; revisit if performance / DB volume
// surfaces a problem.
//
// SEQUENTIAL WRITES — Neon HTTP has no interactive transactions. Each
// orchestrator does its writes one at a time, with the audit row LAST so a
// partial-failure leaves an inconsistent audit trail rather than dropping
// the user-visible state. Same precedent as Story 2.10's edit-flow.

import { and, eq, inArray } from "drizzle-orm";
import { auditEvents, tutorAvailability } from "../../../../../lib/db/schema";
import { toAuditEventValues } from "../../../../../lib/db/audit";
import type { TutorDb } from "../../../onboarding/profile/profile-flow";

// --- Constants -------------------------------------------------------------

/**
 * Editor grid window — 08:00 inclusive → 23:00 exclusive, 30-min slots.
 * Sally + founder direction 2026-05-18: the prior 14:00–21:00 window was
 * too narrow. Real Israeli tutors need to cover morning slots (Bagrut
 * cram-sessions, university student afternoons) as well as late evening.
 * 30 cells per day per weekday × 7 = 210 cells. Manageable with drag-paint.
 */
export const SCHEDULE_GRID = {
  /** First slot's start (HH:MM). */
  START_HOUR: 8,
  /** Last slot's END (HH:MM). 23:00 means the final cell spans 22:30–23:00. */
  END_HOUR: 23,
  SLOT_MINUTES: 30,
} as const;

/** Number of 30-min cells in the grid window. */
export const SLOTS_PER_DAY =
  ((SCHEDULE_GRID.END_HOUR - SCHEDULE_GRID.START_HOUR) * 60) /
  SCHEDULE_GRID.SLOT_MINUTES; // = 30

/**
 * Day-period definitions — Hebrew labels + their slot-index spans within
 * the current grid window. Display logic only; per Winston they live in
 * config not a schema enum (so we can adjust without a migration).
 *
 * Mapping for the 08:00–23:00 window:
 *   - בוקר      08:00–12:00   slots 0–7   (8 cells, 4h)
 *   - צהריים    12:00–17:00   slots 8–17  (10 cells, 5h)
 *   - ערב       17:00–21:00   slots 18–25 (8 cells, 4h)
 *   - לילה      21:00–23:00   slots 26–29 (4 cells, 2h)
 */
export type PeriodKey = "morning" | "afternoon" | "evening" | "night";

export interface PeriodDef {
  key: PeriodKey;
  labelHe: string;
  /** Inclusive first slot index covered. */
  slotStart: number;
  /** Inclusive last slot index covered. */
  slotEnd: number;
}

export const PERIOD_DEFS: PeriodDef[] = [
  { key: "morning", labelHe: "בוקר", slotStart: 0, slotEnd: 7 },
  { key: "afternoon", labelHe: "צהריים", slotStart: 8, slotEnd: 17 },
  { key: "evening", labelHe: "ערב", slotStart: 18, slotEnd: 25 },
  { key: "night", labelHe: "לילה", slotStart: 26, slotEnd: 29 },
];

/** Weekday range — 0=Sunday … 6=Saturday (matches Postgres `EXTRACT(DOW)`). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

// --- Time helpers ----------------------------------------------------------

/** "14:00:00" / "14:30:00" / … — Postgres `time` column format. */
function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

/**
 * Index-into-grid → ("startTime", "endTime") for a 30-min slot.
 * slotIdx is 0..SLOTS_PER_DAY-1.
 */
export function slotTimes(slotIdx: number): { startTime: string; endTime: string } {
  if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= SLOTS_PER_DAY) {
    throw new Error(`[slotTimes] slotIdx ${slotIdx} out of range [0..${SLOTS_PER_DAY - 1}]`);
  }
  const totalStartMin =
    SCHEDULE_GRID.START_HOUR * 60 + slotIdx * SCHEDULE_GRID.SLOT_MINUTES;
  const totalEndMin = totalStartMin + SCHEDULE_GRID.SLOT_MINUTES;
  return {
    startTime: formatTime(Math.floor(totalStartMin / 60), totalStartMin % 60),
    endTime: formatTime(Math.floor(totalEndMin / 60), totalEndMin % 60),
  };
}

function isValidWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

// --- Result type -----------------------------------------------------------

export type ScheduleFlowResult =
  | { ok: true }
  | { ok: false; formError: string };

// --- Deps ------------------------------------------------------------------

export interface ScheduleDeps {
  db: TutorDb;
  tutorUserId: string;
  now: () => Date;
  logger?: { error: (message: string, err?: unknown) => void };
}

// --- Internal lookup shapes -----------------------------------------------

interface ExistingSlotLookup {
  id: string;
}

// --- Orchestrators ---------------------------------------------------------

/**
 * Toggle a single recurring slot: if a row exists for
 * (tutorUserId, kind='recurring', weekday, startTime, endTime) → DELETE.
 * Otherwise → INSERT. Single audit row records the resulting state.
 */
export async function runToggleRecurringSlot(
  input: { weekday: number; slotIdx: number },
  deps: ScheduleDeps,
): Promise<ScheduleFlowResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };

  if (!isValidWeekday(input.weekday)) {
    return { ok: false, formError: "יום בשבוע לא תקין." };
  }
  let times: { startTime: string; endTime: string };
  try {
    times = slotTimes(input.slotIdx);
  } catch (err) {
    log.error("[runToggleRecurringSlot] invalid slotIdx", err);
    return { ok: false, formError: "משבצת זמן לא תקינה." };
  }

  try {
    const existing = (await deps.db
      .select({ id: tutorAvailability.id })
      .from(tutorAvailability)
      .where(
        and(
          eq(tutorAvailability.tutorUserId, deps.tutorUserId),
          eq(tutorAvailability.kind, "recurring"),
          eq(tutorAvailability.weekday, input.weekday),
          eq(tutorAvailability.startTime, times.startTime),
          eq(tutorAvailability.endTime, times.endTime),
        ),
      )) as ExistingSlotLookup[];

    if (existing.length > 0) {
      // DELETE then audit
      const deletedId = existing[0]!.id;
      await deps.db
        .delete(tutorAvailability)
        .where(eq(tutorAvailability.id, deletedId));
      await deps.db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "tutor.availability_recurring_removed",
          actorKind: "user",
          actorId: deps.tutorUserId,
          targetType: "tutor_availability",
          targetId: deletedId,
          payload: {
            weekday: input.weekday,
            startTime: times.startTime,
            endTime: times.endTime,
          },
        }),
      );
      return { ok: true };
    }

    // INSERT then audit
    const inserted = (await deps.db
      .insert(tutorAvailability)
      .values({
        tutorUserId: deps.tutorUserId,
        kind: "recurring",
        weekday: input.weekday,
        date: null,
        startTime: times.startTime,
        endTime: times.endTime,
        validFrom: null,
        validUntil: null,
        createdByKind: "user",
        createdByActor: deps.tutorUserId,
      })
      .returning({ id: tutorAvailability.id })) as ExistingSlotLookup[];
    const newId = inserted[0]?.id;
    if (!newId) {
      log.error("[runToggleRecurringSlot] insert returned no id");
      return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
    }
    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "tutor.availability_recurring_added",
        actorKind: "user",
        actorId: deps.tutorUserId,
        targetType: "tutor_availability",
        targetId: newId,
        payload: {
          weekday: input.weekday,
          startTime: times.startTime,
          endTime: times.endTime,
        },
      }),
    );
    return { ok: true };
  } catch (err) {
    log.error("[runToggleRecurringSlot] failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
  }
}

/**
 * Toggle a date-specific exception slot. `kind` selects
 * `exception_blocked` (overrides recurring availability for the date) or
 * `exception_available` (creates availability for a date even outside
 * recurring rules). Identical UPSERT-on-(tutorUserId, kind, date,
 * startTime, endTime) toggle semantics as the recurring orchestrator.
 *
 * `dateIso` is "YYYY-MM-DD" (Asia/Jerusalem date).
 */
export async function runToggleException(
  input: { dateIso: string; slotIdx: number; kind: "exception_blocked" | "exception_available" },
  deps: ScheduleDeps,
): Promise<ScheduleFlowResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateIso)) {
    return { ok: false, formError: "תאריך לא תקין." };
  }
  let times: { startTime: string; endTime: string };
  try {
    times = slotTimes(input.slotIdx);
  } catch (err) {
    log.error("[runToggleException] invalid slotIdx", err);
    return { ok: false, formError: "משבצת זמן לא תקינה." };
  }

  try {
    const existing = (await deps.db
      .select({ id: tutorAvailability.id })
      .from(tutorAvailability)
      .where(
        and(
          eq(tutorAvailability.tutorUserId, deps.tutorUserId),
          eq(tutorAvailability.kind, input.kind),
          eq(tutorAvailability.date, input.dateIso),
          eq(tutorAvailability.startTime, times.startTime),
          eq(tutorAvailability.endTime, times.endTime),
        ),
      )) as ExistingSlotLookup[];

    if (existing.length > 0) {
      const deletedId = existing[0]!.id;
      await deps.db
        .delete(tutorAvailability)
        .where(eq(tutorAvailability.id, deletedId));
      await deps.db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "tutor.availability_exception_removed",
          actorKind: "user",
          actorId: deps.tutorUserId,
          targetType: "tutor_availability",
          targetId: deletedId,
          payload: {
            kind: input.kind,
            date: input.dateIso,
            startTime: times.startTime,
            endTime: times.endTime,
          },
        }),
      );
      return { ok: true };
    }

    const inserted = (await deps.db
      .insert(tutorAvailability)
      .values({
        tutorUserId: deps.tutorUserId,
        kind: input.kind,
        weekday: null,
        date: input.dateIso,
        startTime: times.startTime,
        endTime: times.endTime,
        validFrom: null,
        validUntil: null,
        createdByKind: "user",
        createdByActor: deps.tutorUserId,
      })
      .returning({ id: tutorAvailability.id })) as ExistingSlotLookup[];
    const newId = inserted[0]?.id;
    if (!newId) {
      log.error("[runToggleException] insert returned no id");
      return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
    }
    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "tutor.availability_exception_added",
        actorKind: "user",
        actorId: deps.tutorUserId,
        targetType: "tutor_availability",
        targetId: newId,
        payload: {
          kind: input.kind,
          date: input.dateIso,
          startTime: times.startTime,
          endTime: times.endTime,
        },
      }),
    );
    return { ok: true };
  } catch (err) {
    log.error("[runToggleException] failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
  }
}

/**
 * Quick action: delete every recurring rule for the given weekdays.
 * Used for "block weekend" (weekdays=[5,6] — Friday + Saturday) and
 * "block whole week" (weekdays=[0..6]).
 *
 * Writes a SINGLE audit row capturing the bulk operation (vs N individual
 * removed rows). Forensic-clarity trade-off accepted; the deleted-row count
 * is on the audit payload.
 */
export async function runBulkRemoveRecurring(
  input: { weekdays: number[] },
  deps: ScheduleDeps,
): Promise<ScheduleFlowResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };
  const cleanedWeekdays = Array.from(new Set(input.weekdays)).filter(isValidWeekday);
  if (cleanedWeekdays.length === 0) {
    return { ok: false, formError: "לא נבחרו ימים." };
  }

  try {
    await deps.db
      .delete(tutorAvailability)
      .where(
        and(
          eq(tutorAvailability.tutorUserId, deps.tutorUserId),
          eq(tutorAvailability.kind, "recurring"),
          inArray(tutorAvailability.weekday, cleanedWeekdays),
        ),
      );
    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "tutor.availability_bulk_cleared",
        actorKind: "user",
        actorId: deps.tutorUserId,
        targetType: "tutor",
        targetId: deps.tutorUserId,
        payload: {
          scope: "recurring",
          weekdays: cleanedWeekdays,
        },
      }),
    );
    return { ok: true };
  } catch (err) {
    log.error("[runBulkRemoveRecurring] failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
  }
}

/**
 * Bulk recurring-slot apply. Story 2.10 follow-up (founder direction
 * 2026-05-17 + Sally's UX call): the editor batches drag-paint + chip
 * macros into local state and commits via this single orchestrator on
 * "Save changes".
 *
 * Input format: lists of {weekday, slotIdx} cells to add OR remove.
 * Semantics:
 *   - Each ADD is idempotent: SELECT-first check for an existing
 *     (tutorUserId, kind='recurring', weekday, startTime, endTime); INSERT
 *     only if missing.
 *   - Each REMOVE is idempotent: SELECT-first; DELETE only if present.
 *   - Single audit row at the end summarizing the batch (added + removed
 *     counts + the cell tuples that actually moved). Forensic-clarity
 *     trade-off: a partial-failure scenario won't write the audit row at
 *     all, so the DB ends up consistent but the audit trail just shows
 *     "no batch happened" — call sites should retry on failure.
 *
 * Returns `{ ok: true }` on full success or `{ ok: false, formError }` on
 * any DB failure. Idempotency means safe-retry: the client can hit Save
 * again and operations already-applied no-op while the failed ones
 * re-attempt.
 */
export async function runBulkUpdateRecurring(
  input: {
    addCells: Array<{ weekday: number; slotIdx: number }>;
    removeCells: Array<{ weekday: number; slotIdx: number }>;
  },
  deps: ScheduleDeps,
): Promise<ScheduleFlowResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };

  // Normalize + validate the input upfront so we fail-fast before any DB writes.
  type Cell = { weekday: number; slotIdx: number; startTime: string; endTime: string };
  const adds: Cell[] = [];
  const removes: Cell[] = [];
  for (const c of input.addCells) {
    if (!isValidWeekday(c.weekday)) {
      return { ok: false, formError: "יום בשבוע לא תקין." };
    }
    let times: { startTime: string; endTime: string };
    try {
      times = slotTimes(c.slotIdx);
    } catch {
      return { ok: false, formError: "משבצת זמן לא תקינה." };
    }
    adds.push({ weekday: c.weekday, slotIdx: c.slotIdx, ...times });
  }
  for (const c of input.removeCells) {
    if (!isValidWeekday(c.weekday)) {
      return { ok: false, formError: "יום בשבוע לא תקין." };
    }
    let times: { startTime: string; endTime: string };
    try {
      times = slotTimes(c.slotIdx);
    } catch {
      return { ok: false, formError: "משבצת זמן לא תקינה." };
    }
    removes.push({ weekday: c.weekday, slotIdx: c.slotIdx, ...times });
  }
  if (adds.length === 0 && removes.length === 0) {
    return { ok: true }; // nothing to do; no audit row
  }

  try {
    const appliedAdds: Cell[] = [];
    const appliedRemoves: Cell[] = [];

    // 1. Idempotent removes first — if the same (weekday,slotIdx) appears in
    //    both adds and removes (shouldn't, but defensive) we end up with
    //    the row present.
    for (const c of removes) {
      const existing = (await deps.db
        .select({ id: tutorAvailability.id })
        .from(tutorAvailability)
        .where(
          and(
            eq(tutorAvailability.tutorUserId, deps.tutorUserId),
            eq(tutorAvailability.kind, "recurring"),
            eq(tutorAvailability.weekday, c.weekday),
            eq(tutorAvailability.startTime, c.startTime),
            eq(tutorAvailability.endTime, c.endTime),
          ),
        )) as ExistingSlotLookup[];
      if (existing.length === 0) continue;
      await deps.db
        .delete(tutorAvailability)
        .where(eq(tutorAvailability.id, existing[0]!.id));
      appliedRemoves.push(c);
    }

    // 2. Idempotent adds.
    for (const c of adds) {
      const existing = (await deps.db
        .select({ id: tutorAvailability.id })
        .from(tutorAvailability)
        .where(
          and(
            eq(tutorAvailability.tutorUserId, deps.tutorUserId),
            eq(tutorAvailability.kind, "recurring"),
            eq(tutorAvailability.weekday, c.weekday),
            eq(tutorAvailability.startTime, c.startTime),
            eq(tutorAvailability.endTime, c.endTime),
          ),
        )) as ExistingSlotLookup[];
      if (existing.length > 0) continue;
      await deps.db.insert(tutorAvailability).values({
        tutorUserId: deps.tutorUserId,
        kind: "recurring",
        weekday: c.weekday,
        date: null,
        startTime: c.startTime,
        endTime: c.endTime,
        validFrom: null,
        validUntil: null,
        createdByKind: "user",
        createdByActor: deps.tutorUserId,
      });
      appliedAdds.push(c);
    }

    // 3. Audit — single row. Only fire if anything actually moved.
    if (appliedAdds.length > 0 || appliedRemoves.length > 0) {
      await deps.db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "tutor.availability_recurring_bulk_updated",
          actorKind: "user",
          actorId: deps.tutorUserId,
          targetType: "tutor",
          targetId: deps.tutorUserId,
          payload: {
            addedCount: appliedAdds.length,
            removedCount: appliedRemoves.length,
            // Keep payload compact — cell tuples only. A 200-cell bulk
            // batch is still well under audit_events.payload jsonb size
            // limits.
            added: appliedAdds.map((c) => ({
              weekday: c.weekday,
              startTime: c.startTime,
              endTime: c.endTime,
            })),
            removed: appliedRemoves.map((c) => ({
              weekday: c.weekday,
              startTime: c.startTime,
              endTime: c.endTime,
            })),
          },
        }),
      );
    }

    return { ok: true };
  } catch (err) {
    log.error("[runBulkUpdateRecurring] failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
  }
}

/**
 * Bulk exception-slot apply. Story 2.10 follow-up 2026-05-18: Tab 2
 * ("היומן שלי") now batches drag-paint edits the same way Tab 1 does.
 *
 * Input format: arrays of `{date, slotIdx, kind}` to either ADD or
 * REMOVE. `kind` is "exception_blocked" or "exception_available";
 * removes operate by matching all three coordinates.
 *
 * Idempotent on both sides (SELECT-then-INSERT, SELECT-then-DELETE).
 * Single audit row at end. Same sequential-writes semantics as
 * `runBulkUpdateRecurring`.
 */
export async function runBulkUpdateExceptions(
  input: {
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
  },
  deps: ScheduleDeps,
): Promise<ScheduleFlowResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };

  type Cell = {
    dateIso: string;
    slotIdx: number;
    kind: "exception_blocked" | "exception_available";
    startTime: string;
    endTime: string;
  };
  const adds: Cell[] = [];
  const removes: Cell[] = [];

  function pushNormalized(c: typeof input.addCells[number], into: Cell[]): ScheduleFlowResult | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dateIso)) {
      return { ok: false, formError: "תאריך לא תקין." };
    }
    let times: { startTime: string; endTime: string };
    try {
      times = slotTimes(c.slotIdx);
    } catch {
      return { ok: false, formError: "משבצת זמן לא תקינה." };
    }
    into.push({ ...c, ...times });
    return null;
  }
  for (const c of input.addCells) {
    const err = pushNormalized(c, adds);
    if (err) return err;
  }
  for (const c of input.removeCells) {
    const err = pushNormalized(c, removes);
    if (err) return err;
  }
  if (adds.length === 0 && removes.length === 0) {
    return { ok: true };
  }

  try {
    const appliedAdds: Cell[] = [];
    const appliedRemoves: Cell[] = [];

    // Removes first.
    for (const c of removes) {
      const existing = (await deps.db
        .select({ id: tutorAvailability.id })
        .from(tutorAvailability)
        .where(
          and(
            eq(tutorAvailability.tutorUserId, deps.tutorUserId),
            eq(tutorAvailability.kind, c.kind),
            eq(tutorAvailability.date, c.dateIso),
            eq(tutorAvailability.startTime, c.startTime),
            eq(tutorAvailability.endTime, c.endTime),
          ),
        )) as ExistingSlotLookup[];
      if (existing.length === 0) continue;
      await deps.db
        .delete(tutorAvailability)
        .where(eq(tutorAvailability.id, existing[0]!.id));
      appliedRemoves.push(c);
    }

    // Adds.
    for (const c of adds) {
      const existing = (await deps.db
        .select({ id: tutorAvailability.id })
        .from(tutorAvailability)
        .where(
          and(
            eq(tutorAvailability.tutorUserId, deps.tutorUserId),
            eq(tutorAvailability.kind, c.kind),
            eq(tutorAvailability.date, c.dateIso),
            eq(tutorAvailability.startTime, c.startTime),
            eq(tutorAvailability.endTime, c.endTime),
          ),
        )) as ExistingSlotLookup[];
      if (existing.length > 0) continue;
      await deps.db.insert(tutorAvailability).values({
        tutorUserId: deps.tutorUserId,
        kind: c.kind,
        weekday: null,
        date: c.dateIso,
        startTime: c.startTime,
        endTime: c.endTime,
        validFrom: null,
        validUntil: null,
        createdByKind: "user",
        createdByActor: deps.tutorUserId,
      });
      appliedAdds.push(c);
    }

    if (appliedAdds.length > 0 || appliedRemoves.length > 0) {
      await deps.db.insert(auditEvents).values(
        toAuditEventValues({
          eventType: "tutor.availability_exceptions_bulk_updated",
          actorKind: "user",
          actorId: deps.tutorUserId,
          targetType: "tutor",
          targetId: deps.tutorUserId,
          payload: {
            addedCount: appliedAdds.length,
            removedCount: appliedRemoves.length,
            added: appliedAdds.map((c) => ({
              date: c.dateIso,
              kind: c.kind,
              startTime: c.startTime,
              endTime: c.endTime,
            })),
            removed: appliedRemoves.map((c) => ({
              date: c.dateIso,
              kind: c.kind,
              startTime: c.startTime,
              endTime: c.endTime,
            })),
          },
        }),
      );
    }
    return { ok: true };
  } catch (err) {
    log.error("[runBulkUpdateExceptions] failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
  }
}

/**
 * Quick action: delete EVERY availability row (recurring + exceptions) for
 * the tutor. "איפוס" — full reset.
 */
export async function runResetAllAvailability(
  deps: ScheduleDeps,
): Promise<ScheduleFlowResult> {
  const log = deps.logger ?? { error: (msg, err) => console.error(msg, err) };
  try {
    await deps.db
      .delete(tutorAvailability)
      .where(eq(tutorAvailability.tutorUserId, deps.tutorUserId));
    await deps.db.insert(auditEvents).values(
      toAuditEventValues({
        eventType: "tutor.availability_bulk_cleared",
        actorKind: "user",
        actorId: deps.tutorUserId,
        targetType: "tutor",
        targetId: deps.tutorUserId,
        payload: { scope: "all" },
      }),
    );
    return { ok: true };
  } catch (err) {
    log.error("[runResetAllAvailability] failed", err);
    return { ok: false, formError: "אירעה שגיאה. נסו שוב." };
  }
}
