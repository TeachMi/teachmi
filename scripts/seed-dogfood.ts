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
  // Email → user_id. Populated as we seed users. Used by `seedSampleBookings`
  // below to wire student ↔ tutor pairs without a second SELECT round-trip.
  const userIdByEmail = new Map<string, string>();
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
    userIdByEmail.set(account.email, row.id);

    // Story 2.10: seed an approved tutor_profiles + tutor_subjects rows for
    // each tutor account so signing in lands them on /tutor/me directly
    // (no /tutor/onboarding/profile detour). Idempotent — re-runs restore
    // the canonical "approved + active" state.
    if (account.role === "tutor") {
      await seedTutorProfile(sql, row.id, account);
    }
  }

  // Story 4.3 follow-up 2026-05-19: seed sample bookings so the student
  // dashboard + the tutor's upcoming-strip show realistic content the
  // moment the seed completes. Without this, every fresh Neon branch has
  // students staring at an "אין שיעורים מתוכננים" empty state until
  // someone manually books a slot through the UI.
  await seedSampleBookings(sql, userIdByEmail);

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

  // Story 4.3 follow-up 2026-05-19: seed default recurring availability so
  // the dogfood tutor is BOOKABLE end-to-end the moment the seed completes.
  // Without this, the public profile renders the sidebar's disabled "אין
  // זמינות כרגע" state and the founder can't smoke-test the booking flow.
  //
  // Default schedule: Sun–Thu (weekday 0–4), 14:00–22:00, in 30-min cells.
  // This mirrors what the SCHEDULE_GRID editor would produce after a tutor
  // selected the "afternoon + evening" Quick-Add chips for Sun-Thu — the
  // most realistic "I'm a tutor, set me up for testing" default.
  //
  // Guarded: only seed availability when the tutor has ZERO existing
  // recurring rows. Re-running the seed never wipes a tutor's manual edits.
  const existingAvailability = (await sql`
    SELECT COUNT(*)::int AS n FROM tutor_availability
    WHERE tutor_user_id = ${userId} AND kind = 'recurring'
  `) as Array<{ n: number }>;
  const existingCount = existingAvailability[0]?.n ?? 0;
  let availabilityRowsInserted = 0;
  if (existingCount === 0) {
    // 30-min cells from 14:00 to 22:00 → 16 cells per weekday.
    const cells: Array<{ startTime: string; endTime: string }> = [];
    for (let half = 0; half < 16; half++) {
      const startMinutes = 14 * 60 + half * 30;
      const endMinutes = startMinutes + 30;
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
      cells.push({ startTime: fmt(startMinutes), endTime: fmt(endMinutes) });
    }
    // Weekday 0 = Sunday … 4 = Thursday.
    const weekdays = [0, 1, 2, 3, 4];
    for (const weekday of weekdays) {
      for (const cell of cells) {
        await sql`
          INSERT INTO tutor_availability (
            tutor_user_id, kind, weekday, start_time, end_time,
            created_by_kind, created_by_actor
          )
          VALUES (
            ${userId}, ${"recurring"}, ${weekday}, ${cell.startTime}, ${cell.endTime},
            ${"system"}, ${"dogfood-seed"}
          )
        `;
        availabilityRowsInserted++;
      }
    }
  }

  console.log(
    `    profile + ${subjectRows.length} subject(s)${availabilityRowsInserted > 0 ? ` + ${availabilityRowsInserted} availability rows (Sun-Thu 14:00-22:00)` : " (availability preserved)"} for ${account.email}`,
  );
}

// ---------------------------------------------------------------------------
// Sample bookings — Story 4.3 follow-up 2026-05-19
// ---------------------------------------------------------------------------
//
// Mirror what `runCreateBooking` would write if the founder clicked through
// the booking flow manually: bookings row (status='confirmed') +
// lesson_sessions row + payments row (mock_payment=true, status='settled').
// Skip the audit row — this isn't a real user action.
//
// Each (student, tutor, startsAt) tuple is guarded by the partial UNIQUE
// `uq_bookings_active_slot` so re-runs naturally skip. Belt-and-suspenders:
// we also pre-check via SELECT so a re-seed doesn't log "duplicate" errors.

