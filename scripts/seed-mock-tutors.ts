// Mock-tutor seed for the closed-beta `/browse` page (Story 5.x 2026-05-19).
//
// Creates 5 culturally-realistic Israeli tutors with `is_mock=true` set on
// the `users` row, plus a small pool of mock students who left review-grade
// ratings. The marketplace needs a populated browse surface to be
// evaluable in the closed beta — with only the 2 dogfood tutors (Ofer +
// Aviel), `/browse` is empty by construction.
//
// Architecture decisions (party-mode 2026-05-19):
//   - `is_mock=true` flag on `users`, not email-pattern detection. Pre-
//     launch cleanup is `DELETE WHERE is_mock=true` — one line, auditable.
//   - Stable UUIDv5 derived from a per-tutor slug. Same slug → same UUID
//     across runs, so foreign-key references (ratings, bookings) survive
//     re-seeds.
//   - Mocks are visible alongside real tutors in browse. `discoverableTutor
//     Where()` is NOT filtered by `is_mock`. The founder is expected to
//     wipe mocks before public launch.
//   - Photos + videos point to shared R2 keys under `mock-defaults/`. The
//     companion `scripts/upload-mock-defaults.ts` uploads them once.
//
// Run independently or chained with dogfood:
//   DATABASE_URL=<branch-url> pnpm tsx scripts/seed-mock-tutors.ts
//   (or: DATABASE_URL=<branch-url> pnpm seed:mock-tutors)
//
// Idempotency strategy:
//   - Users: ON CONFLICT (email) DO UPDATE — stable email + UUID per slug.
//   - tutor_profiles: ON CONFLICT (user_id) DO UPDATE.
//   - tutor_subjects: ON CONFLICT (tutor_user_id, subject_id) DO NOTHING.
//   - tutor_availability: guarded by "zero existing rows for this tutor"
//     so reruns don't bloat the rule set (same pattern as seed-dogfood).
//   - Bookings + lesson_sessions + ratings: per-(tutor, student, starts_at)
//     skip-on-existing. Re-runs don't duplicate.

import { hash } from "@node-rs/argon2";
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import "dotenv/config";

// UUIDv5 namespace — arbitrary but stable. Picking a fresh UUID we own
// rather than the standard DNS one (6ba7b810-…) keeps mock-tutor UUIDs
// distinguishable from any other UUIDv5-derived data we add later.
const NAMESPACE_UUID = "f3a6b3a4-1c8c-5e3a-9e6b-1d7f3c5b2d8a";

/**
 * Fixed anchor for derived `starts_at` timestamps on seeded bookings.
 * Using a stable epoch instead of `new Date()` keeps the (tutor, student,
 * starts_at) idempotency key — same as the dup-skip check below — from
 * shifting between runs. Without this, re-running the seed on a
 * different calendar day would create duplicate bookings (each row's
 * `starts_at` would land on a different instant), accumulating
 * forever. The actual wall-clock value is irrelevant: bookings are in
 * the past and only `lesson_session.status='completed'` is consumed.
 */
const SEED_BOOKING_ANCHOR_UTC = new Date("2026-01-01T15:00:00Z");

/**
 * Build a deterministic `starts_at` for a seeded booking by subtracting
 * `daysAgo` from the fixed anchor. Stable across re-runs.
 */
function bookingStartFromAnchor(daysAgo: number): Date {
  return new Date(
    SEED_BOOKING_ANCHOR_UTC.getTime() - daysAgo * 24 * 60 * 60 * 1000,
  );
}

