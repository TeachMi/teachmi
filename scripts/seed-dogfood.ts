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

// Hebrew profile content per tutor — Story 2.11 (2026-05-18) rewrote the
// fields from a single `bio` into tagline + short_bio + long_bio + highlights
// + recommendation. The seeded content here drives the closed-beta dogfood
// marketplace so the discoverableTutorWhere() predicate (which requires
// tagline/short_bio/long_bio to be non-empty) doesn't quietly hide the
// seeded tutors.
interface TutorProfileOverride {
  tagline: string;
  shortBio: string;
  longBio: string;
  highlights: string[];
  recommendationVisible: boolean;
  recommendationHeadline: string | null;
  recommendationSub: string | null;
  subjectSlugs: string[];
}

const TUTOR_PROFILE_OVERRIDES: Record<string, TutorProfileOverride> = {
  "ofer-tutor@teachme.co.il": {
    tagline: "מורה למתמטיקה ומדעי המחשב",
    shortBio:
      "מורה למתמטיקה עם 8 שנות ניסיון. מומחה בהכנה לבגרות 5 יחידות ולפסיכומטרי.",
    longBio:
      "שלום, אני עפר. מלמד מתמטיקה ומדעי המחשב כבר 8 שנים — מבית הספר התיכון ועד הכנה לפסיכומטרי. אני מאמין שמתמטיקה היא שפה שכל אחד יכול ללמוד, וההצלחה תלויה בעיקר בשיטה הנכונה ובקצב שמתאים לתלמיד.\n\nבשיעורים אצלי תקבלו: גישה אישית, חומרי לימוד מקוריים, ומעקב שבועי אחרי ההתקדמות. 87% מהתלמידים שלי השנה השיגו 90+ בבגרות 5 יח״ל.",
    highlights: ["accessible", "patient", "results-driven", "experienced"],
    recommendationVisible: true,
    recommendationHeadline: "מומלץ במיוחד להכנה לבגרות 5 יח״ל",
    recommendationSub: "מדורג גבוה במיוחד על-ידי תלמידי תיכון",
    subjectSlugs: ["mathematics", "psychometric"],
  },
  "aviel-tutor@teachme.co.il": {
    tagline: "מורה לאנגלית וללשון עברית",
    shortBio:
      "מורה לאנגלית וללשון עברית, תואר שני בבלשנות, 6 שנות ניסיון בהכנה לבגרות.",
    longBio:
      "שלום, אני אביאל. מלמד אנגלית ולשון כבר 6 שנים, רוב הזמן עם תלמידי תיכון שמתכוננים לבגרות ב-5 יחידות. תואר שני בבלשנות מאוניברסיטת תל אביב.\n\nאני אוהב לעבוד עם תלמידים שמתקשים בכתיבה — שיטה ברורה, ללא לחץ, ועם המון תרגול אישי שמותאם לרמה. תלמידים שעובדים איתי לאורך זמן עולים בממוצע 15 נקודות בציון הבגרות.",
    highlights: ["supportive", "creative", "patient", "dynamic"],
    recommendationVisible: false,
    recommendationHeadline: null,
    recommendationSub: null,
    subjectSlugs: ["english", "hebrew-lashon"],
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

  // UPSERT the profile row. Both seeded tutors (עפר המורה, אביאל המורה) have
  // masculine Hebrew names, so default to gender='male' — Hebrew grammar
  // requires gender agreement on copy like "מורה מאומת" / "מורה מאומתת"
  // (Story 2.10 follow-up). `bio` is still written as a safety mirror of
  // `long_bio` for the one-deploy transition window (Story 2.11).
  await sql`
    INSERT INTO tutor_profiles (
      user_id, display_name, gender, bio,
      tagline, short_bio, long_bio, highlights,
      recommendation_visible, recommendation_headline, recommendation_sub,
      hourly_price_ils, lesson_45_price_ils, lesson_length_minutes,
      vetting_status, is_active,
      intro_video_r2_key, profile_photo_r2_key,
      created_by_kind, created_by_actor
    )
    VALUES (
      ${userId}, ${account.name}, ${"male"}, ${override.longBio},
      ${override.tagline}, ${override.shortBio}, ${override.longBio}, ${override.highlights},
      ${override.recommendationVisible}, ${override.recommendationHeadline}, ${override.recommendationSub},
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
      gender = EXCLUDED.gender,
      bio = EXCLUDED.bio,
      tagline = EXCLUDED.tagline,
      short_bio = EXCLUDED.short_bio,
      long_bio = EXCLUDED.long_bio,
      highlights = EXCLUDED.highlights,
      recommendation_visible = EXCLUDED.recommendation_visible,
      recommendation_headline = EXCLUDED.recommendation_headline,
      recommendation_sub = EXCLUDED.recommendation_sub,
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
