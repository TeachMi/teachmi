// STUB ROUTE — Area 1 (2026-05-19). Live stub for the
// "פתח דף תלמיד" button surfaced by the BookingPeekModal. Renders a
// placeholder "Coming soon" page that proves the wiring without
// pretending to be the real student-detail surface.
//
// DO NOT EXTEND in place. Per Winston's guardrails (party-mode round
// 2026-05-19): no nav/sitemap inclusion, no data fetch, no analytics
// hooks, no state. If you find yourself wanting to add any of those,
// build the real /tutor/students/[studentId] feature instead — this stub
// is a sentinel that the IA is committed, not a foundation for partial
// implementation. Tracked in the deferred-work backlog.
//
// The route is reachable ONLY from the BookingPeekModal's primary
// action. No menu link, no nav, no search-index entry — limits the blast
// radius if it sits longer than planned.

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { requireTutor } from "@/app/tutor/onboarding/_lib/require-tutor";

interface StudentDetailStubProps {
  params: Promise<{ studentId: string }>;
}

export const dynamic = "force-dynamic";

export default async function StudentDetailStubPage({
  params,
}: StudentDetailStubProps) {
  // Guard the route to authenticated tutors. The peek that surfaces this
  // link is already inside the tutor surface, but a tutor sharing the URL
  // outside the app shouldn't expose anything to a logged-out visitor.
  await requireTutor();
  const { studentId } = await params;

  return (
    <AppShell mainClassName="flex-1 bg-surface">
      <main className="mx-auto w-full max-w-2xl px-6 py-16 text-start">
        <div className="rounded-2xl border border-linen-border bg-white p-8 shadow-sm">
          <span
            className="material-symbols-outlined mb-3 inline-block text-5xl text-primary-container"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            construction
          </span>
          <h1 className="mb-2 font-display text-2xl font-extrabold text-primary-container">
            דף התלמיד יגיע בקרוב
          </h1>
          <p className="mb-6 leading-relaxed text-on-surface-variant">
            כאן יופיע פרופיל מלא של התלמיד — היסטוריית שיעורים, הערות אישיות,
            סיכומים, וחשבוניות. אנחנו עדיין בונים את המסך הזה.
          </p>
          <p className="mb-6 text-xs text-secondary" dir="ltr">
            student id: {studentId}
          </p>
          <Button asChild variant="outline" size="md">
            <Link href="/tutor/me/schedule">חזרה ללוח השיעורים ←</Link>
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
