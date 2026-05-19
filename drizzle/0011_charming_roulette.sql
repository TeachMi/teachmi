ALTER TABLE "tutor_profiles" ALTER COLUMN "hourly_price_ils" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "lesson_75_price_ils" integer;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "lesson_90_price_ils" integer;