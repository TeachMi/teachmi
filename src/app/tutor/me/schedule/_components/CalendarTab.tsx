"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SLOTS_PER_DAY } from "../_lib/schedule-flow";
import { bulkUpdateExceptionsAction } from "../_lib/schedule-actions";
import { GridLegend } from "./GridLegend";
import { BookingPeekModal } from "@/components/booking/BookingPeekModal";
import type { CalendarBookingRow } from "./ScheduleEditor";
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
  /**
   * Active bookings to overlay. Area 1 (2026-05-19) — rendered as `booked`
   * cells via unfoldAvailability + a peek modal on click. Empty array
   * means "no overlay" (fail-OPEN from the server query).
   */
  bookings: CalendarBookingRow[];
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
  bookings,
}: CalendarTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);

  // Cross-cell hover state — when the user hovers ANY slot of a multi-slot
  // booking, the entire band lights up as one object (founder feedback
  // 2026-05-19 r2: "should highlight the 2 or more squares as a single
  // clickable cell").
  //
  // r3 (2026-05-19 evening): plain mouseenter/leave produced a 1-frame
  // flicker when the cursor crossed an internal cell-to-cell boundary —
  // cell A's leave fired BEFORE cell B's enter, briefly clearing the
  // hover state. The fix: defer the clear via rAF, and any sibling
  // enter cancels the pending clear before it lands. Net effect — the
  // band stays continuously hovered while the cursor is anywhere on it.
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);
  const pendingHoverClearRef = useRef<number | null>(null);
  const handleBookedHoverChange = useCallback(
    (bookingId: string, hovered: boolean) => {
      // Cancel any pending clear — either we're entering a sibling cell
      // of the same booking (keep hover) or hovering a different booking
      // entirely (replace the id, no clear needed).
      if (pendingHoverClearRef.current !== null) {
        cancelAnimationFrame(pendingHoverClearRef.current);
        pendingHoverClearRef.current = null;
      }
      if (hovered) {
        setHoveredBookingId(bookingId);
        return;
      }
      // Leave — defer the actual clear by one frame so any sibling
      // mouseenter (firing immediately after this leave) gets a chance
      // to cancel it. If the cursor genuinely left the band, no enter
      // arrives and the clear lands.
      pendingHoverClearRef.current = requestAnimationFrame(() => {
        pendingHoverClearRef.current = null;
        setHoveredBookingId((prev) => (prev === bookingId ? null : prev));
      });
    },
    [],
  );

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

  // Bookings overlay — pass minimal shape to unfoldAvailability; keep the
  // rich shape in a separate lookup map so the renderer can render student
  // name / subject / time inside booked cells without a parallel join.
  const bookingsForUnfold = useMemo(
    () =>
      bookings.map((b) => ({
        id: b.id,
        startsAt: new Date(b.startsAtIso),
        durationMinutes: b.durationMinutes,
      })),
    [bookings],
  );
  const bookingById = useMemo(() => {
    const m = new Map<string, CalendarBookingRow>();
    for (const b of bookings) m.set(b.id, b);
    return m;
  }, [bookings]);

  // ORIGINAL — unfold the recurring + exception rules + active bookings
  // onto the visible week.
  const originalUnfolded = useMemo(
    () =>
      unfoldAvailability({
        recurringRules: recurringRules.map((r) => ({
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
        })),
        exceptionRules,
        bookings: bookingsForUnfold,
        dateRange: { from: weekStart, to: weekEnd },
      }),
    [recurringRules, exceptionRules, bookingsForUnfold, weekStart, weekEnd],
  );

  /** True when the cell is occupied by an active booking. Booked cells
   *  are non-editable — drag-paint skips them entirely, click opens the
   *  peek modal instead. */
  function getBookedAt(dateIso: string, slotIdx: number): {
    bookingId: string;
    booking: CalendarBookingRow;
  } | null {
    const state = originalUnfolded.get(dateIso)?.get(slotIdx);
    if (state?.kind !== "booked") return null;
    const booking = bookingById.get(state.bookingId);
    if (!booking) return null;
    return { bookingId: state.bookingId, booking };
  }

  /** First slot of a booking on a given date — the slot where rich cell
   *  content (name, subject, time) is rendered. Subsequent slots in the
   *  same booking render the same fill but no text, to read as one band. */
  function isBookingHeadSlot(
    dateIso: string,
    slotIdx: number,
    booking: CalendarBookingRow,
  ): boolean {
    if (slotIdx === 0) return true;
    const prev = originalUnfolded.get(dateIso)?.get(slotIdx - 1);
    return !(prev?.kind === "booked" && prev.bookingId === booking.id);
  }

  /** Last slot of a booking on a given date — used to decide whether to
   *  cover the row-separator border below this cell. Non-tail slots mask
   *  the row's bottom border with a pseudo-element so the band reads as
   *  one continuous object (founder feedback 2026-05-19). */
  function isBookingTailSlot(
    dateIso: string,
    slotIdx: number,
    booking: CalendarBookingRow,
  ): boolean {
    if (slotIdx === SLOTS_PER_DAY - 1) return true;
    const next = originalUnfolded.get(dateIso)?.get(slotIdx + 1);
    return !(next?.kind === "booked" && next.bookingId === booking.id);
  }

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

  // Cancel any pending rAF-deferred hover clear on unmount so a stale
  // callback doesn't try to setState on an unmounted CalendarTab.
  useEffect(() => {
    return () => {
      if (pendingHoverClearRef.current !== null) {
        cancelAnimationFrame(pendingHoverClearRef.current);
        pendingHoverClearRef.current = null;
      }
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
    // Booked cells are non-editable — they render as a peek trigger and
    // never reach this paint handler in the first place. Defensive guard
    // so a future caller change can't accidentally start a paint gesture
    // on a booked slot.
    if (getBookedAt(dateIso, slotIdx)) return;
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
    // Booked cells eat the paint gesture — the brush passes "over" them
    // without toggling. Critical for the orphan-and-leave invariant: a
    // tutor drag-painting through a row of booked lessons must never
    // unbook one as a side-effect.
    if (getBookedAt(dateIso, slotIdx)) return;
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

                  // Booked cells take priority — render a peek trigger,
                  // not a paint button. The trigger is wrapped in
                  // BookingPeekModal which exposes the canonical "I tapped
                  // a booking" interaction (peek detail + 2 actions).
                  const booked = getBookedAt(dateIso, slotIdx);
                  if (booked) {
                    const isHead = isBookingHeadSlot(
                      dateIso,
                      slotIdx,
                      booked.booking,
                    );
                    const isTail = isBookingTailSlot(
                      dateIso,
                      slotIdx,
                      booked.booking,
                    );
                    return (
                      <BookedCell
                        key={key}
                        dateIso={dateIso}
                        booking={booked.booking}
                        isHead={isHead}
                        isTail={isTail}
                        isHovered={hoveredBookingId === booked.bookingId}
                        onHoverChange={(hovered) =>
                          handleBookedHoverChange(booked.bookingId, hovered)
                        }
                      />
                    );
                  }

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

// ---------------------------------------------------------------------------
// BookedCell — Area 1 (2026-05-19). Renders a 30-min cell that's covered
// by an active booking. Visual is self-contained (doesn't lean on the
// available-green underneath — necessary for orphan bookings sitting on
// what is otherwise a "not-available" cell). Click opens the canonical
// BookingPeekModal.
//
// Founder feedback 2026-05-19:
//   - "טעות בלוח" wasn't clear → handled in CancelLessonModal.
//   - Adjacent slots of the same booking showed a 1px row-separator
//     between them, breaking the "single clickable object" feel. The
//     overlay :after element below covers that row-divider for non-tail
//     slots so a 60/75/90-min booking reads as one continuous band.
//   - r2: keep the muted `primary-fixed` teal (the deep forest variant
//     was "not nice"). The cross-cell hover state (driven from
//     CalendarTab via `isHovered`/`onHoverChange`) lights up the whole
//     band on hover-over-any-slot, so "single clickable cell" is read
//     through hover behavior rather than aggressive baseline color.
// ---------------------------------------------------------------------------
function BookedCell({
  dateIso,
  booking,
  isHead,
  isTail,
  isHovered,
  onHoverChange,
}: {
  dateIso: string;
  booking: CalendarBookingRow;
  isHead: boolean;
  isTail: boolean;
  isHovered: boolean;
  onHoverChange: (hovered: boolean) => void;
}) {
  const startsAt = useMemo(() => new Date(booking.startsAtIso), [booking.startsAtIso]);
  void dateIso; // reserved for future per-date diagnostics
  const studentLabel = booking.studentDisplayName ?? "תלמיד/ה";
  return (
    <BookingPeekModal
      bookingId={booking.id}
      studentUserId={booking.studentUserId}
      studentName={studentLabel}
      startsAt={startsAt}
      durationMinutes={booking.durationMinutes}
      subjectNameHe={booking.subjectNameHe}
    >
      <button
        type="button"
        aria-label={`${studentLabel} · ${formatBookingTimeRange(startsAt, booking.durationMinutes)}`}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        className={[
          // No `transition` here on purpose — the `:after` pseudo-element
          // (the row-separator cover) cannot share the parent's CSS
          // transition, so adding one would mean the cell bg interpolates
          // over ~150ms while the overlay snaps instantly. That mismatch
          // is what produced the "middle line flashes on hover start/end"
          // bug founder flagged. Both snap together, no transition.
          "relative h-9 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tertiary-accent cursor-pointer",
          // Hover state: when ANY slot of this booking is hovered, every
          // slot of the band switches to `primary-fixed-dim` together. The
          // shared `hoveredBookingId` state in the parent makes the whole
          // band feel like one object even though it's N separate buttons.
          isHovered
            ? "bg-primary-fixed-dim"
            : "bg-primary-fixed",
          "text-primary-container",
          "border-s border-linen-border",
          // Cover the row-separator border below this cell when the
          // next row continues the same booking. Overlay is 2px tall
          // (h-0.5) sitting at -1px so it bulletproofs subpixel-rendering
          // edges across DPRs (1×, 1.25×, 1.5×, 2×). Color tracks the
          // hover state so the band stays seamless when it lights up.
          !isTail
            ? isHovered
              ? "after:content-[''] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary-fixed-dim after:pointer-events-none"
              : "after:content-[''] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary-fixed after:pointer-events-none"
            : "",
        ].join(" ")}
      >
        {isHead && (
          <span className="flex h-full flex-col items-end justify-center gap-0.5 px-1 text-start leading-tight">
            <span className="block w-full truncate text-[11px] font-bold text-primary-container">
              {studentLabel}
            </span>
            <span className="block w-full truncate text-[9px] tabular-nums text-primary-container/70">
              {formatBookingTimeRange(startsAt, booking.durationMinutes)}
            </span>
          </span>
        )}
      </button>
    </BookingPeekModal>
  );
}

function formatBookingTimeRange(startsAt: Date, durationMinutes: number): string {
  const end = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  });
  return `${fmt.format(startsAt)}–${fmt.format(end)}`;
}
