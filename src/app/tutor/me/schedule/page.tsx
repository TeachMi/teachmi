import { getTutorAvailabilityRows } from "@/lib/db/queries/tutor-queries";
import { requireTutor } from "../../onboarding/_lib/require-tutor";
import { ScheduleEditor } from "./_components/ScheduleEditor";

// Story 2.10 extension — tutor availability editor (Story 4.1 scope).
// Loads existing rules (recurring + exceptions in the next 8 weeks) and
// hands them to the client `ScheduleEditor`. Auth + role gate handled by
// the parent /tutor/me/layout.tsx.

export const dynamic = "force-dynamic";

// Editor's exception-tab horizon — how far forward to load date-specific
// rules. 8 weeks is enough for a tutor to plan ahead without bloating the
// initial payload at scale.
const EXCEPTION_HORIZON_WEEKS = 8;

export default async function TutorMeSchedulePage() {
  const user = await requireTutor("/tutor/me/schedule");

  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + EXCEPTION_HORIZON_WEEKS * 7);

  let rows: Awaited<ReturnType<typeof getTutorAvailabilityRows>> = [];
  try {
    rows = await getTutorAvailabilityRows(user.id, { from: now, to: horizon });
  } catch (err) {
    // Defensive — same degradation pattern as Story 2.10's `/tutor/me`
    // page handler. A Neon outage shouldn't 500 the whole tab.
    console.error("[tutor/me/schedule] availability load failed", err);
  }

  // Pre-split into recurring vs exceptions client-side via plain JSON so
  // the client island doesn't need DB types. Date / time columns come back
  // from Drizzle as strings already.
  const recurring = rows.filter((r) => r.kind === "recurring");
  const exceptions = rows.filter((r) => r.kind !== "recurring");

  return (
    <ScheduleEditor
      recurringRules={recurring.map((r) => ({
        id: r.id,
        weekday: r.weekday ?? 0,
        startTime: r.startTime,
        endTime: r.endTime,
      }))}
      exceptionRules={exceptions.map((r) => ({
        id: r.id,
        kind: r.kind as "exception_blocked" | "exception_available",
        date: r.date ?? "",
        startTime: r.startTime,
        endTime: r.endTime,
      }))}
    />
  );
}
