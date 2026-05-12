// One-off: fetch the most recent password-reset row from _dev_email_outbox for
// a given email. Used to retrieve the reset URL after a /signin/forgot submit
// when the EmailProvider is the Stub. Mirrors scripts/peek-verify-email.ts.
// Not part of the app; run via `pnpm tsx`.

import { neon } from "@neondatabase/serverless";
import "dotenv/config";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm tsx scripts/peek-reset-email.ts <email>");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = neon(url);
  const rows = (await sql`
    select payload, created_at
    from _dev_email_outbox
    where to_address = ${email}
      and template_id = 'auth-password-reset'
    order by created_at desc
    limit 1
  `) as Array<{ payload: { resetUrl?: string }; created_at: Date }>;

  if (rows.length === 0) {
    console.log(`No password-reset outbox row found for ${email}`);
    return;
  }
  const row = rows[0];
  console.log(`Created: ${row.created_at}`);
  console.log(`Reset URL: ${row.payload?.resetUrl ?? "(no resetUrl in payload)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
