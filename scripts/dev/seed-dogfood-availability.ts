// One-off availability seed for the dogfood tutors so the /tutor/[slug]
// calendar has clickable slots during local QA. Idempotent: clears any
// previous rows created by this script before inserting.
//
// Not part of the long-term seeding contract — delete after Story 4.1
// (tutor availability editor) ships and tutors can populate their own
// availability through the UI.

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { tutorAvailability } from "../../src/lib/db/schema";

// Load .env.local (preferred) with fallback to .env — matches the order
// `pnpm seed:dogfood` uses.
config({ path: ".env.local" });
config({ path: ".env" });

const ACTOR = "scripts/seed-dogfood-availability.ts";

// userIds match `scripts/seed-dogfood.ts` output (stable UUIDs).
const TUTORS = [
  { name: "ofer-tutor", userId: "e577ae61-fda4-4812-a2b1-4a7ebba78d63" },
  { name: "aviel-tutor", userId: "d24f26c4-df2b-4850-82fc-14a50a7030bf" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = neon(url);
  const db = drizzle(sql);

  for (const tutor of TUTORS) {
    // Clear any rows this script owns so re-runs stay idempotent.
    await db
      .delete(tutorAvailability)
      .where(
        and(
          eq(tutorAvailability.tutorUserId, tutor.userId),
          eq(tutorAvailability.createdByActor, ACTOR),
        ),
      );

    // Seed recurring availability for every weekday, 14:00–21:30 IL —
    // matches the calendar's visible window (Story 3.2 lines 29–38).
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.insert(tutorAvailability).values({
        tutorUserId: tutor.userId,
        kind: "recurring",
        weekday,
        date: null,
        startTime: "14:00:00",
        endTime: "21:30:00",
        validFrom: null,
        validUntil: null,
        createdByKind: "system",
        createdByActor: ACTOR,
      });
    }
    console.log(`  + ${tutor.name}: 7 recurring availability rows seeded`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
