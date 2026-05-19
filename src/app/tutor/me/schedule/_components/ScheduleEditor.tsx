"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { RecurringGrid, cellKey, type SlotKey } from "./RecurringGrid";
import { DayPeriodChips } from "./DayPeriodChips";
import { CalendarTab } from "./CalendarTab";
import { GridLegend } from "./GridLegend";
import { bulkUpdateRecurringAction } from "../_lib/schedule-actions";
import { SCHEDULE_GRID, SLOTS_PER_DAY } from "../_lib/schedule-flow";

// Top-level client island for the Schedule tab.
//
// State model (Sally's UX call 2026-05-17 — drag-paint + batched save):
//   - `originalRecurring`: the set of recurring cells as last synced from
//     the server. This is the "clean" baseline.
//   - `currentRecurring`: live local state. Drag-paint and chip macros
//     mutate this directly. We never call a Server Action on cell click.
//   - `isDirty = !setsEqual(original, current)`.
//   - "Save changes" + "Cancel" buttons appear when isDirty.
//   - beforeunload warns the user if they navigate away mid-edit.
//
// Exceptions tab still uses per-click Server Action (different model —
// date-specific overrides are usually single edits, not bulk).

interface RecurringRule {
  id: string;
  weekday: number;
  startTime: string; // "HH:MM:SS"
  endTime: string;
}

