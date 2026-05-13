-- NOTE: drizzle-kit also wanted to add `CREATE TABLE password_reset_tokens`
-- here because the e2e snapshot chain pre-existing this story didn't include
-- 0003_productive_tusk's snapshot (squash-merge artifact: 0004 was generated
-- against the 0002-era schema). The table already exists in prod from 0003;
-- the CREATE TABLE statement was removed by hand to avoid a duplicate-table
-- migration error. The 0006 snapshot correctly reflects the merged state.
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_receipts" ADD CONSTRAINT "uq_consent_receipts_user_type_version" UNIQUE("user_id","document_type","document_version");