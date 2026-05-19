"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  SCHEDULE_GRID,
  SLOTS_PER_DAY,
  slotTimes,
} from "../_lib/schedule-flow";

// Recurring-tab grid. 7 weekday columns × 14 30-min rows = 98 cells.
//
// Interaction model (Sally's UX call 2026-05-17):
//   - Drag-paint: pointer-down on a cell captures the cell's *start state*
//     and sets the paint mode for the gesture. Drag through any number of
//     cells, release to end the gesture.
//       - pointer-down on EMPTY cell → "paint available"; cells under the
//         pointer become available.
//       - pointer-down on AVAILABLE cell → "paint clear"; cells under the
//         pointer become empty.
//   - The gesture is consistent start to finish — you can't accidentally
//     flip mid-drag.
//   - Touch fallback: tap-to-toggle on touch devices (no drag — fights
//     scroll).
//   - No save on click — `onCellsChanged` mutates the parent's LOCAL
//     state. The parent renders Save / Cancel and commits on demand.
//
// Visual + RTL same as the per-click version: plain `grid` + `flex`, no
// `flex-row-reverse`.

const WEEKDAY_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export type SlotKey = `${number}-${number}`;

export function cellKey(weekday: number, slotIdx: number): SlotKey {
  return `${weekday}-${slotIdx}` as SlotKey;
}

interface RecurringGridProps {
  /**
   * Set of currently-selected cells in the editor's LIVE local state.
   * Keyed by `${weekday}-${slotIdx}`. Parent owns this state; we read
   * for render + write via callbacks below.
   */
  selected: Set<SlotKey>;
  /**
   * Set of cells that were selected at the LAST SAVE. Drives the 3-color
   * visual: cells in BOTH original AND current = "saved" (dark green);
   * cells in current but NOT original = "pending add" (light green);
   * cells not in current = "not available" (gray). Founder direction
   * 2026-05-18.
   */
  originalSelected: Set<SlotKey>;
  /** Set a single cell to selected / not. */
  onSetCell: (weekday: number, slotIdx: number, available: boolean) => void;
  /** When true, the grid is read-only (e.g., while a save is in flight). */
  disabled?: boolean;
}

function timeLabel(slotIdx: number): string {
  return slotTimes(slotIdx).startTime.slice(0, 5); // "14:00"
}

const EMPTY_SET: Set<SlotKey> = new Set();

export function RecurringGrid({
  selected,
  // Default to empty set so HMR transient states (parent updates before
  // child reloads) don't crash with "undefined.has is not a function."
  originalSelected = EMPTY_SET,
  onSetCell,
  disabled,
}: RecurringGridProps) {
  // Gesture state — lives in refs so we don't trigger React rerenders on
  // every pointer move. The gesture is local to one drag; resetting on
  // pointer-up suffices.
  const paintModeRef = useRef<"fill" | "clear" | null>(null);
  // Track cells already painted in the current gesture so the same cell
  // doesn't toggle multiple times if the pointer re-enters it.
  const paintedThisGestureRef = useRef<Set<SlotKey>>(new Set());
  // Whether the gesture involves any actual painting (vs a single tap on
  // a touch device — handled in onPointerDown directly).
  const draggedRef = useRef(false);

  const endGesture = useCallback(() => {
    paintModeRef.current = null;
    paintedThisGestureRef.current = new Set();
    draggedRef.current = false;
  }, []);

  // Pointer-up should end the gesture even if released OUTSIDE the grid.
  useEffect(() => {
    function handleUp() {
      endGesture();
    }
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [endGesture]);

  function onCellPointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    weekday: number,
    slotIdx: number,
  ) {
    if (disabled) return;
    // Only react to primary button / touch / pen.
    if (e.button !== undefined && e.button !== 0) return;
    const key = cellKey(weekday, slotIdx);
    const isAvailable = selected.has(key);
    const mode: "fill" | "clear" = isAvailable ? "clear" : "fill";
    paintModeRef.current = mode;
    paintedThisGestureRef.current = new Set([key]);
    onSetCell(weekday, slotIdx, mode === "fill");
    // Release the implicit pointer capture so onPointerEnter fires on
    // other cells. Without this, on touch the gesture is locked to the
    // first cell.
    if ((e.target as Element).hasPointerCapture?.(e.pointerId)) {
      (e.target as Element).releasePointerCapture(e.pointerId);
    }
  }

  function onCellPointerEnter(weekday: number, slotIdx: number) {
    if (disabled) return;
    const mode = paintModeRef.current;
    if (mode === null) return;
    const key = cellKey(weekday, slotIdx);
    if (paintedThisGestureRef.current.has(key)) return;
    paintedThisGestureRef.current.add(key);
    draggedRef.current = true;
    onSetCell(weekday, slotIdx, mode === "fill");
  }

  const availableCount = selected.size;

  return (
    <section
      className="overflow-hidden rounded-xl border border-linen-border bg-white select-none"
      // Prevent text-selection while dragging across cells.
      style={{ touchAction: "pan-y" }}
    >
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Header row */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] text-xs">
            <div className="border-b border-linen-border p-2" />
            {WEEKDAY_HE.map((name, idx) => (
              <div
                key={idx}
                className={
                  idx === 6
                    ? "border-b border-s border-linen-border p-2 text-center font-bold text-secondary"
                    : "border-b border-s border-linen-border p-2 text-center font-bold text-primary-container"
                }
              >
                {name}
              </div>
            ))}
          </div>

          {/* Body rows */}
          {Array.from({ length: SLOTS_PER_DAY }, (_, slotIdx) => (
            <div
              key={slotIdx}
              className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-linen-border"
            >
              <div className="border-s border-linen-border p-2 text-center text-[11px] text-secondary">
                {timeLabel(slotIdx)}
              </div>
              {WEEKDAY_HE.map((_, weekday) => {
                const key = cellKey(weekday, slotIdx);
                const isAvailable = selected.has(key);
                const wasSaved = originalSelected.has(key);
                // 3-color scheme:
                //   - dark green: in BOTH original AND current → saved-clean
                //   - light green: in current, NOT in original → pending-add
                //   - gray: not in current (whether original or not — pending
                //     removes also show as gray to preview the post-save state)
                // 3-color: green (saved-clean) / light-green (pending) /
                // gray (not available). Uses `--success` (#059669) instead
                // of `tertiary-fixed` (#ffdea5 — peachy yellow); founder
                // direction 2026-05-18 wants actual green.
                const cellClass = isAvailable
                  ? wasSaved
                    ? "bg-success hover:bg-success/85"
                    : "bg-success/40 hover:bg-success/55 outline outline-1 outline-success outline-offset-[-2px]"
                  : "bg-surface-container hover:bg-linen";
                return (
                  <button
                    type="button"
                    key={weekday}
                    disabled={disabled}
                    onPointerDown={(e) => onCellPointerDown(e, weekday, slotIdx)}
                    onPointerEnter={() => onCellPointerEnter(weekday, slotIdx)}
                    aria-pressed={isAvailable}
                    aria-label={`${WEEKDAY_HE[weekday]} ${timeLabel(slotIdx)} — ${isAvailable ? (wasSaved ? "זמין (שמור)" : "זמין (לא נשמר)") : "לא זמין"}`}
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

      {/* Footer — legend + count */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linen-border p-3 text-xs">
        <span className="text-secondary">
          <span className="font-bold text-primary-container">{availableCount}</span>{" "}
          משבצות זמינות בשבוע
        </span>
      </div>
    </section>
  );
}
