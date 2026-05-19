ALTER TABLE "tutor_profiles" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "short_bio" text;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "long_bio" text;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "highlights" text[];--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "recommendation_headline" text;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "recommendation_sub" text;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "recommendation_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: copy existing `bio` content into long_bio + first 220 chars
-- into short_bio; default tagline from display_name. Story 2.11
-- (2026-05-18, revised 2026-05-19 per code-review F2). Without this, the
-- seeded approved tutors would vanish from `discoverableTutorWhere()`
-- once the predicate tightens to require non-empty content.
--
-- Code-review fix (F2, 2026-05-19): backfill is UNCONDITIONAL — uses
-- COALESCE so rows where `bio IS NULL` still get a non-null fallback
-- (a single Hebrew space sentinel — "still empty per content but
-- non-null per predicate", flagged for the tutor's next edit to
-- replace). Previously the WHERE bio IS NOT NULL guard silently left
-- those rows invisible after `discoverableTutorWhere()` tightened. The
-- sentinel value '⋯' (Unicode ellipsis) is unlikely to collide with
-- real prose and lets a maintenance query find rows that still need
-- real content: `WHERE short_bio = '⋯' OR long_bio = '⋯'`.
UPDATE "tutor_profiles" SET "long_bio" = COALESCE("long_bio", "bio", '⋯');--> statement-breakpoint
UPDATE "tutor_profiles" SET "short_bio" = COALESCE("short_bio", LEFT("bio", 220), '⋯');--> statement-breakpoint
UPDATE "tutor_profiles" SET "tagline" = COALESCE(NULLIF("tagline", ''), NULLIF(LEFT("display_name", 60), ''), '⋯');