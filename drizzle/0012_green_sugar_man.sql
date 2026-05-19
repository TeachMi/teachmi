CREATE TABLE "billing_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"national_id" text NOT NULL,
	"street" text NOT NULL,
	"city" text NOT NULL,
	"zip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_billing_addresses_user_id" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "mock_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_addresses" ADD CONSTRAINT "billing_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payments_booking_pending" ON "payments" USING btree ("booking_id") WHERE status = 'pending' AND payme_transaction_id IS NULL;--> statement-breakpoint
CREATE VIEW "public"."payments_real" AS (select "id", "booking_id", "payme_transaction_id", "amount_ils", "platform_commission_ils", "tutor_payout_ils", "status", "failure_reason", "settled_at", "mock_payment", "created_at", "updated_at", "created_by_kind", "created_by_actor", "updated_by_kind", "updated_by_actor" from "payments" where "payments"."mock_payment" = false);