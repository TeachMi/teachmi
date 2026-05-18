"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SLOTS_PER_DAY } from "../_lib/schedule-flow";
import { bulkUpdateExceptionsAction } from "../_lib/schedule-actions";
import { GridLegend } from "./GridLegend";
import {
  addDaysIl,
  formatIlDayLabel,
  slotTimeLabel,
  startOfWeekIl,
  todayIsoIl,
  unfoldAvailability,
  type UnfoldedSchedule,
} from "../_lib/unfold-availability";

// "היומן שלי" tab (Sally's drag-paint + Save model 2026-05-18 — extended
// from Tab 1). Per founder direction: Tab 2 now uses the SAME drag-paint
// + Save/Cancel pattern as Tab 1 instead of per-click Server Actions.
//
// State model:
//   - `originalState`: the slot-state map for the visible week as
//     unfolded from the server props (recurring + exceptions).
//   - `currentState`: a Map<`${date}-${slotIdx}`, boolean> of the
//     tutor's INTENDED state (true = available, false = not). Drag-paint
//     mutates this directly.
//   - On Save: compute the exception diff vs originalState and fire
//     `bulkUpdateExceptionsAction`.
//
// Color scheme matches Tab 1's 3-color:
//   - dark green: in originalState available AND currentState available
//   - light green: in currentState available but NOT in originalState
//     (pending-add — will become an exception_available on save, or
//     remove an exception_blocked depending on the original kind)
//   - gray: currentState says not-available (whether original was
//     available-via-recurring or empty — both render gray to preview
//     the post-save state)

const WEEK_COUNT = 4;
const WEEKDAY_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface RecurringRule {
  weekday: number;
  startTime: string;
  endTime: string;
}
interface ExceptionRule {
  id: string;
  kind: "exception_blocked" | "exception_available";
  date: string;
  startTime: string;
  endTime: string;
}

interface CalendarTabProps {
  recurringRules: RecurringRule[];
  exceptionRules: ExceptionRule[];
}

type CellKey = `${string}-${number}`;

function cellKey(dateIso: string, slotIdx: number): CellKey {
  return `${dateIso}-${slotIdx}` as CellKey;
}

function isAvailableInUnfolded(
  unfolded: UnfoldedSchedule,
  dateIso: string,
  slotIdx: number,
): boolean {
  const state = unfolded.get(dateIso)?.get(slotIdx);
  return state?.kind === "available";
}

/**
 * Original-source classifier for a cell — tells the diff logic what kind
 * of exception (if any) was BACKING the cell's saved availability.
 *
 *   - recurring         → underlying recurring rule says available
 *   - exception_available  → exception row makes the cell available
 *   - exception_blocked → exception row blocks the cell
 *   - empty             → no rule of any kind for this cell
 */
type OriginalSource =
  | "recurring"
  | "exception_available"
  | "exception_blocked"
  | "empty";

function classifyOriginal(
  unfolded: UnfoldedSchedule,
  dateIso: string,
  slotIdx: number,
): OriginalSource {
  const state = unfolded.get(dateIso)?.get(slotIdx);
  if (!state) return "empty";
  if (state.kind === "blocked") return "exception_blocked";
  if (state.kind === "available") {
    return state.source === "recurring" ? "recurring" : "exception_available";
  }
  return "empty";
}

