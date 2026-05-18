-- tutor_profiles.gender — required Hebrew-grammar gender (M/F) so UI copy
-- gender-agrees with the tutor ("מורה מאומת" male / "מורה מאומתת" female).
-- Closed-beta: ~4 dogfood tutors exist. Backfill to 'male' (the two seeded
-- tutors — עפר המורה, אביאל המורה — are both masculine names; any rogue
-- test rows can be corrected after the fact). After backfill, lock NOT NULL
-- + CHECK so the application-layer Drizzle enum is enforced at the DB layer
-- too. Story 2.10 follow-up.

ALTER TABLE "tutor_profiles" ADD COLUMN "gender" text;

UPDATE "tutor_profiles" SET "gender" = 'male' WHERE "gender" IS NULL;

ALTER TABLE "tutor_profiles" ALTER COLUMN "gender" SET NOT NULL;

ALTER TABLE "tutor_profiles"
  ADD CONSTRAINT "tutor_profiles_gender_check"
  CHECK ("gender" IN ('male', 'female'));
