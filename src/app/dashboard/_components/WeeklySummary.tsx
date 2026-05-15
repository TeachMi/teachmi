// Right-rail weekly summary card. Story 5.0 ships HARDCODED ZEROS — the
// real numbers come from aggregating `lesson_sessions` rows after Stories
// 5.3 (session summaries) + 5.5 (ratings) accumulate data. Placeholder
// validates the layout slot.

import { Card } from "@/components/ui/card";

export function WeeklySummary() {
  return (
    <Card padding="md" className="text-start">
      <h3 className="mb-4 font-display text-base font-bold text-primary-container">
        השבוע שלך
      </h3>
      <dl className="space-y-3">
        <div className="flex items-baseline justify-between">
          <dt className="text-sm text-secondary">שיעורים</dt>
          <dd className="font-display text-2xl font-extrabold text-primary-container">
            0
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-sm text-secondary">דקות לימוד</dt>
          <dd className="font-display text-2xl font-extrabold text-primary-container">
            0
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-sm text-secondary">נשארו בחבילה</dt>
          <dd className="font-display text-2xl font-extrabold text-primary-container">
            —
          </dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-linen-border pt-4">
        <p className="mb-1 text-xs text-secondary">התקדמות</p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-container">
          <div className="h-2 w-0 rounded-full bg-primary-container" />
        </div>
        <p className="mt-1 text-[10px] text-secondary">
          0 מתוך 0 שיעורים בחבילה
        </p>
      </div>
    </Card>
  );
}
