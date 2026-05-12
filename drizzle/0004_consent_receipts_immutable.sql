-- Story 1.21: consent_receipts is append-only (NFR16).
-- The schema.ts comment on the table reads
--   "IMMUTABLE per NFR16: no UPDATE, no DELETE (enforce via Postgres trigger
--    when migration runs)."
-- This migration adds that trigger. BEFORE-UPDATE and BEFORE-DELETE raise an
-- exception, so accidental mutations are rejected at the DB layer regardless
-- of which app/process attempts them.
--
-- TRUNCATE bypasses BEFORE-DELETE triggers (Postgres semantics) -- test setup
-- can still `TRUNCATE consent_receipts` to reset rows between cases. Direct
-- DELETE / UPDATE raises.

CREATE OR REPLACE FUNCTION consent_receipts_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'consent_receipts is append-only (NFR16)';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER consent_receipts_no_update
  BEFORE UPDATE ON consent_receipts
  FOR EACH ROW EXECUTE FUNCTION consent_receipts_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER consent_receipts_no_delete
  BEFORE DELETE ON consent_receipts
  FOR EACH ROW EXECUTE FUNCTION consent_receipts_reject_mutation();