function uuidFromSlug(slug: string): string {
  // RFC 4122 UUIDv5 = SHA1(namespace_bytes || name) → format as UUID with
  // version/variant bits patched. We hand-roll instead of a dep because
  // the algorithm is tiny and we already depend on node:crypto.
  const namespaceBytes = Buffer.from(NAMESPACE_UUID.replace(/-/g, ""), "hex");
  const sha = createHash("sha1")
    .update(namespaceBytes)
    .update(slug)
    .digest();
  const bytes = Buffer.from(sha.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const MOCK_PASSWORD = "go"; // same as dogfood — sentinel accounts.

// ---------------------------------------------------------------------------
// Mock tutor cohort. 5 distinct identities — varied gender, subject mix,
// price band, name origin. Highlights MUST come from
// `src/lib/highlights.ts`'s taxonomy: accessible / dynamic / supportive /
// goal-oriented / patient / creative / results-driven / experienced.
// ---------------------------------------------------------------------------

interface MockTutorSpec {
  slug: string; // stable identifier used for UUID + email
  email: string;
  displayName: string;
  gender: "male" | "female";
  tagline: string;
  shortBio: string;
  longBio: string;
  highlights: string[];
  subjectSlugs: string[];
  // Per-length pricing. NULL = not offered.
  prices: {
    lesson45: number | null;
    lesson60: number; // every mock tutor offers 60-min — keeps the browse card price-line non-null
    lesson75: number | null;
    lesson90: number | null;
  };
  /** Static seeded `total_lessons_completed`. Story 5.x reasoning (John): an
   *  empty stats line ("0 שיעורים") makes the marketplace look hollow at
   *  closed-beta scale. Plausible values keep the page believable while
   *  the maintained-column wiring catches up. */
  totalLessonsCompleted: number;
  /** Which mock-default R2 video this tutor reuses (1/2/3). */
  introVideoVariant: 1 | 2 | 3;
  /** Surfaced in the homepage "מורים מובילים" band when true. */
  featured: boolean;
}

const MOCK_TUTORS: MockTutorSpec[] = [
  {
    slug: "shira-cohen",
    email: "mock-shira-cohen@teachme.local",
    displayName: "שירה כהן",
    gender: "female",
    tagline: "מורה למתמטיקה וסטטיסטיקה",
    shortBio:
      "מורה למתמטיקה עם תואר שני באוניברסיטה העברית. מתמחה בהכנה לבגרות 4–5 יחידות ובסטטיסטיקה אקדמית.",
    longBio:
      "שלום, אני שירה. מלמדת מתמטיקה כבר 7 שנים, רוב הזמן עם תלמידי תיכון לקראת בגרות. תואר ראשון במתמטיקה ותואר שני בחינוך מתמטי, שניהם מהאוניברסיטה העברית.\n\nאני מאמינה שאין דבר כזה ׳ראש לא מתמטי׳ — יש קצב למידה שונה ושיטה שמתאימה לכל תלמיד. בשיעורים תקבלו: דפי תרגול אישיים, מעקב שבועי, וסבלנות אמיתית לחזור על כל מה שצריך עד שהבסיס איתן.",
    highlights: ["patient", "accessible", "experienced", "results-driven"],
    subjectSlugs: ["mathematics", "statistics"],
    prices: {
      lesson45: 140,
      lesson60: 180,
      lesson75: 220,
      lesson90: 260,
    },
    totalLessonsCompleted: 1240,
    introVideoVariant: 1,
    featured: true,
  },
  {
    slug: "yossi-arbiv",
    email: "mock-yossi-arbiv@teachme.local",
    displayName: "יוסי ארביב",
    gender: "male",
    tagline: "מורה לאנגלית וללשון עברית",
    shortBio:
      "מורה לאנגלית וללשון עם 5 שנות ניסיון. מתמקד בכתיבה ובהבעה — עדיף שיפור איטי ובטוח על קסמים מהירים.",
    longBio:
      "שלום, אני יוסי. גדלתי בבאר שבע, למדתי ספרות אנגלית בבן גוריון, וכבר 5 שנים שאני מלמד אנגלית ולשון במקביל לעבודה כעורך תוכן.\n\nהשיעורים שלי דינמיים, עם הרבה תרגול בכתיבה ובניתוח טקסטים. אני מאמין שהדרך לבגרות טובה היא עבודה שיטתית קטנה ועקבית — לא בלילה אחד לפני המבחן. אצלי תלמידים בונים אוצר מילים אמיתי, לא משננים רשימות.",
    highlights: ["supportive", "dynamic", "patient", "creative"],
    subjectSlugs: ["english", "hebrew-lashon"],
    prices: {
      lesson45: 100,
      lesson60: 130,
      lesson75: 160,
      lesson90: null,
    },
    totalLessonsCompleted: 480,
    introVideoVariant: 2,
    featured: false,
  },
  {
    slug: "reuvit-ben-david",
    email: "mock-reuvit-ben-david@teachme.local",
    displayName: "רויטל בן-דוד",
    gender: "female",
    tagline: "מורה לפסיכומטרי ולאנגלית",
    shortBio:
      "מורה לפסיכומטרי עם 9 שנות ניסיון בקייטרינג קורסים. עלייה ממוצעת של 90+ נקודות בציון האמיתי.",
    longBio:
      "שלום, אני רויטל. מלמדת פסיכומטרי כבר תשע שנים, מתוכן שלוש בקבוצות קטנות בקורסי פסגות. עלייה ממוצעת אצל תלמידי אצל פסיכומטרי בלבד היא 92 נקודות מסימולציה ראשונה לבחינה האמיתית.\n\nהשיטה שלי: מבחנים שבועיים, מעקב מדויק אחרי כל סוג שאלה, ועבודה ממוקדת על הנקודות שמסבירות 80% מההפסד. אני לא משחקת על תיאוריה — אני משחקת על תוצאות.",
    highlights: ["results-driven", "experienced", "goal-oriented", "dynamic"],
    subjectSlugs: ["psychometric", "english"],
    prices: {
      lesson45: 170,
      lesson60: 220,
      lesson75: 270,
      lesson90: 320,
    },
    totalLessonsCompleted: 2100,
    introVideoVariant: 3,
    featured: true,
  },
  {
    slug: "daniel-margalit",
    email: "mock-daniel-margalit@teachme.local",
    displayName: "דניאל מרגלית",
    gender: "male",
    tagline: "מורה לפיזיקה וכימיה",
    shortBio:
      "מורה לפיזיקה וכימיה לבגרות 5 יחידות. דוקטורנט בטכניון, מלמד ביושר ובסבלנות גם את הפרקים הקשים.",
    longBio:
      "שלום, אני דניאל. דוקטורנט בפיזיקה בטכניון, מלמד תיכוניסטים כבר 6 שנים. מתמחה בבגרות 5 יחידות בפיזיקה ובכימיה ובהכנה לאולימפיאדות.\n\nאני מאמין שפיזיקה נלמדת רק כשמבינים את האינטואיציה הפיזית — לא רק את הנוסחה. אצלי מבלים זמן על ׳למה זה ככה׳ לפני שעוברים לתרגול. תלמידים מספרים שאחרי כמה שיעורים פתאום הפרקים מתחילים להתחבר.",
    highlights: ["goal-oriented", "experienced", "patient", "accessible"],
    subjectSlugs: ["physics", "chemistry", "biology"],
    prices: {
      lesson45: 130,
      lesson60: 160,
      lesson75: 195,
      lesson90: 230,
    },
    totalLessonsCompleted: 780,
    introVideoVariant: 1,
    featured: true,
  },
  {
    slug: "tamar-ezra",
    email: "mock-tamar-ezra@teachme.local",
    displayName: "תמר עזרא",
    gender: "female",
    tagline: "מורה למדעי המחשב ומתמטיקה",
    shortBio:
      "מהנדסת תוכנה ומורה למדעי המחשב. מלמדת מבני נתונים, Python, ובגרות 5 יחידות במחשב.",
    longBio:
      "שלום, אני תמר. מהנדסת תוכנה בחברת הייטק, ובחמש השנים האחרונות גם מורה פרטית למדעי המחשב. עזרתי לכ-30 תלמידים להגיע לבגרות 5 יחידות במחשב ולכ-15 לעבור ראיונות תוכנה.\n\nאני מלמדת מתוך פרויקטים — לא טסטים על נייר. תלמידים אצלי כותבים קוד אמיתי שעובד מהשיעור הראשון. השיטה: 20% תיאוריה, 80% תרגול עם משוב בזמן אמת. אם אתם רוצים ללמוד תכנות באמת, לא רק לעבור מבחן — בואו נדבר.",
    highlights: ["creative", "dynamic", "results-driven", "experienced"],
    subjectSlugs: ["computer-science", "mathematics"],
    prices: {
      lesson45: 160,
      lesson60: 200,
      lesson75: 240,
      lesson90: null,
    },
    totalLessonsCompleted: 360,
    introVideoVariant: 2,
    featured: false,
  },
];

// ---------------------------------------------------------------------------
// Mock student pool — used to populate the `studentUserId` foreign key on
// seeded ratings + bookings. Small fixed pool (4) for predictability.
// ---------------------------------------------------------------------------

interface MockStudentSpec {
  slug: string;
  email: string;
  displayName: string;
}

const MOCK_STUDENTS: MockStudentSpec[] = [
  { slug: "mock-student-1", email: "mock-student-1@teachme.local", displayName: "ל. כהן" },
  { slug: "mock-student-2", email: "mock-student-2@teachme.local", displayName: "א. מזרחי" },
  { slug: "mock-student-3", email: "mock-student-3@teachme.local", displayName: "נ. שפירא" },
  { slug: "mock-student-4", email: "mock-student-4@teachme.local", displayName: "ר. אזולאי" },
];

// ---------------------------------------------------------------------------
// Per-tutor seeded reviews. Anchored on (tutorSlug, studentSlug, score, comment).
// Past-dated bookings + lesson_sessions are derived deterministically so
// re-runs don't duplicate.
// ---------------------------------------------------------------------------

interface MockReviewSpec {
  tutorSlug: string;
  studentSlug: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  /** Days ago (the booking's `starts_at` + the rating's createdAt). */
  daysAgo: number;
}

const MOCK_REVIEWS: MockReviewSpec[] = [
  // Shira — mostly 5★
  { tutorSlug: "shira-cohen", studentSlug: "mock-student-1", score: 5, comment: "עברתי משירה ל־92 בבגרות 5 יחידות. השיטה פשוט עובדת.", daysAgo: 14 },
  { tutorSlug: "shira-cohen", studentSlug: "mock-student-2", score: 5, comment: "סבלנית, מסבירה לאט עד שזה נכנס. ממליצה בחום.", daysAgo: 28 },
  { tutorSlug: "shira-cohen", studentSlug: "mock-student-3", score: 4, comment: "מורה מצוינת, רק קצת קצב מהיר בהתחלה. אחרי 2-3 שיעורים נמצא הקצב.", daysAgo: 35 },
  { tutorSlug: "shira-cohen", studentSlug: "mock-student-4", score: 5, comment: null, daysAgo: 42 },
  { tutorSlug: "shira-cohen", studentSlug: "mock-student-1", score: 5, comment: "תודה ענקית, ממש שיניתי את הגישה שלי למתמטיקה.", daysAgo: 60 },

  // Yossi — strong with a softer 4
  { tutorSlug: "yossi-arbiv", studentSlug: "mock-student-2", score: 5, comment: "השיעורים זורמים, יוסי יודע מה שאני צריך לפני שאני שואל.", daysAgo: 7 },
  { tutorSlug: "yossi-arbiv", studentSlug: "mock-student-3", score: 4, comment: "מורה טוב, צריך לשמור על הקצב — אבל זה הבעיה שלי.", daysAgo: 21 },
  { tutorSlug: "yossi-arbiv", studentSlug: "mock-student-4", score: 5, comment: "התקדמתי מ-65 ל-88 בלשון תוך 4 חודשים.", daysAgo: 50 },
  { tutorSlug: "yossi-arbiv", studentSlug: "mock-student-1", score: 5, comment: null, daysAgo: 70 },

  // Reuvit — heavy reviews, all 5★
  { tutorSlug: "reuvit-ben-david", studentSlug: "mock-student-1", score: 5, comment: "עליתי 110 נקודות בפסיכומטרי האמיתי. מקצוענית רצינית.", daysAgo: 9 },
  { tutorSlug: "reuvit-ben-david", studentSlug: "mock-student-2", score: 5, comment: "השיטה שלה ברורה ומדויקת. בלי מילים מיותרות.", daysAgo: 18 },
  { tutorSlug: "reuvit-ben-david", studentSlug: "mock-student-3", score: 5, comment: "האדם הנכון אם רוצים תוצאות, לא הקצף שמסביב.", daysAgo: 30 },
  { tutorSlug: "reuvit-ben-david", studentSlug: "mock-student-4", score: 5, comment: "סטודנטית במשפטים בזכותה — תודה!", daysAgo: 48 },
  { tutorSlug: "reuvit-ben-david", studentSlug: "mock-student-1", score: 5, comment: null, daysAgo: 62 },
  { tutorSlug: "reuvit-ben-david", studentSlug: "mock-student-2", score: 4, comment: "מעולה, רק שהמחיר מעט יקר.", daysAgo: 80 },

  // Daniel — strong but small N
  { tutorSlug: "daniel-margalit", studentSlug: "mock-student-3", score: 5, comment: "פיזיקה לפתע הפכה הגיונית. תודה!", daysAgo: 11 },
  { tutorSlug: "daniel-margalit", studentSlug: "mock-student-1", score: 4, comment: "מורה רציני וסבלני. עוזר ברגעי לחץ.", daysAgo: 25 },
  { tutorSlug: "daniel-margalit", studentSlug: "mock-student-4", score: 5, comment: "בזכותו עברתי את הבגרות בחומרים, לא רק את הסיכום.", daysAgo: 55 },

  // Tamar — newer profile, fewer reviews
  { tutorSlug: "tamar-ezra", studentSlug: "mock-student-2", score: 5, comment: "כתבתי קוד ראשון בחיים שלי בשיעור השני. סוף סוף הגיוני.", daysAgo: 6 },
  { tutorSlug: "tamar-ezra", studentSlug: "mock-student-4", score: 5, comment: "שילוב יוצא דופן של תכנות וחינוך. מעמיקה ומסבירה ברמה גבוהה.", daysAgo: 20 },
  { tutorSlug: "tamar-ezra", studentSlug: "mock-student-1", score: 4, comment: null, daysAgo: 38 },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const host = url.match(/@([^/]+)/)?.[1] ?? "(unknown host)";
  console.log(`Seeding mock tutors into: ${host}`);
  console.log("");

  const passwordHash = await hash(MOCK_PASSWORD, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });

  const sql = neon(url);

  // Resolve subjects taxonomy once — we'll look up by slug for each tutor.
  const subjectRows = (await sql`
    SELECT id, slug FROM subjects
  `) as Array<{ id: string; slug: string }>;
  const subjectIdBySlug = new Map(subjectRows.map((r) => [r.slug, r.id]));
  if (subjectRows.length === 0) {
    console.warn(
      "  ! No subjects found. Run `pnpm db:seed` first to populate the launch taxonomy.",
    );
  }

  // ------- Mock students --------------------------------------------------
  // Belt-and-suspenders against an email collision with a REAL account:
  // even though we use a `.local` TLD the script targets prod-shaped Neon
  // branches, and a confused signup with the same address would be
  // silently corrupted by an unconditional UPSERT. So we (a) try INSERT
  // ON CONFLICT DO NOTHING, (b) read the existing row, (c) refuse to
  // touch it unless `is_mock = true`. Re-runs on a previously-seeded
  // branch hit case (c) and proceed normally.
  const studentIdBySlug = new Map<string, string>();
  for (const student of MOCK_STUDENTS) {
    const id = uuidFromSlug(student.slug);
    await sql`
      INSERT INTO users (
        id, email, password_hash, name, role, email_verified,
        locale, timezone, is_mock,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${id}, ${student.email}, ${passwordHash}, ${student.displayName}, ${"student"}, now(),
        ${"he-IL"}, ${"Asia/Jerusalem"}, ${true},
        ${"system"}, ${"mock-seed"}
      )
      ON CONFLICT (email) DO NOTHING
    `;
    const existing = (await sql`
      SELECT id, is_mock FROM users WHERE email = ${student.email} LIMIT 1
    `) as Array<{ id: string; is_mock: boolean }>;
    const row = existing[0];
    if (!row) {
      throw new Error(`mock-seed: failed to read back user ${student.email}`);
    }
    if (!row.is_mock) {
      throw new Error(
        `mock-seed: REFUSING to update non-mock user ${student.email} (id=${row.id}). ` +
          `Either delete the conflicting row manually or change the mock slug.`,
      );
    }
    studentIdBySlug.set(student.slug, row.id);
    console.log(`  + student ${student.email} (${row.id})`);
  }

  // ------- Mock tutors ----------------------------------------------------
  const tutorIdBySlug = new Map<string, string>();
  for (const tutor of MOCK_TUTORS) {
    const id = uuidFromSlug(tutor.slug);
    tutorIdBySlug.set(tutor.slug, id);

    // 1) user row — same is_mock guard as the student loop above; refuse
    // to mutate a row that isn't already a mock.
    await sql`
      INSERT INTO users (
        id, email, password_hash, name, role, email_verified,
        locale, timezone, is_mock,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${id}, ${tutor.email}, ${passwordHash}, ${tutor.displayName}, ${"tutor"}, now(),
        ${"he-IL"}, ${"Asia/Jerusalem"}, ${true},
        ${"system"}, ${"mock-seed"}
      )
      ON CONFLICT (email) DO NOTHING
    `;
    const tutorRow = (await sql`
      SELECT id, is_mock FROM users WHERE email = ${tutor.email} LIMIT 1
    `) as Array<{ id: string; is_mock: boolean }>;
    if (!tutorRow[0]) {
      throw new Error(`mock-seed: failed to read back user ${tutor.email}`);
    }
    if (!tutorRow[0].is_mock) {
      throw new Error(
        `mock-seed: REFUSING to update non-mock user ${tutor.email} (id=${tutorRow[0].id}).`,
      );
    }

    // 2) tutor_profiles row — discoverable + approved
    const photoKey = `mock-defaults/photo-${tutor.slug}.jpg`;
    const videoKey = `mock-defaults/video-${tutor.introVideoVariant}.mp4`;
    await sql`
      INSERT INTO tutor_profiles (
        user_id, display_name, gender, bio,
        tagline, short_bio, long_bio, highlights,
        recommendation_visible, recommendation_headline, recommendation_sub,
        lesson_45_price_ils, hourly_price_ils, lesson_75_price_ils, lesson_90_price_ils,
        lesson_length_minutes,
        vetting_status, is_active, is_featured,
        intro_video_r2_key, profile_photo_r2_key,
        total_lessons_completed,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${id}, ${tutor.displayName}, ${tutor.gender}, ${tutor.longBio},
        ${tutor.tagline}, ${tutor.shortBio}, ${tutor.longBio}, ${tutor.highlights},
        ${false}, ${null}, ${null},
        ${tutor.prices.lesson45}, ${tutor.prices.lesson60}, ${tutor.prices.lesson75}, ${tutor.prices.lesson90},
        ${60},
        ${"approved"}, ${true}, ${tutor.featured},
        ${videoKey}, ${photoKey},
        ${tutor.totalLessonsCompleted},
        ${"system"}, ${"mock-seed"}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        vetting_status = 'approved',
        is_active = true,
        is_featured = EXCLUDED.is_featured,
        deleted_at = NULL,
        display_name = EXCLUDED.display_name,
        gender = EXCLUDED.gender,
        bio = EXCLUDED.bio,
        tagline = EXCLUDED.tagline,
        short_bio = EXCLUDED.short_bio,
        long_bio = EXCLUDED.long_bio,
        highlights = EXCLUDED.highlights,
        lesson_45_price_ils = EXCLUDED.lesson_45_price_ils,
        hourly_price_ils = EXCLUDED.hourly_price_ils,
        lesson_75_price_ils = EXCLUDED.lesson_75_price_ils,
        lesson_90_price_ils = EXCLUDED.lesson_90_price_ils,
        intro_video_r2_key = EXCLUDED.intro_video_r2_key,
        profile_photo_r2_key = EXCLUDED.profile_photo_r2_key,
        total_lessons_completed = EXCLUDED.total_lessons_completed,
        updated_at = now(),
        updated_by_kind = ${"system"},
        updated_by_actor = ${"mock-seed"}
    `;

    // 3) subjects
    let subjectsAttached = 0;
    for (const slug of tutor.subjectSlugs) {
      const subjectId = subjectIdBySlug.get(slug);
      if (!subjectId) continue;
      await sql`
        INSERT INTO tutor_subjects (
          tutor_user_id, subject_id,
          created_by_kind, created_by_actor
        )
        VALUES (
          ${id}, ${subjectId},
          ${"system"}, ${"mock-seed"}
        )
        ON CONFLICT (tutor_user_id, subject_id) DO NOTHING
      `;
      subjectsAttached++;
    }

    // 4) availability — Sun–Thu 14:00–22:00 in 30-min cells, only when
    //    no recurring rows exist (same guard as seed-dogfood).
    const existing = (await sql`
      SELECT COUNT(*)::int AS n FROM tutor_availability
      WHERE tutor_user_id = ${id} AND kind = 'recurring'
    `) as Array<{ n: number }>;
    let availabilityInserted = 0;
    if ((existing[0]?.n ?? 0) === 0) {
      for (let weekday = 0; weekday <= 4; weekday++) {
        for (let half = 0; half < 16; half++) {
          const startMinutes = 14 * 60 + half * 30;
          const endMinutes = startMinutes + 30;
          const fmt = (m: number) =>
            `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
          await sql`
            INSERT INTO tutor_availability (
              tutor_user_id, kind, weekday, start_time, end_time,
              created_by_kind, created_by_actor
            )
            VALUES (
              ${id}, ${"recurring"}, ${weekday}, ${fmt(startMinutes)}, ${fmt(endMinutes)},
              ${"system"}, ${"mock-seed"}
            )
          `;
          availabilityInserted++;
        }
      }
    }
    console.log(
      `  + tutor ${tutor.email} (${id}) — ${subjectsAttached} subjects, ${availabilityInserted} availability rows`,
    );
  }

  // ------- Reviews (past bookings + lesson_sessions + ratings) -----------
  // Each review is anchored on (tutor, student, daysAgo) — deterministic
  // starts_at = today minus daysAgo days at 18:00 IL. Skip-on-existing via
  // SELECT pre-check.
  let reviewsCreated = 0;
  let reviewsSkipped = 0;
  for (const review of MOCK_REVIEWS) {
    const tutorId = tutorIdBySlug.get(review.tutorSlug);
    const studentId = studentIdBySlug.get(review.studentSlug);
    if (!tutorId || !studentId) continue;

    const tutor = MOCK_TUTORS.find((t) => t.slug === review.tutorSlug)!;
    const subjectId = subjectIdBySlug.get(tutor.subjectSlugs[0]!) ?? null;
    const priceIls = tutor.prices.lesson60;
    const platformCommissionIls = Math.round(priceIls * 0.15);
    const tutorPayoutIls = priceIls - platformCommissionIls;
    const startsAt = bookingStartFromAnchor(review.daysAgo);

    // Idempotency: skip if a booking already exists for this triple.
    const existingBooking = (await sql`
      SELECT id FROM bookings
      WHERE tutor_user_id = ${tutorId}
        AND student_user_id = ${studentId}
        AND starts_at = ${startsAt.toISOString()}
      LIMIT 1
    `) as Array<{ id: string }>;

    let bookingId: string;
    if (existingBooking.length > 0) {
      bookingId = existingBooking[0]!.id;
      reviewsSkipped++;
    } else {
      const inserted = (await sql`
        INSERT INTO bookings (
          student_user_id, payer_user_id, tutor_user_id, subject_id,
          starts_at, duration_minutes, status,
          price_ils, platform_commission_ils, tutor_payout_ils,
          created_by_kind, created_by_actor
        )
        VALUES (
          ${studentId}, ${studentId}, ${tutorId}, ${subjectId},
          ${startsAt.toISOString()}, ${60}, ${"completed"},
          ${priceIls}, ${platformCommissionIls}, ${tutorPayoutIls},
          ${"system"}, ${"mock-seed"}
        )
        RETURNING id
      `) as Array<{ id: string }>;
      bookingId = inserted[0]!.id;
      reviewsCreated++;
    }

    // lesson_sessions — one per booking. UNIQUE (booking_id) means this is
    // an upsert by booking.
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
        ${"system"}, ${"mock-seed"}
      )
      ON CONFLICT (booking_id) DO UPDATE SET
        status = 'completed',
        updated_at = now(),
        updated_by_kind = ${"system"},
        updated_by_actor = ${"mock-seed"}
      RETURNING id
    `) as Array<{ id: string }>;
    const sessionId = sessionRows[0]!.id;

    // ratings — one per lesson_session. UNIQUE constraint catches
    // re-runs. The `WHERE` clause on the UPDATE branch guards against
    // clobbering a REAL student-authored rating that happens to share
    // a (since-overlapping) lesson_session_id — the conflict update
    // only runs when the existing row was itself seeded by mock-seed.
    await sql`
      INSERT INTO ratings (
        lesson_session_id, student_user_id, tutor_user_id, score, comment,
        created_by_kind, created_by_actor
      )
      VALUES (
        ${sessionId}, ${studentId}, ${tutorId}, ${review.score}, ${review.comment},
        ${"system"}, ${"mock-seed"}
      )
      ON CONFLICT (lesson_session_id) DO UPDATE SET
        score = EXCLUDED.score,
        comment = EXCLUDED.comment,
        updated_at = now(),
        updated_by_kind = ${"system"},
        updated_by_actor = ${"mock-seed"}
      WHERE ratings.created_by_actor = ${"mock-seed"}
    `;
  }
  console.log(`\n  Reviews: ${reviewsCreated} created, ${reviewsSkipped} preserved`);

  // ------- Recompute average_rating + rating_count per tutor --------------
  // Cheaper than maintaining them inline above; the rating-write Server
  // Action increments them in production, but the seed bulk-inserts and
  // then recomputes once at the end.
  for (const tutor of MOCK_TUTORS) {
    const tutorId = tutorIdBySlug.get(tutor.slug);
    if (!tutorId) continue;
    await sql`
      UPDATE tutor_profiles
      SET average_rating = sub.avg_score,
          rating_count = sub.cnt,
          updated_at = now(),
          updated_by_kind = ${"system"},
          updated_by_actor = ${"mock-seed"}
      FROM (
        SELECT
          AVG(score)::numeric(3,2) AS avg_score,
          COUNT(*)::int AS cnt
        FROM ratings WHERE tutor_user_id = ${tutorId}
      ) sub
      WHERE tutor_profiles.user_id = ${tutorId}
    `;
  }

  console.log("\nDone.");
  console.log(
    `Sign in to any mock account at /signin with password "${MOCK_PASSWORD}" — or just browse /browse anonymously.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
