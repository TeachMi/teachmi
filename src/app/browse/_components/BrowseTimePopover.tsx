"use client";

// Time-of-day + day-of-week filter popover for `/browse` (Story 5.x R2
// 2026-05-20). Mirrors Preply's "I'm available" affordance: button
// reveals a popover with chip-style multi-select for time sections
// (Morning / Afternoon / Evening+Night) and days (Sun–Sat).
//
// State model — optimistic local with URL as source-of-truth:
//   - The popover reads the initial selection from URL params.
//   - Every chip click updates LOCAL state synchronously so the UI
//     flips instantly. The `router.push` to update the URL runs in
//     `startTransition` afterwards. Without this split the chip
//     waited 200-400ms (DB query + R2 presigns) before showing
//     pressed state — felt broken.
//   - A `useEffect` re-syncs local state when the URL params change
//     externally (back button, another tab's link, clear-all from
//     a different surface).

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DAYS_OF_WEEK,
  parseDays,
  parseTimeBuckets,
  TIME_SECTIONS,
} from "./browse-filters-shared";

export function BrowseTimePopover() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Initial pull from URL — these become the seeds for local state.
  // `searchParams` is a Next.js URLSearchParams subclass; calling
  // `.get()` returns the same string identity across renders for the
  // same URL, so the `useEffect` sync below is precisely the "URL
  // changed externally" hook.
  const urlDaysParam = searchParams.get("days") ?? "";
  const urlTimesParam = searchParams.get("times") ?? "";

  const [selectedDayKeys, setSelectedDayKeys] = useState<Set<string>>(
    () => new Set(parseDays(urlDaysParam).map((d) => d.key)),
  );
  const [selectedTimeKeys, setSelectedTimeKeys] = useState<Set<string>>(
    () => new Set(parseTimeBuckets(urlTimesParam).map((b) => b.key)),
  );

  // Track the last param string we pushed to the URL so the sync
  // effects can ignore the echo (the `router.push` we just issued
  // would otherwise re-run the effect and clobber an in-flight click
  // with the previous URL — visible as a chip flickering off between
  // two rapid presses). When the URL string matches what we just
  // pushed, we know it's our own commit and skip the reset.
  const lastPushedDaysRef = useRef<string>(urlDaysParam);
  const lastPushedTimesRef = useRef<string>(urlTimesParam);

  // Reconcile when the URL changes from outside this popover.
  useEffect(() => {
    if (urlDaysParam === lastPushedDaysRef.current) return;
    setSelectedDayKeys(new Set(parseDays(urlDaysParam).map((d) => d.key)));
    lastPushedDaysRef.current = urlDaysParam;
  }, [urlDaysParam]);
  useEffect(() => {
    if (urlTimesParam === lastPushedTimesRef.current) return;
    setSelectedTimeKeys(
      new Set(parseTimeBuckets(urlTimesParam).map((b) => b.key)),
    );
    lastPushedTimesRef.current = urlTimesParam;
  }, [urlTimesParam]);

  const activeCount = selectedDayKeys.size + selectedTimeKeys.size;

  // Outside-click + Escape close. Keep focus on the trigger after close
  // so keyboard nav stays predictable.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Push the local-state Sets to the URL. Drops `page=` because the
   * result set changes so a stale `page=3` is wrong. Records the
   * pushed param strings on the `lastPushed*Ref`s so the URL-sync
   * effects can ignore the echo.
   */
  const pushToUrl = useCallback(
    (days: Set<string>, times: Set<string>) => {
      const daysParam = days.size === 0 ? "" : Array.from(days).join(",");
      const timesParam = times.size === 0 ? "" : Array.from(times).join(",");
      lastPushedDaysRef.current = daysParam;
      lastPushedTimesRef.current = timesParam;

      const next = new URLSearchParams(searchParams.toString());
      if (daysParam === "") next.delete("days");
      else next.set("days", daysParam);
      if (timesParam === "") next.delete("times");
      else next.set("times", timesParam);
      next.delete("page");
      const query = next.toString();
      startTransition(() => {
        router.push(query ? `/browse?${query}` : "/browse");
      });
    },
    [router, searchParams],
  );

  // Compute the next Set outside the setState updater so the updater
  // stays pure (no side effects) — calling `pushToUrl` inside a setter
  // fires twice in React StrictMode and is flagged as an antipattern.
  const toggleDay = useCallback(
    (key: string) => {
      const next = new Set(selectedDayKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelectedDayKeys(next);
      pushToUrl(next, selectedTimeKeys);
    },
    [pushToUrl, selectedDayKeys, selectedTimeKeys],
  );

  const toggleTime = useCallback(
    (key: string) => {
      const next = new Set(selectedTimeKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelectedTimeKeys(next);
      pushToUrl(selectedDayKeys, next);
    },
    [pushToUrl, selectedDayKeys, selectedTimeKeys],
  );

  const clearAll = useCallback(() => {
    const emptyDays = new Set<string>();
    const emptyTimes = new Set<string>();
    setSelectedDayKeys(emptyDays);
    setSelectedTimeKeys(emptyTimes);
    pushToUrl(emptyDays, emptyTimes);
  }, [pushToUrl]);

  const buttonLabel = activeCount === 0
    ? "כל הזמנים"
    : `${activeCount} נבחרו`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-linen-border bg-surface-lowest px-4 text-sm font-bold text-primary-container transition-colors hover:border-primary-fixed-dim focus:outline-none focus:ring-2 focus:ring-primary-fixed-dim focus:border-primary-fixed-dim"
      >
        <span className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-base text-on-surface-variant"
            aria-hidden="true"
          >
            schedule
          </span>
          {buttonLabel}
        </span>
        <span
          className="material-symbols-outlined text-base text-on-surface-variant"
          aria-hidden="true"
        >
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="סינון לפי ימים ושעות"
          className="absolute top-full start-0 z-30 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-linen-border bg-surface-lowest p-5 shadow-2xl"
        >
          {/* Times */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-on-surface">שעות</h3>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-bold text-primary-container hover:underline"
                >
                  נקה הכל
                </button>
              )}
            </div>
            {TIME_SECTIONS.map((section) => (
              <div key={section.headingHe} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                  <span
                    className="material-symbols-outlined text-base text-tertiary-accent"
                    style={{
                      fontVariationSettings: section.iconFilled
                        ? "'FILL' 1"
                        : "'FILL' 0",
                    }}
                    aria-hidden="true"
                  >
                    {section.icon}
                  </span>
                  {section.headingHe}
                </div>
                <div className="flex flex-wrap gap-2">
                  {section.buckets.map((bucket) => {
                    const active = selectedTimeKeys.has(bucket.key);
                    return (
                      <button
                        key={bucket.key}
                        type="button"
                        onClick={() => toggleTime(bucket.key)}
                        aria-pressed={active}
                        className={
                          active
                            ? "rounded-full border border-primary-container bg-primary-container px-3 py-1.5 text-xs font-bold text-on-primary"
                            : "rounded-full border border-linen-border bg-surface-lowest px-3 py-1.5 text-xs font-bold text-on-surface hover:border-primary-fixed-dim"
                        }
                      >
                        {bucket.labelHe}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="mt-6 space-y-2">
            <h3 className="font-display font-bold text-on-surface">ימים</h3>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const active = selectedDayKeys.has(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.key)}
                    aria-pressed={active}
                    aria-label={day.fullLabelHe}
                    className={
                      active
                        ? "h-10 w-10 rounded-full border border-primary-container bg-primary-container text-sm font-bold text-on-primary"
                        : "h-10 w-10 rounded-full border border-linen-border bg-surface-lowest text-sm font-bold text-on-surface hover:border-primary-fixed-dim"
                    }
                  >
                    {day.labelHe}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
