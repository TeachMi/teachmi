CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "uq_accounts_provider_account" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" uuid,
	"actor_meta" text,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_user_id" uuid NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"subject_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"price_ils" integer NOT NULL,
	"platform_commission_ils" integer NOT NULL,
	"tutor_payout_ils" integer NOT NULL,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text
);
--> statement-breakpoint
CREATE TABLE "consent_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"document_version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"signature" text,
	"document_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_export_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"export_r2_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	CONSTRAINT "uq_data_export_tokens_token" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "dispute_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"author_role" text NOT NULL,
	"recipient_scope" text NOT NULL,
	"body" text NOT NULL,
	"is_initial_report" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_session_id" uuid,
	"filed_by_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"evidence_r2_keys" text[],
	"status" text DEFAULT 'open' NOT NULL,
	"decision" text,
	"resolution_rationale" text,
	"resolved_by_admin_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"gi_business" text NOT NULL,
	"gi_doc_id" text,
	"pdf_r2_key" text,
	"amount_ils" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_invoices_payment_doc_type" UNIQUE("payment_id","doc_type")
);
--> statement-breakpoint
CREATE TABLE "lesson_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"room_provider" text DEFAULT 'stub' NOT NULL,
	"room_url" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_actual_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_lesson_sessions_booking_id" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"marketing_email" boolean DEFAULT false NOT NULL,
	"marketing_sms" boolean DEFAULT false NOT NULL,
	"marketing_whatsapp" boolean DEFAULT false NOT NULL,
	"transactional_email" boolean DEFAULT true NOT NULL,
	"transactional_sms" boolean DEFAULT false NOT NULL,
	"transactional_whatsapp" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_notification_preferences_user" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"template_key" text NOT NULL,
	"subject" text,
	"body_snippet" text,
	"consent_basis" text,
	"vendor_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"payme_transaction_id" text,
	"amount_ils" integer NOT NULL,
	"platform_commission_ils" integer NOT NULL,
	"tutor_payout_ils" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_payments_payme_transaction_id" UNIQUE("payme_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_ils" integer NOT NULL,
	"status" text DEFAULT 'pending_invoices' NOT NULL,
	"ready_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payme_payout_reference" text,
	"hold_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_payouts_payment_id" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_session_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_ratings_lesson_session_id" UNIQUE("lesson_session_id"),
	CONSTRAINT "ck_ratings_score" CHECK ("ratings"."score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "session_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_session_id" uuid NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_session_summaries_lesson_version" UNIQUE("lesson_session_id","version")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_sessions_session_token" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "student_lesson_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_user_id" uuid NOT NULL,
	"lesson_session_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_student_lesson_notes_pair" UNIQUE("student_user_id","lesson_session_id")
);
--> statement-breakpoint
CREATE TABLE "student_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"preferred_language" text DEFAULT 'he' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name_he" text NOT NULL,
	"display_name_en" text,
	"category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_subjects_slug" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tutor_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"weekday" smallint,
	"date" date,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "ck_tutor_availability_kind" CHECK ((
      ("tutor_availability"."kind" = 'recurring' AND "tutor_availability"."weekday" IS NOT NULL AND "tutor_availability"."date" IS NULL) OR
      ("tutor_availability"."kind" IN ('exception_blocked', 'exception_available') AND "tutor_availability"."date" IS NOT NULL AND "tutor_availability"."weekday" IS NULL)
    )),
	CONSTRAINT "ck_tutor_availability_time_order" CHECK ("tutor_availability"."start_time" < "tutor_availability"."end_time")
);
--> statement-breakpoint
CREATE TABLE "tutor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"r2_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"vetting_status" text DEFAULT 'pending' NOT NULL,
	"vetting_notes" text,
	"verified_by_admin_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text
);
--> statement-breakpoint
CREATE TABLE "tutor_green_invoice_business" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"gi_business_id" text NOT NULL,
	"gi_api_token_encrypted" text NOT NULL,
	"gi_api_token_iv" text NOT NULL,
	"provisioned_at" timestamp with time zone NOT NULL,
	"last_health_check_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_tutor_green_invoice_business_tutor" UNIQUE("tutor_user_id"),
	CONSTRAINT "uq_tutor_green_invoice_business_gi_id" UNIQUE("gi_business_id")
);
--> statement-breakpoint
CREATE TABLE "tutor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"city" text,
	"intro_video_r2_key" text,
	"profile_photo_r2_key" text,
	"hourly_price_ils" integer NOT NULL,
	"lesson_length_minutes" smallint DEFAULT 60 NOT NULL,
	"commission_rate_override" numeric(5, 4),
	"vetting_status" text DEFAULT 'pending' NOT NULL,
	"vetting_notes" text,
	"vetted_by_admin_id" uuid,
	"vetted_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"total_lessons_completed" integer DEFAULT 0 NOT NULL,
	"average_rating" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_tutor_profiles_user_id" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tutor_student_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_tutor_student_notes_pair" UNIQUE("tutor_user_id","student_user_id")
);
--> statement-breakpoint
CREATE TABLE "tutor_subjects" (
	"tutor_user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"proficiency_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	CONSTRAINT "tutor_subjects_tutor_user_id_subject_id_pk" PRIMARY KEY("tutor_user_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "tutor_wizard_state" (
	"user_id" uuid NOT NULL,
	"phase" smallint NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "tutor_wizard_state_user_id_phase_pk" PRIMARY KEY("user_id","phase")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"role" text NOT NULL,
	"two_factor_secret" text,
	"two_factor_verified_at" timestamp with time zone,
	"parent_user_id" uuid,
	"locale" text DEFAULT 'he-IL' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_actor" text NOT NULL,
	"updated_by_kind" text,
	"updated_by_actor" text,
	CONSTRAINT "uq_users_email" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "webhook_idempotency_keys" (
	"vendor" text NOT NULL,
	"key" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"response_body" jsonb,
	CONSTRAINT "webhook_idempotency_keys_vendor_key_pk" PRIMARY KEY("vendor","key")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_receipts" ADD CONSTRAINT "consent_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_tokens" ADD CONSTRAINT "data_export_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_lesson_session_id_lesson_sessions_id_fk" FOREIGN KEY ("lesson_session_id") REFERENCES "public"."lesson_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_filed_by_user_id_users_id_fk" FOREIGN KEY ("filed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_admin_id_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_lesson_session_id_lesson_sessions_id_fk" FOREIGN KEY ("lesson_session_id") REFERENCES "public"."lesson_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_lesson_session_id_lesson_sessions_id_fk" FOREIGN KEY ("lesson_session_id") REFERENCES "public"."lesson_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_notes" ADD CONSTRAINT "student_lesson_notes_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_notes" ADD CONSTRAINT "student_lesson_notes_lesson_session_id_lesson_sessions_id_fk" FOREIGN KEY ("lesson_session_id") REFERENCES "public"."lesson_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_settings" ADD CONSTRAINT "student_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_availability" ADD CONSTRAINT "tutor_availability_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_documents" ADD CONSTRAINT "tutor_documents_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_documents" ADD CONSTRAINT "tutor_documents_verified_by_admin_id_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_green_invoice_business" ADD CONSTRAINT "tutor_green_invoice_business_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_vetted_by_admin_id_users_id_fk" FOREIGN KEY ("vetted_by_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_student_notes" ADD CONSTRAINT "tutor_student_notes_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_student_notes" ADD CONSTRAINT "tutor_student_notes_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_wizard_state" ADD CONSTRAINT "tutor_wizard_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user_id" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_events_target" ON "audit_events" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_actor" ON "audit_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_event_type" ON "audit_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_bookings_tutor_calendar" ON "bookings" USING btree ("tutor_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_bookings_student_history" ON "bookings" USING btree ("student_user_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_bookings_status_starts_at" ON "bookings" USING btree ("status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bookings_active_slot" ON "bookings" USING btree ("tutor_user_id","starts_at") WHERE "bookings"."status" in ('pending_payment', 'confirmed');--> statement-breakpoint
CREATE INDEX "idx_consent_receipts_user_type" ON "consent_receipts" USING btree ("user_id","document_type","accepted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_consent_receipts_type" ON "consent_receipts" USING btree ("document_type","accepted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_data_export_tokens_user" ON "data_export_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_data_export_tokens_expires" ON "data_export_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_dispute_messages_dispute" ON "dispute_messages" USING btree ("dispute_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_disputes_status" ON "disputes" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_disputes_filed_by" ON "disputes" USING btree ("filed_by_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_disputes_lesson_session" ON "disputes" USING btree ("lesson_session_id");--> statement-breakpoint
CREATE INDEX "idx_disputes_kind" ON "disputes" USING btree ("kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_invoices_gi_doc_id" ON "invoices" USING btree ("gi_doc_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lesson_sessions_status" ON "lesson_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notifications_log_user" ON "notifications_log" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_notifications_log_status" ON "notifications_log" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_payments_booking" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_payouts_tutor" ON "payouts" USING btree ("tutor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_payouts_status" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ratings_tutor" ON "ratings" USING btree ("tutor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_session_summaries_lesson_latest" ON "session_summaries" USING btree ("lesson_session_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires");--> statement-breakpoint
CREATE INDEX "idx_student_lesson_notes_student" ON "student_lesson_notes" USING btree ("student_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_subjects_active" ON "subjects" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "idx_tutor_availability_recurring" ON "tutor_availability" USING btree ("tutor_user_id","kind","weekday");--> statement-breakpoint
CREATE INDEX "idx_tutor_availability_exception" ON "tutor_availability" USING btree ("tutor_user_id","date");--> statement-breakpoint
CREATE INDEX "idx_tutor_documents_tutor" ON "tutor_documents" USING btree ("tutor_user_id");--> statement-breakpoint
CREATE INDEX "idx_tutor_documents_status" ON "tutor_documents" USING btree ("vetting_status");--> statement-breakpoint
CREATE INDEX "idx_tutor_profiles_vetting_status" ON "tutor_profiles" USING btree ("vetting_status");--> statement-breakpoint
CREATE INDEX "idx_tutor_profiles_is_active" ON "tutor_profiles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_tutor_profiles_city" ON "tutor_profiles" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_tutor_profiles_price" ON "tutor_profiles" USING btree ("hourly_price_ils");--> statement-breakpoint
CREATE INDEX "idx_tutor_profiles_avg_rating" ON "tutor_profiles" USING btree ("average_rating");--> statement-breakpoint
CREATE INDEX "idx_tutor_profiles_deleted_at" ON "tutor_profiles" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_tutor_student_notes_tutor" ON "tutor_student_notes" USING btree ("tutor_user_id");--> statement-breakpoint
CREATE INDEX "idx_tutor_student_notes_student" ON "tutor_student_notes" USING btree ("student_user_id");--> statement-breakpoint
CREATE INDEX "idx_tutor_subjects_subject" ON "tutor_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_users_parent" ON "users" USING btree ("parent_user_id");--> statement-breakpoint
CREATE INDEX "idx_users_deleted_at" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_immutable_table_change()
RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'table % is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_table_change();--> statement-breakpoint
CREATE TRIGGER trg_consent_receipts_immutable
BEFORE UPDATE OR DELETE ON "consent_receipts"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_table_change();
