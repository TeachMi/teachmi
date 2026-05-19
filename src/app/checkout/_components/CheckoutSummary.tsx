// Sticky tutor + lesson summary aside on the checkout page.
// Mirrors `mocks/checkout.html` lines 173–243.

import { formatIlsCurrency } from "@/lib/hebrew/format";

interface CheckoutSummaryProps {
  tutorDisplayName: string;
  tutorPhotoUrl: string | null;
  /** ISO UTC string of lesson start. */
  slotIso: string;
  duration: 45 | 60 | 75 | 90;
  priceIls: number;
}

export function CheckoutSummary({
  tutorDisplayName,
  tutorPhotoUrl,
  slotIso,
  duration,
  priceIls,
}: CheckoutSummaryProps) {
  const start = new Date(slotIso);
  const end = new Date(start.getTime() + duration * 60 * 1000);

  const dateLabel = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(start);
  const timeLabel = `${formatTime(start)} — ${formatTime(end)}`;

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="bg-white rounded-2xl border border-linen-border shadow-sm overflow-hidden">
        {/* Tutor strip */}
        <div className="bg-primary-container text-on-primary p-4 flex items-center gap-3">
          {tutorPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tutorPhotoUrl}
              alt={tutorDisplayName}
              className="w-12 h-12 rounded-full object-cover border-2 border-white"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary-fixed/40 flex items-center justify-center font-bold text-lg">
              {tutorDisplayName.slice(0, 1)}
            </div>
          )}
          <div className="text-start flex-1 min-w-0">
            <h3 className="font-display font-bold text-base leading-tight">
              {tutorDisplayName}
            </h3>
            <p className="text-on-primary-container text-xs">שיעור פרטי</p>
          </div>
        </div>

        {/* Lesson details */}
        <dl className="p-5 text-start space-y-3 border-b border-linen-border text-sm">
          <SummaryRow icon="event" label="תאריך" value={dateLabel} />
          <SummaryRow icon="schedule" label="שעה" value={timeLabel} />
          <SummaryRow icon="hourglass_top" label="משך" value={`${duration} דקות`} />
          <SummaryRow icon="videocam" label="סוג" value="אונליין" />
        </dl>

        {/* Price breakdown */}
        <div className="p-5 space-y-2 text-sm text-start">
          <div className="flex justify-between">
            <span className="text-secondary">שיעור {duration} דק׳</span>
            <span className="font-bold">{formatIlsCurrency(priceIls)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">עמלת פלטפורמה</span>
            <span className="font-bold">כלולה</span>
          </div>
          <div className="flex justify-between border-t border-linen-border pt-3 mt-2 items-baseline">
            <span className="font-display font-bold text-base">סה״כ</span>
            <span className="font-display font-extrabold text-2xl text-primary-container">
              {formatIlsCurrency(priceIls)}
            </span>
          </div>
          <p className="text-[11px] text-secondary leading-snug">
            תשלום פיקטיבי — לא יבוצע חיוב כספי בפועל בבטא הסגורה.
          </p>
        </div>
      </div>

      {/* Trust card */}
      <div className="bg-linen border border-linen-border rounded-xl p-4 mt-4 text-xs text-secondary text-start">
        <div className="flex items-start gap-2 mb-1">
          <span
            className="material-symbols-outlined text-primary-container text-lg"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            verified
          </span>
          <span className="font-bold text-primary-container">
            ביטול חופשי עד תחילת השיעור
          </span>
        </div>
        <p className="leading-relaxed">
          לא מתאים? אפשר לבטל את השיעור עד הרגע שהוא מתחיל ללא עלות.
        </p>
      </div>
    </aside>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-secondary flex items-center gap-1.5">
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      <span className="font-bold text-on-surface">{value}</span>
    </div>
  );
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(d);
}