interface SampleBookingSpec {
  studentEmail: string;
  tutorEmail: string;
  /** Day-of-week (0=Sun … 6=Sat) for the lesson, in IL local time. */
  weekday: number;
  /** Hour of the lesson start (24h, IL local). Must be in the tutor's 14-22 window. */
  hourIL: number;
  durationMinutes: number;
  /** Subject slug to attach. Must be in the tutor's offered list. */
  subjectSlug: string;
  priceIls: number;
}

const SAMPLE_BOOKINGS: SampleBookingSpec[] = [
  {
    studentEmail: "ofer-student@teachme.co.il",
    tutorEmail: "ofer-tutor@teachme.co.il",
    weekday: 0, // Sunday
    hourIL: 16,
    durationMinutes: 60,
    subjectSlug: "mathematics",
    priceIls: 180,
  },
  {
    studentEmail: "ofer-student@teachme.co.il",
    tutorEmail: "aviel-tutor@teachme.co.il",
    weekday: 3, // Wednesday
    hourIL: 18,
    durationMinutes: 60,
    subjectSlug: "english",
    priceIls: 180,
  },
  {
    studentEmail: "aviel-student@teachme.co.il",
    tutorEmail: "ofer-tutor@teachme.co.il",
    weekday: 2, // Tuesday
    hourIL: 15,
    durationMinutes: 60,
    subjectSlug: "mathematics",
    priceIls: 180,
  },
];

// Story 5.x — past completed lessons for the rate-flow demo. The rate-
// previous-lesson card on the student dashboard needs at least one
// completed lesson with no rating to render. Seed two per student so
// the founder can exercise the flow without bookkeeping.
interface PastLessonSpec {
  studentEmail: string;
  tutorEmail: string;
  /** Days ago — past lessons land in the dashboard's "rate previous" list. */
  daysAgo: number;
  /** When true, ALSO seed a rating row so the public profile has content. */
  seedRating: { score: 1 | 2 | 3 | 4 | 5; comment: string | null } | null;
  subjectSlug: string;
  priceIls: number;
}

const PAST_LESSONS: PastLessonSpec[] = [
  // Ofer-student × Ofer-tutor — one unrated (drives the rate-flow), one rated.
  {
    studentEmail: "ofer-student@teachme.co.il",
    tutorEmail: "ofer-tutor@teachme.co.il",
    daysAgo: 4,
    seedRating: null,
    subjectSlug: "mathematics",
    priceIls: 180,
  },
  {
    studentEmail: "ofer-student@teachme.co.il",
    tutorEmail: "ofer-tutor@teachme.co.il",
    daysAgo: 18,
    seedRating: { score: 5, comment: "שיעור מצוין, ממליץ בחום." },
    subjectSlug: "mathematics",
    priceIls: 180,
  },
  // Aviel-student × Aviel-tutor — one unrated.
  {
    studentEmail: "aviel-student@teachme.co.il",
    tutorEmail: "aviel-tutor@teachme.co.il",
    daysAgo: 6,
    seedRating: null,
    subjectSlug: "english",
    priceIls: 180,
  },
];

/**
 * Find the next occurrence of `(weekday, hourIL:00)` in Asia/Jerusalem,
 * strictly in the future. Returns the UTC instant for storage.
 *
 * Uses Intl.DateTimeFormat to extract the current IL date components so the
 * math handles DST automatically. Same approach as `compute-slots.ts`
 * (in the app code), kept inline here to avoid a cross-package import from
 * the standalone seed script.
 */
function nextWeekdayInIL(weekday: number, hourIL: number): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = parseInt(get("year"), 10);
  const month = parseInt(get("month"), 10);
  const day = parseInt(get("day"), 10);
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const currentWeekday = weekdayMap[get("weekday")] ?? 0;

  // Days to advance — always strictly forward (at least 1 day) so "next
  // Sunday" from today=Sunday lands on next week, not today.
  let advance = (weekday - currentWeekday + 7) % 7;
  if (advance === 0) advance = 7;

  // Compute "Y-M-(D+advance) hourIL:00 in Asia/Jerusalem" → UTC instant.
  // Naive UTC then adjust by IL offset at that instant.
  const naive = new Date(Date.UTC(year, month - 1, day + advance, hourIL, 0, 0));
  const naiveIlHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hour12: false,
    }).format(naive),
    10,
  );
  // The IL projection of `naive` is whatever the offset produces. Shift so
  // that projection matches the intended `hourIL`.
  let diffHours = naiveIlHour - hourIL;
  if (diffHours > 12) diffHours -= 24;
  if (diffHours < -12) diffHours += 24;
  return new Date(naive.getTime() - diffHours * 60 * 60 * 1000);
}

