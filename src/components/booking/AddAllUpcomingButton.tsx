"use client";

// AddAllUpcomingButton — Area 1.4 (2026-05-19). The dashboards'
// "הוספת כל השיעורים שלי ליומן" button. Bundles every active booking the
// caller has into one multi-VEVENT .ics download. Reuses the same
// download mechanics as `AddToCalendarButtons` (the single-booking
// component on /booking/[id]/confirmed) — Blob → object URL → temporary
// anchor click → defer-revoke for Safari.
//
// Hidden by the caller when `bookings.length === 0`: a zero-event .ics
// download is technically valid but a bad UX. The render returns null in
// that case as a safety belt.

import { Button } from "@/components/ui/button";
import { buildIcsMulti } from "@/lib/booking/ics";

/**
 * Single booking serialized for the bundle. Server-side caller fills in
 * `counterpartName` (student name for tutor view, tutor name for student
 * view) so this client component doesn't need to know which actor it's
 * serving.
 */
export interface AddAllBooking {
  id: string;
  startIso: string;
  endIso: string;
  counterpartName: string;
  subjectNameHe: string | null;
  durationMinutes: number;
}

export interface AddAllUpcomingButtonProps {
  bookings: AddAllBooking[];
  /**
   * Filename stem for the download. Final name becomes
   * `<stem>-<YYYY-MM-DD>.ics`. Defaults to "teachme-lessons".
   */
  filenameStem?: string;
}

export function AddAllUpcomingButton({
  bookings,
  filenameStem = "teachme-lessons",
}: AddAllUpcomingButtonProps) {
  if (bookings.length === 0) return null;

  function downloadIcs() {
    const ics = buildIcsMulti(
      bookings.map((b) => ({
        uid: `booking-${b.id}@teachme.co.il`,
        startUtc: new Date(b.startIso),
        endUtc: new Date(b.endIso),
        summary: b.subjectNameHe
          ? `שיעור: ${b.subjectNameHe} עם ${b.counterpartName}`
          : `שיעור עם ${b.counterpartName}`,
        description: `שיעור פרטי דרך TeachMe.\nמשך: ${b.durationMinutes} דקות.`,
        location: "אונליין · TeachMe",
      })),
    );
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${filenameStem}-${stamp}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Safari race fix — same as the single-booking component (F14).
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="md"
      onClick={downloadIcs}
      iconLeading={
        <span
          className="material-symbols-outlined text-base"
          aria-hidden="true"
        >
          calendar_add_on
        </span>
      }
    >
      הוספת כל השיעורים שלי ליומן ({bookings.length})
    </Button>
  );
}
