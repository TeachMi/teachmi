// Idempotent dogfood-account seeder. Provisions 4 known accounts (Ofer +
// Aviel × student + tutor) for the founders to use as standing test users
// across dev / preview / prod. Marks each user with
// `created_by_actor = "dogfood-seed"` so analytics dashboards can filter
// them out of Loop-gate / Wedge-gate measurements (UX-DR37).
//
// Run against whichever Neon branch you want seeded:
//   DATABASE_URL=<branch-url> pnpm tsx scripts/seed-dogfood.ts
//   (or: DATABASE_URL=<branch-url> pnpm seed:dogfood)
//
// The 2-character shared password (`go`) is intentionally weak — these are
// sentinel test accounts, not real users. The signup form's 10-char minimum
// would normally reject it; we bypass that by inserting the argon2 hash
// directly. Signin form has no minLength check so `go` works at the form
// layer. If these credentials leak, the blast radius is bounded to:
//   - signing in as a test student/tutor
//   - browsing the marketplace, viewing tutor profiles
//   - creating test bookings (against test tutors, since real tutors aren't
//     onboarded until Sprint 2 closed-beta)
// Cannot escalate to admin, cannot see other users' private data (assuming
// no other auth bugs).
//
// To rotate the password later: change DOGFOOD_PASSWORD below, re-run the
// script. ON CONFLICT DO UPDATE will refresh the hash for all 4 accounts.

import { hash } from "@node-rs/argon2";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const DOGFOOD_PASSWORD = "go";

const ACCOUNTS = [
  {
    email: "ofer-student@teachme.co.il",
    name: "Ofer (Student)",
    role: "student" as const,
  },
  {
    email: "ofer-tutor@teachme.co.il",
    name: "Ofer (Tutor)",
    role: "tutor" as const,
  },
  {
    email: "aviel-student@teachme.co.il",
    name: "Aviel (Student)",
    role: "student" as const,
  },
  {
    email: "aviel-tutor@teachme.co.il",
    name: "Aviel (Tutor)",
    role: "tutor" as const,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  // Surface which branch we're targeting BEFORE making writes.
  const host = url.match(/@([^/]+)/)?.[1] ?? "(unknown host)";
  console.log(`Seeding dogfood accounts into: ${host}`);
  console.log(`Accounts (password = "${DOGFOOD_PASSWORD}"):`);
  for (const a of ACCOUNTS) console.log(`  - ${a.email} (${a.role})`);
  console.log("");

  // OWASP Argon2id params — match src/lib/auth/password-hashing.ts.
  const passwordHash = await hash(DOGFOOD_PASSWORD, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });

  const sql = neon(url);

  let inserted = 0;
  let updated = 0;
  for (const account of ACCOUNTS) {
    // ON CONFLICT DO UPDATE — idempotent. Re-runs refresh the password_hash
    // + email_verified (the latter matters if a previous run somehow left
    // a row with email_verified=null).
    const rows = (await sql`
      INSERT INTO users (
        email, password_hash, name, role, email_verified,
        locale, timezone,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${account.email}, ${passwordHash}, ${account.name}, ${account.role}, now(),
        ${"he-IL"}, ${"Asia/Jerusalem"},
        ${"system"}, ${"dogfood-seed"}
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        email_verified = COALESCE(users.email_verified, EXCLUDED.email_verified),
        updated_at = now(),
        updated_by_kind = ${"system"},
        updated_by_actor = ${"dogfood-seed"}
      RETURNING id, email,
        (xmax = 0) AS was_inserted
    `) as Array<{ id: string; email: string; was_inserted: boolean }>;

    const row = rows[0];
    if (!row) {
      console.error(`  ! ${account.email}: no row returned`);
      continue;
    }
    if (row.was_inserted) {
      inserted += 1;
      console.log(`  + ${row.email} inserted (${row.id})`);
    } else {
      updated += 1;
      console.log(`  ~ ${row.email} updated (${row.id})`);
    }
  }

  console.log("");
  console.log(`Done. ${inserted} inserted, ${updated} updated.`);
  console.log(`Sign in at: /signin with any of the above emails + password "${DOGFOOD_PASSWORD}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
