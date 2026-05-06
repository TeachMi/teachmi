import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { launchSubjects } from "../src/lib/db/seed-data";
import { subjects, users } from "../src/lib/db/schema";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@teachme.local";
const now = new Date();

const db = getDb();

for (const subject of launchSubjects) {
  await db
    .insert(subjects)
    .values({
      ...subject,
      isActive: true,
      createdByKind: "migration",
      createdByActor: "seed",
    })
    .onConflictDoUpdate({
      target: subjects.slug,
      set: {
        displayNameHe: sql.raw(`excluded.display_name_he`),
        displayNameEn: sql.raw(`excluded.display_name_en`),
        category: sql.raw(`excluded.category`),
        sortOrder: sql.raw(`excluded.sort_order`),
        isActive: true,
        updatedAt: now,
        updatedByKind: "migration",
        updatedByActor: "seed",
      },
    });
}

await db
  .insert(users)
  .values({
    email: adminEmail,
    role: "admin",
    locale: "he-IL",
    timezone: "Asia/Jerusalem",
    createdByKind: "migration",
    createdByActor: "seed",
  })
  .onConflictDoUpdate({
    target: users.email,
    set: {
      role: "admin",
      updatedAt: now,
      updatedByKind: "migration",
      updatedByActor: "seed",
    },
  });

console.log(`Seeded ${launchSubjects.length} launch subjects and admin user ${adminEmail}.`);