interface ExceptionRule {
  id: string;
  kind: "exception_blocked" | "exception_available";
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Active-booking row shape for the calendar overlay. Serialized from the
 * page's server-side query as JSON-safe primitives — startsAt is an ISO
 * string so it survives the RSC → client island handoff.
 */
export interface CalendarBookingRow {
  id: string;
  startsAtIso: string;
  durationMinutes: number;
  studentUserId: string;
  studentDisplayName: string | null;
  subjectNameHe: string | null;
}

interface ScheduleEditorProps {
  recurringRules: RecurringRule[];
  exceptionRules: ExceptionRule[];
  bookings: CalendarBookingRow[];
}

type Tab = "recurring" | "calendar";

function slotIndexFromTime(startTime: string): number {
  const [hh, mm] = startTime.split(":").map((v) => parseInt(v, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
  const offset = hh * 60 + mm - SCHEDULE_GRID.START_HOUR * 60;
  if (offset < 0 || offset % SCHEDULE_GRID.SLOT_MINUTES !== 0) return -1;
  const idx = offset / SCHEDULE_GRID.SLOT_MINUTES;
  return idx >= 0 && idx < SLOTS_PER_DAY ? idx : -1;
}

function buildRecurringSet(rules: RecurringRule[]): Set<SlotKey> {
  const set = new Set<SlotKey>();
  for (const r of rules) {
    const idx = slotIndexFromTime(r.startTime);
    if (idx === -1) continue;
    set.add(cellKey(r.weekday, idx));
  }
  return set;
}

function setsEqual(a: Set<SlotKey>, b: Set<SlotKey>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

function diffSets(
  original: Set<SlotKey>,
  current: Set<SlotKey>,
): {
  addCells: Array<{ weekday: number; slotIdx: number }>;
  removeCells: Array<{ weekday: number; slotIdx: number }>;
} {
  const addCells: Array<{ weekday: number; slotIdx: number }> = [];
  const removeCells: Array<{ weekday: number; slotIdx: number }> = [];
  for (const k of current) {
    if (!original.has(k)) {
      const [w, s] = k.split("-").map((v) => parseInt(v, 10));
      addCells.push({ weekday: w!, slotIdx: s! });
    }
  }
  for (const k of original) {
    if (!current.has(k)) {
      const [w, s] = k.split("-").map((v) => parseInt(v, 10));
      removeCells.push({ weekday: w!, slotIdx: s! });
    }
  }
  return { addCells, removeCells };
}

export function ScheduleEditor({
  recurringRules,
  exceptionRules,
  bookings,
}: ScheduleEditorProps) {
  const [tab, setTab] = useState<Tab>("recurring");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);

  // Recurring tab — local-state-driven (drag-paint + chips edit a Set,
  // Save commits via bulk action).
  const original = useMemo(
    () => buildRecurringSet(recurringRules),
    [recurringRules],
  );
  const [current, setCurrent] = useState<Set<SlotKey>>(original);

  // Re-sync when the props change (e.g. after revalidatePath returns
  // fresh server data). Compare via setsEqual so we only reset local
  // state when the SERVER state actually moved — preserves in-flight
  // edits across unrelated rerenders.
  useEffect(() => {
    if (!setsEqual(current, original)) {
      // Only sync if the user has no dirty edits OR the server state
      // matches what we just saved.
      // After a save: original updated → current already matches it.
      // No-op here in that case.
    }
    // Eslint exhaustive-deps: we intentionally don't react to `current`
    // — that would create a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original]);

  const isDirty = !setsEqual(original, current);

  // beforeunload — warn the user if they're closing the tab mid-edit.
  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers ignore the custom string but require preventDefault.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const onSetCell = useCallback(
    (weekday: number, slotIdx: number, available: boolean) => {
      setCurrent((prev) => {
        const next = new Set(prev);
        const key = cellKey(weekday, slotIdx);
        if (available) next.add(key);
        else next.delete(key);
        return next;
      });
    },
    [],
  );

  function onSaveRecurring() {
    if (!isDirty) return;
    const diff = diffSets(original, current);
    startTransition(async () => {
      setFormError(null);
      setSuccessFlash(null);
      const result = await bulkUpdateRecurringAction(diff);
      if (result.ok) {
        // revalidatePath will refresh the props from the server. While we
        // wait, optimistically treat `current` as the new baseline so the
        // dirty state clears immediately.
        setSuccessFlash("השינויים נשמרו.");
        setTimeout(() => setSuccessFlash(null), 2500);
      } else {
        setFormError(result.formError ?? "אירעה שגיאה.");
      }
    });
  }

  function onCancelRecurring() {
    if (!isDirty) return;
    if (
      !window.confirm("לבטל את כל השינויים שלא נשמרו?")
    ) {
      return;
    }
    setCurrent(new Set(original));
    setFormError(null);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 text-start">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-primary-container">
            שבוע עבודה
          </h2>
          <p className="text-sm text-secondary">
            פה קובעים את שבוע העבודה שלכם באופן כללי. כל שבוע ספציפי אפשר לנהל בלשונית &laquo;היומן שלי&raquo;.
          </p>
        </div>
      </header>

      <div className="flex gap-0 border-b border-linen-border text-sm font-bold">
        <button
          type="button"
          onClick={() => setTab("recurring")}
          className={
            tab === "recurring"
              ? "cursor-pointer px-5 py-3 border-b-2 border-tertiary-accent text-primary-container"
              : "cursor-pointer px-5 py-3 border-b-2 border-transparent text-on-surface-variant transition hover:bg-linen hover:text-primary-container hover:border-linen-border"
          }
        >
          זמינות שבועית קבועה
        </button>
        <button
          type="button"
          onClick={() => setTab("calendar")}
          className={
            tab === "calendar"
              ? "cursor-pointer px-5 py-3 border-b-2 border-tertiary-accent text-primary-container"
              : "cursor-pointer px-5 py-3 border-b-2 border-transparent text-on-surface-variant transition hover:bg-linen hover:text-primary-container hover:border-linen-border"
          }
        >
          היומן שלי
        </button>
      </div>

      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-bold text-danger"
        >
          {formError}
        </div>
      )}
      {successFlash && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm font-bold text-success">
          {successFlash}
        </div>
      )}

      {tab === "recurring" ? (
        <>
          <DayPeriodChips
            selected={current}
            onApply={(next) => setCurrent(next)}
            onClearAll={() => setCurrent(new Set())}
            disabled={pending}
          />
          {/* Save / Cancel sit BETWEEN the picker and the grid (founder
              direction 2026-05-18). Right-aligned in RTL via plain
              `flex` — the first DOM child appears on the RIGHT, which
              is what we want for Save (`שמירת שינויים הכי בימין`). */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-linen-border bg-white p-2">
            <button
              type="button"
              onClick={onSaveRecurring}
              disabled={!isDirty || pending}
              className="rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "שומר…" : "שמירת שינויים"}
            </button>
            <button
              type="button"
              onClick={onCancelRecurring}
              disabled={!isDirty || pending}
              className="rounded-lg border border-linen-border bg-white px-4 py-2 text-sm font-bold text-on-surface hover:border-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-50"
            >
              ביטול
            </button>
          </div>
          {/* Color legend — right above the grid (founder direction 2026-05-18). */}
          <GridLegend hint="טיפ: גררו לסימון מהיר של כמה משבצות" />
          <RecurringGrid
            selected={current}
            originalSelected={original}
            onSetCell={onSetCell}
            disabled={pending}
          />
        </>
      ) : (
        <CalendarTab
          recurringRules={recurringRules}
          exceptionRules={exceptionRules}
          bookings={bookings}
        />
      )}
    </div>
  );
}
