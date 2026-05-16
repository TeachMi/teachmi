import { Card } from "@/components/ui/card";

// Story 2.10 stub. The real invoices + payments surface lands in Epic 6
// (mocks/tutor-invoices.html). Auth + role gate handled by the parent
// /tutor/me/layout.tsx.

export const dynamic = "force-dynamic";

export default function TutorMeInvoicesPage() {
  return (
    <Card tone="highlighted" padding="md" className="text-start">
      <h2 className="mb-2 font-display text-lg font-bold text-primary-container">
        חשבוניות ותשלומים
      </h2>
      <p className="text-sm text-on-surface-variant">
        בקרוב — חשבוניות מס דיגיטליות וסיכום תשלומים יבנו ב-Epic 6.
      </p>
      <p className="mt-2 text-xs text-secondary">
        החשבוניות יופיעו כאן לאחר השיעור הראשון.
      </p>
    </Card>
  );
}