export function CalendarTab({
  recurringRules,
  exceptionRules,
}: CalendarTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);

  const today = todayIsoIl();
  const weekStart = useMemo(
    () => addDaysIl(startOfWeekIl(today), weekOffset * 7),
    [today, weekOffset],
  );
  const weekEnd = useMemo(() => addDaysIl(weekStart, 6), [weekStart]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 7; i++) out.push(addDaysIl(weekStart, i));
    return out;
  }, [weekStart]);

  // ORIGINAL — unfold the recurring + exception rules onto the visible week.
  const originalUnfolded = useMemo(
    () =>
      unfoldAvailability({
        recurringRules: recurringRules.map((r) => ({
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
        })),
        exceptionRules,
        dateRange: { from: weekStart, to: weekEnd },
      }),
    [recurringRules, exceptionRules, weekStart, weekEnd],
  );

  // CURRENT — seeded from original; drag-paint mutates this in place.
  const buildInitialCurrent = useCallback((): Map<CellKey, boolean> => {
    const out = new Map<CellKey, boolean>();
    for (const dateIso of days) {
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        out.set(cellKey(dateIso, s), isAvailableInUnfolded(originalUnfolded, dateIso, s));
      }
    }
    return out;
  }, [days, originalUnfolded]);

  const [current, setCurrent] = useState<Map<CellKey, boolean>>(buildInitialCurrent);

  // Re-seed `current` from the fresh original when the week changes OR
  // when the server props refresh post-Save. React 19's
  // setState-during-render pattern for derived state, tracking the
  // identity of `originalUnfolded` (a Map whose useMemo identity changes
  // exactly when one of its inputs — recurringRules / exceptionRules /
  // weekStart — changes).
  //
  // Why identity-based, not size-based (the prior version's bug): a save
  // that adds N exceptions and removes the same N rows leaves
  // exceptionRules.length unchanged. A size-based seed key wouldn't
  // detect the prop refresh, so `current` would remain mid-edit and
  // isDirty would stay true even after a successful save.
  // Ref: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [seededFrom, setSeededFrom] = useState<typeof originalUnfolded | null>(null);
  if (seededFrom !== originalUnfolded) {
    setSeededFrom(originalUnfolded);
    setCurrent(buildInitialCurrent());
  }

  // Dirty detection — compare current cell-by-cell to original.
  const isDirty = useMemo(() => {
    for (const dateIso of days) {
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        const cur = current.get(cellKey(dateIso, s)) ?? false;
        const orig = isAvailableInUnfolded(originalUnfolded, dateIso, s);
        if (cur !== orig) return true;
      }
    }
    return false;
  }, [current, originalUnfolded, days]);

  // beforeunload guard while dirty.
  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // --- Drag-paint state (mirrors RecurringGrid) ---
  const paintModeRef = useRef<"fill" | "clear" | null>(null);
  const paintedThisGestureRef = useRef<Set<CellKey>>(new Set());

  useEffect(() => {
    function endGesture() {
      paintModeRef.current = null;
      paintedThisGestureRef.current = new Set();
    }
    window.addEventListener("pointerup", endGesture);
    window.addEventListener("pointercancel", endGesture);
    return () => {
      window.removeEventListener("pointerup", endGesture);
      window.removeEventListener("pointercancel", endGesture);
    };
  }, []);

  function setCell(dateIso: string, slotIdx: number, available: boolean) {
    setCurrent((prev) => {
      const next = new Map(prev);
      next.set(cellKey(dateIso, slotIdx), available);
      return next;
    });
  }

  function onCellPointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    dateIso: string,
    slotIdx: number,
  ) {
    if (pending) return;
    if (e.button !== undefined && e.button !== 0) return;
    const key = cellKey(dateIso, slotIdx);
    const isAvailable = current.get(key) ?? false;
    const mode: "fill" | "clear" = isAvailable ? "clear" : "fill";
    paintModeRef.current = mode;
    paintedThisGestureRef.current = new Set([key]);
    setCell(dateIso, slotIdx, mode === "fill");
    if ((e.target as Element).hasPointerCapture?.(e.pointerId)) {
      (e.target as Element).releasePointerCapture(e.pointerId);
    }
  }

  function onCellPointerEnter(dateIso: string, slotIdx: number) {
    if (pending) return;
    const mode = paintModeRef.current;
    if (mode === null) return;
    const key = cellKey(dateIso, slotIdx);
    if (paintedThisGestureRef.current.has(key)) return;
    paintedThisGestureRef.current.add(key);
    setCell(dateIso, slotIdx, mode === "fill");
  }

  // --- Save / Cancel ---
  function onSave() {
    if (!isDirty) return;
    // Compute exception diff. For each cell where current !== original,
    // emit the right INSERT / DELETE per the original's source.
    const addCells: Array<{
      dateIso: string;
      slotIdx: number;
      kind: "exception_blocked" | "exception_available";
    }> = [];
    const removeCells: typeof addCells = [];
    for (const dateIso of days) {
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        const cur = current.get(cellKey(dateIso, s)) ?? false;
        const orig = isAvailableInUnfolded(originalUnfolded, dateIso, s);
        if (cur === orig) continue;
        const source = classifyOriginal(originalUnfolded, dateIso, s);
        if (cur && !orig) {
          // current=available, original=not. Two cases:
          //   - original=empty            → INSERT exception_available
          //   - original=exception_blocked → DELETE the blocked exception
          if (source === "exception_blocked") {
            removeCells.push({ dateIso, slotIdx: s, kind: "exception_blocked" });
          } else {
            addCells.push({ dateIso, slotIdx: s, kind: "exception_available" });
          }
        } else {
          // current=not, original=available. Two cases:
          //   - original=recurring             → INSERT exception_blocked
          //   - original=exception_available   → DELETE the available exception
          if (source === "exception_available") {
            removeCells.push({ dateIso, slotIdx: s, kind: "exception_available" });
          } else {
            addCells.push({ dateIso, slotIdx: s, kind: "exception_blocked" });
          }
        }
      }
    }

    setPending(true);
    setFormError(null);
    setSuccessFlash(null);
    bulkUpdateExceptionsAction({ addCells, removeCells }).then((result) => {
      setPending(false);
      if (result.ok) {
        setSuccessFlash("השינויים נשמרו.");
        setTimeout(() => setSuccessFlash(null), 2500);
      } else {
        setFormError(result.formError ?? "אירעה שגיאה.");
      }
    });
  }

  function onCancel() {
    if (!isDirty) return;
    if (!window.confirm("לבטל את כל השינויים שלא נשמרו?")) return;
    setCurrent(buildInitialCurrent());
    setFormError(null);
  }

  return (
    <section className="space-y-4">
      {/* Week navigator */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-on-surface">שבוע:</span>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: WEEK_COUNT }, (_, idx) => {
            const start = addDaysIl(startOfWeekIl(today), idx * 7);
            const end = addDaysIl(start, 6);
            const isActive = idx === weekOffset;
            return (
              <button
                type="button"
                key={idx}
                onClick={() => {
                  if (isDirty && idx !== weekOffset) {
                    if (
                      !window.confirm(
                        "יש שינויים שלא נשמרו בשבוע הנוכחי. החלפת שבוע תאבד אותם. להמשיך?",
                      )
                    )
                      return;
                  }
                  setWeekOffset(idx);
                }}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "rounded-lg border border-tertiary-accent bg-tertiary-fixed px-3 py-1.5 text-xs font-bold text-on-tertiary-fixed-variant"
                    : "rounded-lg border border-linen-border bg-white px-3 py-1.5 text-xs font-bold text-on-surface hover:border-primary-fixed-dim"
                }
              >
                {formatIlDayLabel(start)} – {formatIlDayLabel(end)}
              </button>
            );
          })}
        </div>
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

      {/* Save/Cancel — between the week navigator and the grid. Right-
          aligned via plain `flex` so the first DOM child (Save) appears
          on the RIGHT edge in RTL. Founder direction 2026-05-18. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-linen-border bg-white p-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || pending}
          className="rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "שומר…" : "שמירת שינויים"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={!isDirty || pending}
          className="rounded-lg border border-linen-border bg-white px-4 py-2 text-sm font-bold text-on-surface hover:border-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-50"
        >
          ביטול
        </button>
      </div>

      <GridLegend hint="טיפ: גררו לשינוי מהיר של כמה משבצות" />

      {/* 7-day grid for the selected week */}
      <div
        className="overflow-hidden rounded-xl border border-linen-border bg-white select-none"
        style={{ touchAction: "pan-y" }}
      >
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[60px_repeat(7,1fr)] text-xs">
              <div className="border-b border-linen-border p-2" />
              {days.map((dateIso, idx) => (
                <div
                  key={dateIso}
                  className={
                    idx === 6
                      ? "border-b border-s border-linen-border p-2 text-center text-secondary"
                      : "border-b border-s border-linen-border p-2 text-center text-primary-container"
                  }
                >
                  <div className="font-bold">{WEEKDAY_HE[idx]}</div>
                  <div className="text-[11px]">{formatIlDayLabel(dateIso)}</div>
                </div>
              ))}
            </div>

            {Array.from({ length: SLOTS_PER_DAY }, (_, slotIdx) => (
              <div
                key={slotIdx}
                className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-linen-border"
              >
                <div className="border-s border-linen-border p-2 text-center text-[11px] text-secondary">
                  {slotTimeLabel(slotIdx)}
                </div>
                {days.map((dateIso) => {
                  const key = cellKey(dateIso, slotIdx);
                  const isAvailable = current.get(key) ?? false;
                  const wasOriginalAvailable = isAvailableInUnfolded(
                    originalUnfolded,
                    dateIso,
                    slotIdx,
                  );
                  // 3-color: saved-clean = dark green; pending = light
                  // green; gray covers not-available (including pending-
                  // remove).
                  // Same 3-color scheme as RecurringGrid (Sally + founder
                  // 2026-05-18): green (saved), light-green (pending),
                  // gray (not available).
                  const cellClass = isAvailable
                    ? wasOriginalAvailable
                      ? "bg-success hover:bg-success/85"
                      : "bg-success/40 hover:bg-success/55 outline outline-1 outline-success outline-offset-[-2px]"
                    : "bg-surface-container hover:bg-linen";
                  return (
                    <button
                      type="button"
                      key={key}
                      disabled={pending}
                      onPointerDown={(e) => onCellPointerDown(e, dateIso, slotIdx)}
                      onPointerEnter={() => onCellPointerEnter(dateIso, slotIdx)}
                      aria-pressed={isAvailable}
                      className={[
                        "h-9 border-s border-linen-border transition",
                        cellClass,
                        "disabled:cursor-wait disabled:opacity-60",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tertiary-accent",
                      ].join(" ")}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
