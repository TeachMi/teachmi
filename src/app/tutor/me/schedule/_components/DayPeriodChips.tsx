"use client";

import { useState } from "react";
import { cellKey, type SlotKey } from "./RecurringGrid";
import {
  PERIOD_DEFS,
  SLOTS_PER_DAY,
  type PeriodKey,
} from "../_lib/schedule-flow";

// Two macro panels:
//
//   1. הוספה מהירה (Quick Adds) — three one-click TOGGLE chips
//      (בוקר/צהריים/ערב × Sun-Thu). Click adds the macro's cells; click
//      again removes them. The chip's "on" state is derived from whether
//      all its cells are currently in the selection — there's no separate
//      template-state persisted anywhere; saving persists only the cells.
//
//   2. סימון מהיר לפי ימים וזמנים — multi-select Day chips and multi-
//      select Period chips. The intersection (picked days × picked
//      periods × that period's slots) becomes pending immediately on
//      any chip click; no Apply button. Toggling a chip OFF removes
//      that contribution. The intersection set's prior contribution is
//      tracked across renders so we apply only the DIFF to the parent's
//      `selected` Set — preserving any drag-paint additions outside the
//      chips' intersection.
//
// Founder direction 2026-05-18:
//   - "no, add the light green just by clicking on the day and time."
//   - "סמנו כזמין should be where we save" → the Save button (in
//     EditorTopBar) takes that role; this panel no longer has an Apply
//     button.

const WEEKDAY_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface DayPeriodChipsProps {
  selected: Set<SlotKey>;
  /** Bulk-replace the selected set with a fresh Set computed here. */
  onApply: (nextSelected: Set<SlotKey>) => void;
  /**
   * "נקה הכל" — clears the entire selection. Lives inline with the
   * Quick Adds row (founder direction 2026-05-18). Wired by the parent
   * to `setCurrent(new Set())`; the user still has to Save to persist,
   * or Cancel to undo.
   */
  onClearAll?: () => void;
  disabled?: boolean;
}

interface QuickAdd {
  key: PeriodKey;
  labelHe: string;
}

const QUICK_ADDS: QuickAdd[] = [
  { key: "morning", labelHe: "בוקר א׳–ה׳" },
  { key: "afternoon", labelHe: "צהריים א׳–ה׳" },
  { key: "evening", labelHe: "ערב א׳–ה׳" },
];

function quickAddCellSet(periodKey: PeriodKey): Set<SlotKey> {
  const set = new Set<SlotKey>();
  const period = PERIOD_DEFS.find((p) => p.key === periodKey);
  if (!period) return set;
  for (let d = 0; d <= 4; d++) {
    for (let s = period.slotStart; s <= period.slotEnd && s < SLOTS_PER_DAY; s++) {
      set.add(cellKey(d, s));
    }
  }
  return set;
}

function isSupersetOf(selected: Set<SlotKey>, subset: Set<SlotKey>): boolean {
  for (const k of subset) {
    if (!selected.has(k)) return false;
  }
  return true;
}

/** Cells implied by the current (days × periods) intersection. */
function buildImpliedSet(
  pickedDays: Set<number>,
  pickedPeriods: Set<PeriodKey>,
): Set<SlotKey> {
  const set = new Set<SlotKey>();
  for (const d of pickedDays) {
    for (const periodKey of pickedPeriods) {
      const period = PERIOD_DEFS.find((p) => p.key === periodKey);
      if (!period) continue;
      for (let s = period.slotStart; s <= period.slotEnd && s < SLOTS_PER_DAY; s++) {
        set.add(cellKey(d, s));
      }
    }
  }
  return set;
}

