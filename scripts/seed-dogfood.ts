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
    name: "עפר התלמיד",
    role: "student" as const,
  },
  {
    email: "ofer-tutor@teachme.co.il",
    name: "עפר המורה",
    role: "tutor" as const,
  },
  {
    email: "aviel-student@teachme.co.il",
    name: "אביאל התלמיד",
    role: "student" as const,
  },
  {
    email: "aviel-tutor@teachme.co.il",
    name: "אביאל המורה",
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

    // Story 2.10: seed an approved tutor_profiles + tutor_subjects rows for
    // each tutor account so signing in lands them on /tutor/me directly
    // (no /tutor/onboarding/profile detour). Idempotent — re-runs restore
    // the canonical "approved + active" state.
    if (account.role === "tutor") {
      await seedTutorProfile(sql, row.id, account);
    }
  }

  console.log("");
  console.log(`Done. ${inserted} inserted, ${updated} updated.`);
  console.log(`Sign in at: /signin with any of the above emails + password "${DOGFOOD_PASSWORD}"`);
}

// Hebrew bios are deliberately distinct per tutor so the dogfood marketplace
// shows two recognizable cards instead of a duplicate pair.
const TUTOR_PROFILE_OVERRIDES: Record<string, { bio: string; subjectSlugs: string[] }> = {
  "ofer-tutor@teachme.co.il": {
    bio:
      "מורה למתמטיקה ומדעי המחשב עם 8 שנות ניסיון, מתכניות הכשרה במכון וייצמן ועד הכנה לבגרות. גישה ידידותית, סבלנית, ויעילה — מתאים לתלמידי תיכון ומכינות.",
    subjectSlugs: ["mathematics", "psychometric"],
  },
  "aviel-tutor@teachme.co.il": {
    bio:
      "מורה לאנגלית וללשון עברית עם תואר שני בבלשנות. מלמדת לבגרות ב-5 יחידות כבר 6 שנים, אוהבת לעבוד עם תלמידים שמתקשים בכתיבה — שיטה ברורה, ללא לחץ.",
    subjectSlugs: ["english", "lashon"],
  },
};

async function seedTutorProfile(
  sql: ReturnType<typeof neon<false, false>>,
  userId: string,
  account: { email: string; name: string; role: "student" | "tutor" },
): Promise<void> {

  const override = TUTOR_PROFILE_OVERRIDES[account.email];
  if (!override) {
    console.warn(`  ? ${account.email}: no tutor-profile override defined; skipping`);
    return;
  }

  // UPSERT the profile row.
  await sql`
    INSERT INTO tutor_profiles (
      user_id, display_name, bio, city,
      hourly_price_ils, lesson_45_price_ils, lesson_length_minutes,
      vetting_status, is_active,
      intro_video_r2_key, profile_photo_r2_key,
      created_by_kind, created_by_actor
    )
    VALUES (
      ${userId}, ${account.name}, ${override.bio}, ${"תל אביב"},
      ${180}, ${140}, ${60},
      ${"approved"}, ${true},
      ${null}, ${null},
      ${"system"}, ${"dogfood-seed"}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      vetting_status = 'approved',
      is_active = true,
      deleted_at = NULL,
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      city = EXCLUDED.city,
      hourly_price_ils = EXCLUDED.hourly_price_ils,
      lesson_45_price_ils = EXCLUDED.lesson_45_price_ils,
      intro_video_r2_key = EXCLUDED.intro_video_r2_key,
      updated_at = now(),
      updated_by_kind = ${"system"},
      updated_by_actor = ${"dogfood-seed"}
  `;

  // UPSERT subjects. Resolve slug → id via the launch-subjects taxonomy
  // seeded by `pnpm db:seed`. If a slug is missing (taxonomy not seeded),
  // skip it silently — the dogfood tutor will just have no subjects.
  const subjectRows = (await sql`
    SELECT id, slug FROM subjects
    WHERE slug = ANY(${override.subjectSlugs})
  `) as Array<{ id: string; slug: string }>;
  for (const subj of subjectRows) {
    await sql`
      INSERT INTO tutor_subjects (
        tutor_user_id, subject_id, created_by_kind, created_by_actor
      )
      VALUES (
        ${userId}, ${subj.id}, ${"system"}, ${"dogfood-seed"}
      )
      ON CONFLICT (tutor_user_id, subject_id) DO NOTHING
    `;
  }

  console.log(`    profile + ${subjectRows.length} subject(s) seeded for ${account.email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