async function seedSampleBookings(
  sql: ReturnType<typeof neon<false, false>>,
  userIdByEmail: Map<string, string>,
): Promise<void> {
  // Commission split mirrors `computeCommissionSplit` in booking-flow.ts:
  // 15% platform commission, payout = priceIls − commission.
  const COMMISSION_RATE = 0.15;
  let createdCount = 0;
  let skippedCount = 0;

  for (const spec of SAMPLE_BOOKINGS) {
    const studentUserId = userIdByEmail.get(spec.studentEmail);
    const tutorUserId = userIdByEmail.get(spec.tutorEmail);
    if (!studentUserId || !tutorUserId) {
      console.warn(
        `  ? skipping sample booking: ${spec.studentEmail} → ${spec.tutorEmail} (user not found)`,
      );
      continue;
    }

    const startsAt = nextWeekdayInIL(spec.weekday, spec.hourIL);

    // Idempotency: if an active booking already exists for this
    // (tutor, startsAt) tuple AND the same student, skip. The partial
    // UNIQUE would catch it at INSERT time, but pre-checking avoids
    // duplicate-key log noise.
    const existing = (await sql`
      SELECT id FROM bookings
      WHERE tutor_user_id = ${tutorUserId}
        AND student_user_id = ${studentUserId}
        AND starts_at = ${startsAt.toISOString()}
        AND status IN ('pending_payment', 'confirmed')
      LIMIT 1
    `) as Array<{ id: string }>;
    if (existing.length > 0) {
      skippedCount++;
      continue;
    }

    // Resolve subject_id from the slug.
    const subjectRows = (await sql`
      SELECT id FROM subjects WHERE slug = ${spec.subjectSlug} LIMIT 1
    `) as Array<{ id: string }>;
    const subjectId = subjectRows[0]?.id ?? null;

    const platformCommissionIls = Math.round(spec.priceIls * COMMISSION_RATE);
    const tutorPayoutIls = spec.priceIls - platformCommissionIls;

    // INSERT bookings row.
    const bookingRows = (await sql`
      INSERT INTO bookings (
        student_user_id, payer_user_id, tutor_user_id, subject_id,
        starts_at, duration_minutes, status,
        price_ils, platform_commission_ils, tutor_payout_ils,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${studentUserId}, ${studentUserId}, ${tutorUserId}, ${subjectId},
        ${startsAt.toISOString()}, ${spec.durationMinutes}, ${"confirmed"},
        ${spec.priceIls}, ${platformCommissionIls}, ${tutorPayoutIls},
        ${"system"}, ${"dogfood-seed"}
      )
      RETURNING id
    `) as Array<{ id: string }>;
    const bookingId = bookingRows[0]?.id;
    if (!bookingId) continue;

    // INSERT lesson_sessions row (1:1 with booking, stub provider).
    await sql`
      INSERT INTO lesson_sessions (
        booking_id, room_provider, status,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${bookingId}, ${"stub"}, ${"scheduled"},
        ${"system"}, ${"dogfood-seed"}
      )
    `;

    // INSERT payments row (mock_payment=true, status='settled').
    await sql`
      INSERT INTO payments (
        booking_id, payme_transaction_id, amount_ils,
        platform_commission_ils, tutor_payout_ils,
        status, settled_at, mock_payment,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${bookingId}, ${null}, ${spec.priceIls},
        ${platformCommissionIls}, ${tutorPayoutIls},
        ${"settled"}, now(), ${true},
        ${"system"}, ${"dogfood-seed"}
      )
    `;

    createdCount++;
  }

  if (createdCount > 0 || skippedCount > 0) {
    console.log(
      `\n  Sample bookings: ${createdCount} created, ${skippedCount} preserved (already existed)`,
    );
  }

  // Story 5.x — past completed lessons + optional ratings.
  await seedPastLessons(sql, userIdByEmail);
}

// Fixed anchor for the past-lessons block. Stable across re-runs (same
// reasoning as `SEED_BOOKING_ANCHOR_UTC` in `seed-mock-tutors.ts`). DST-
// safe by definition: the wall-clock value is irrelevant — the only
// consumer (`getUnratedCompletedLessonsForStudent` + the dashboard
// review CTA) renders the date via `Intl.DateTimeFormat` in
// `Asia/Jerusalem`, not the raw hour.
const PAST_LESSON_ANCHOR_UTC = new Date("2026-01-01T15:00:00Z");