export function DayPeriodChips({
  selected,
  onApply,
  onClearAll,
  disabled,
}: DayPeriodChipsProps) {
  const [pickedDays, setPickedDays] = useState<Set<number>>(new Set());
  const [pickedPeriods, setPickedPeriods] = useState<Set<PeriodKey>>(new Set());

  // Apply the (days × periods) diff inline at click time. We avoid
  // `useEffect` + refs because the React 19 lint rules forbid reading
  // OR writing `ref.current` during render. Click handlers run AFTER
  // render so all state we need is already settled.
  function applyChipDiff(
    oldDays: Set<number>,
    oldPeriods: Set<PeriodKey>,
    newDays: Set<number>,
    newPeriods: Set<PeriodKey>,
  ) {
    const oldImplied = buildImpliedSet(oldDays, oldPeriods);
    const newImplied = buildImpliedSet(newDays, newPeriods);
    let changed = false;
    const next = new Set(selected);
    for (const k of newImplied) {
      if (!oldImplied.has(k)) {
        next.add(k);
        changed = true;
      }
    }
    for (const k of oldImplied) {
      if (!newImplied.has(k)) {
        next.delete(k);
        changed = true;
      }
    }
    if (changed) onApply(next);
  }

  function toggleDay(d: number) {
    if (disabled) return;
    const newDays = new Set(pickedDays);
    if (newDays.has(d)) newDays.delete(d);
    else newDays.add(d);
    applyChipDiff(pickedDays, pickedPeriods, newDays, pickedPeriods);
    setPickedDays(newDays);
  }
  function togglePeriod(p: PeriodKey) {
    if (disabled) return;
    const newPeriods = new Set(pickedPeriods);
    if (newPeriods.has(p)) newPeriods.delete(p);
    else newPeriods.add(p);
    applyChipDiff(pickedDays, pickedPeriods, pickedDays, newPeriods);
    setPickedPeriods(newPeriods);
  }

  function toggleQuickAdd(periodKey: PeriodKey) {
    if (disabled) return;
    const macroCells = quickAddCellSet(periodKey);
    const next = new Set(selected);
    if (isSupersetOf(selected, macroCells)) {
      for (const k of macroCells) next.delete(k);
    } else {
      for (const k of macroCells) next.add(k);
    }
    onApply(next);
  }

  return (
    <section className="space-y-3">
      {/* Quick Adds */}
      <div className="rounded-xl border border-linen-border bg-linen p-4 text-start">
        <h3 className="mb-2 font-display text-sm font-bold text-primary-container">
          הוספה מהירה
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_ADDS.map((q) => {
            const macroCells = quickAddCellSet(q.key);
            const isActive = isSupersetOf(selected, macroCells);
            return (
              <button
                type="button"
                key={q.key}
                onClick={() => toggleQuickAdd(q.key)}
                disabled={disabled}
                aria-pressed={isActive}
                className={[
                  "rounded-full border px-4 py-2 text-xs font-bold transition",
                  isActive
                    ? "border-success bg-success text-white"
                    : "border-primary-fixed-dim bg-white text-primary-container hover:bg-primary-fixed/30",
                  "disabled:cursor-wait disabled:opacity-60",
                ].join(" ")}
              >
                {q.labelHe}
              </button>
            );
          })}
          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              disabled={disabled || selected.size === 0}
              className="ms-2 rounded-full border border-danger/40 bg-white px-4 py-2 text-xs font-bold text-danger hover:border-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              נקה הכל
            </button>
          )}
        </div>
      </div>

      {/* Day × Period — reactive, no Apply button */}
      <div className="rounded-xl border border-linen-border bg-linen p-4 text-start">
        <h3 className="mb-3 font-display text-sm font-bold text-primary-container">
          סימון לפי ימים וזמנים
        </h3>
        <p className="mb-3 text-[11px] text-secondary">
          בחרו ימים וזמנים — המשבצות יסומנו מיד.
        </p>

        <div className="mb-3">
          <div className="mb-1 text-xs text-secondary">ימים</div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_HE.map((name, idx) => {
              const isPicked = pickedDays.has(idx);
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  disabled={disabled}
                  aria-pressed={isPicked}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-bold transition",
                    isPicked
                      ? "border-success bg-success text-white"
                      : "border-linen-border bg-white text-on-surface hover:border-primary-fixed-dim",
                    "disabled:cursor-wait disabled:opacity-60",
                  ].join(" ")}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs text-secondary">זמנים</div>
          <div className="flex flex-wrap gap-2">
            {PERIOD_DEFS.map((period) => {
              const isPicked = pickedPeriods.has(period.key);
              return (
                <button
                  type="button"
                  key={period.key}
                  onClick={() => togglePeriod(period.key)}
                  disabled={disabled}
                  aria-pressed={isPicked}
                  className={[
                    "rounded-full border px-4 py-1.5 text-xs font-bold transition",
                    isPicked
                      ? "border-success bg-success text-white"
                      : "border-linen-border bg-white text-on-surface hover:border-primary-fixed-dim",
                    "disabled:cursor-wait disabled:opacity-60",
                  ].join(" ")}
                >
                  {period.labelHe}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
