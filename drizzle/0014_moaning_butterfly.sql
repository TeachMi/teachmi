ALTER TABLE "users" ADD COLUMN "is_mock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_users_is_mock" ON "users" USING btree ("is_mock") WHERE "users"."is_mock" = true;