async function seedPastLessons(
  sql: ReturnType<typeof neon<false, false>>,
  userIdByEmail: Map<string, string>,
): Promise<void> {
  const COMMISSION_RATE = 0.15;
  let createdCount = 0;
  let skippedCount = 0;
  let ratingsCreated = 0;

  for (const spec of PAST_LESSONS) {
    const studentUserId = userIdByEmail.get(spec.studentEmail);
    const tutorUserId = userIdByEmail.get(spec.tutorEmail);
    if (!studentUserId || !tutorUserId) continue;

    const startsAt = new Date(
      PAST_LESSON_ANCHOR_UTC.getTime() - spec.daysAgo * 24 * 60 * 60 * 1000,
    );

    const existing = (await sql`
      SELECT id FROM bookings
      WHERE tutor_user_id = ${tutorUserId}
        AND student_user_id = ${studentUserId}
        AND starts_at = ${startsAt.toISOString()}
      LIMIT 1
    `) as Array<{ id: string }>;

    let bookingId: string;
    if (existing.length > 0) {
      bookingId = existing[0]!.id;
      skippedCount++;
    } else {
      const subjectRows = (await sql`
        SELECT id FROM subjects WHERE slug = ${spec.subjectSlug} LIMIT 1
      `) as Array<{ id: string }>;
      const subjectId = subjectRows[0]?.id ?? null;

      const platformCommissionIls = Math.round(spec.priceIls * COMMISSION_RATE);
      const tutorPayoutIls = spec.priceIls - platformCommissionIls;

      const bookingRows = (await sql`
        INSERT INTO bookings (
          student_user_id, payer_user_id, tutor_user_id, subject_id,
          starts_at, duration_minutes, status,
          price_ils, platform_commission_ils, tutor_payout_ils,
          created_by_kind, created_by_actor
        )
        VALUES (
          ${studentUserId}, ${studentUserId}, ${tutorUserId}, ${subjectId},
          ${startsAt.toISOString()}, ${60}, ${"completed"},
          ${spec.priceIls}, ${platformCommissionIls}, ${tutorPayoutIls},
          ${"system"}, ${"dogfood-seed"}
        )
        RETURNING id
      `) as Array<{ id: string }>;
      bookingId = bookingRows[0]!.id;
      createdCount++;
    }

    // lesson_sessions — completed.
    const sessionRows = (await sql`
      INSERT INTO lesson_sessions (
        booking_id, room_provider, status, started_at, ended_at,
        duration_actual_minutes,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${bookingId}, ${"stub"}, ${"completed"},
        ${startsAt.toISOString()}, ${new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString()},
        ${60},
        ${"system"}, ${"dogfood-seed"}
      )
      ON CONFLICT (booking_id) DO UPDATE SET
        status = 'completed',
        updated_at = now()
      RETURNING id
    `) as Array<{ id: string }>;
    const sessionId = sessionRows[0]!.id;

    if (spec.seedRating !== null) {
      await sql`
        INSERT INTO ratings (
          lesson_session_id, student_user_id, tutor_user_id, score, comment,
          created_by_kind, created_by_actor
        )
        VALUES (
          ${sessionId}, ${studentUserId}, ${tutorUserId}, ${spec.seedRating.score}, ${spec.seedRating.comment},
          ${"system"}, ${"dogfood-seed"}
        )
        ON CONFLICT (lesson_session_id) DO NOTHING
      `;
      ratingsCreated++;

      // Refresh the aggregate on the affected tutor.
      await sql`
        UPDATE tutor_profiles
        SET average_rating = sub.avg_score,
            rating_count = sub.cnt,
            updated_at = now()
        FROM (
          SELECT
            AVG(score)::numeric(3,2) AS avg_score,
            COUNT(*)::int AS cnt
          FROM ratings WHERE tutor_user_id = ${tutorUserId}
        ) sub
        WHERE tutor_profiles.user_id = ${tutorUserId}
      `;
    }
  }

  if (createdCount > 0 || skippedCount > 0) {
    console.log(
      `\n  Past lessons: ${createdCount} created, ${skippedCount} preserved, ${ratingsCreated} with seeded rating`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
