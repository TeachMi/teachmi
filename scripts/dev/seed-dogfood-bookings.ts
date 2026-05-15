// One-off: seed 3 upcoming + 3 past bookings between ofer-student and
// ofer-tutor so the dev preview's dashboard + history surfaces have real
// data to render. Idempotent — clears prior rows this script owns before
// inserting.
//
// Stable user IDs come from `scripts/seed-dogfood.ts` (Story 1.13 era).
// Delete before merging — this is a QA convenience, not a permanent
// fixture, and carries hard-coded user IDs.

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { bookings, subjects } from "../../src/lib/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const ACTOR = "scripts/seed-dogfood-bookings.ts";

const OFER_STUDENT_ID = "bbe3b80a-03f3-48bb-b112-9e3b5b4165e1";
const OFER_TUTOR_ID = "e577ae61-fda4-4812-a2b1-4a7ebba78d63";

const PRICE_60_ILS = 180;
const PRICE_45_ILS = 140;
const COMMISSION_RATE = 0.1;

interface BookingSeed {
  daysFromNow: number; // negative = past
  hour: number; // IL local hour (UTC+3 in IDT)
  duration: 45 | 60;
  status: "confirmed" | "completed";
}

const BOOKINGS: BookingSeed[] = [
  // Upcoming (next 7 days)
  { daysFromNow: 1, hour: 16, duration: 60, status: "confirmed" },
  { daysFromNow: 3, hour: 17, duration: 60, status: "confirmed" },
  { daysFromNow: 5, hour: 14, duration: 45, status: "confirmed" },
  // Past (last 14 days)
  { daysFromNow: -2, hour: 16, duration: 60, status: "completed" },
  { daysFromNow: -5, hour: 17, duration: 45, status: "completed" },
  { daysFromNow: -10, hour: 14, duration: 60, status: "completed" },
];

function startsAtFor(daysFromNow: number, hour: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + daysFromNow);
  // IL is UTC+3 (IDT) for the May/Sep 2026 window — Bagrut launch is fully
  // inside IDT, so subtract 3 to get the UTC instant.
  target.setUTCHours(hour - 3, 0, 0, 0);
  return target;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = neon(url);
  const db = drizzle(sql);

  // Clear prior rows this script owns.
  await db
    .delete(bookings)
    .where(
      and(
        eq(bookings.studentUserId, OFER_STUDENT_ID),
        eq(bookings.tutorUserId, OFER_TUTOR_ID),
        eq(bookings.createdByActor, ACTOR),
      ),
    );

  // Pick math as the subject if it exists (created by `pnpm db:seed`).
  const mathRows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.slug, "mathematics"));
  const mathSubjectId = mathRows[0]?.id ?? null;

  for (const seed of BOOKINGS) {
    const startsAt = startsAtFor(seed.daysFromNow, seed.hour);
    const priceIls = seed.duration === 60 ? PRICE_60_ILS : PRICE_45_ILS;
    const commission = Math.round(priceIls * COMMISSION_RATE);
    const tutorPayout = priceIls - commission;

    await db.insert(bookings).values({
      studentUserId: OFER_STUDENT_ID,
      payerUserId: OFER_STUDENT_ID,
      tutorUserId: OFER_TUTOR_ID,
      subjectId: mathSubjectId,
      startsAt,
      durationMinutes: seed.duration,
      status: seed.status,
      priceIls,
      platformCommissionIls: commission,
      tutorPayoutIls: tutorPayout,
      createdByKind: "system",
      createdByActor: ACTOR,
    });
    console.log(
      `  + ${seed.status === "confirmed" ? "upcoming" : "past"} ${seed.duration}min at ${startsAt.toISOString()}`,
    );
  }
  console.log(`Seeded ${BOOKINGS.length} bookings for ofer-student × ofer-tutor.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
