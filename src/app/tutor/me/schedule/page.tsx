import { Card } from "@/components/ui/card";

// Story 2.10 stub. The real availability grid lands in Story 4.1
// (mocks/schedule-editor.html). Auth + role gate handled by the parent
// /tutor/me/layout.tsx.

export const dynamic = "force-dynamic";

export default function TutorMeSchedulePage() {
  return (
    <Card tone="highlighted" padding="md" className="text-start">
      <h2 className="mb-2 font-display text-lg font-bold text-primary-container">
        זמינות שבועית
      </h2>
      <p className="text-sm text-on-surface-variant">
        בקרוב — לוח זמנים שבועי לעריכת הזמינות שלך יבנה ב-Story 4.1.
      </p>
      <p className="mt-2 text-xs text-secondary">
        בינתיים תלמידים רואים את הזמינות שלך כפי שהוגדרה בכניסה הראשונית.
      </p>
    </Card>
  );
}
