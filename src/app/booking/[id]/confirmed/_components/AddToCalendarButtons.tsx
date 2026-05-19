"use client";

// Three "Add to calendar" buttons on the approval page. All three currently
// produce the same .ics file — Google/Apple/raw download. Google could be
// upgraded to a `https://calendar.google.com/render?action=TEMPLATE&...`
// deep-link later; the .ics download is functional today.

import { Button } from "@/components/ui/button";
import { buildIcs } from "@/lib/booking/ics";

interface AddToCalendarButtonsProps {
  bookingId: string;
  startIso: string;
  endIso: string;
  tutorDisplayName: string;
  duration: number;
}

export function AddToCalendarButtons({
  bookingId,
  startIso,
  endIso,
  tutorDisplayName,
  duration,
}: AddToCalendarButtonsProps) {
  function downloadIcs() {
    const ics = buildIcs({
      uid: `booking-${bookingId}@teachme.co.il`,
      startUtc: new Date(startIso),
      endUtc: new Date(endIso),
      summary: `שיעור עם ${tutorDisplayName}`,
      description: `שיעור פרטי דרך TeachMe.\nמשך: ${duration} דקות.`,
      location: "אונליין · TeachMe",
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teachme-lesson-${bookingId}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Code review 2026-05-19 (F14): defer revoke to the next tick. A
    // synchronous `URL.revokeObjectURL(url)` after `a.click()` races
    // the download initiator in Safari (desktop + iOS) and produces an
    // empty / failed download. Wrapping in setTimeout(0) lets the
    // browser queue the download before the URL is freed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="bg-white rounded-xl border border-linen-border p-5 mb-6 text-start">
      <h4 className="font-display font-bold text-primary-container mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined" aria-hidden="true">
          calendar_add_on
        </span>
        הוסיפו ליומן
      </h4>
      <div className="flex gap-2 flex-wrap">
        <CalendarButton onClick={downloadIcs} icon="event" label="Google Calendar" />
        <CalendarButton onClick={downloadIcs} icon="phone_iphone" label="Apple Calendar" />
        <CalendarButton onClick={downloadIcs} icon="download" label="קובץ ICS" />
      </div>
    </div>
  );
}

function CalendarButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="md"
      onClick={onClick}
      iconLeading={
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          {icon}
        </span>
      }
    >
      {label}
    </Button>
  );
}
