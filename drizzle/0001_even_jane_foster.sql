ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'student';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_by_kind" SET DEFAULT 'system';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_by_actor" SET DEFAULT 'authjs';