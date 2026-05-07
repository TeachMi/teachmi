CREATE TABLE "_dev_email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"template_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_receipt_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_dev_email_outbox_kind" CHECK ("_dev_email_outbox"."kind" in ('transactional','marketing'))
);
--> statement-breakpoint
CREATE INDEX "idx_dev_email_outbox_created_at" ON "_dev_email_outbox" USING btree ("created_at");