CREATE TABLE "account_deletion_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"restore_token" text NOT NULL,
	"restore_token_expires_at" timestamp with time zone NOT NULL,
	"email" text,
	"name" text,
	"image" text,
	"date_of_birth" date,
	"tutor_profile_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	CONSTRAINT "uq_account_deletion_snapshots_user" UNIQUE("user_id"),
	CONSTRAINT "uq_account_deletion_snapshots_restore_token" UNIQUE("restore_token")
);
--> statement-breakpoint
ALTER TABLE "account_deletion_snapshots" ADD CONSTRAINT "account_deletion_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_deletion_snapshots_expires" ON "account_deletion_snapshots" USING btree ("restore_token_expires_at");