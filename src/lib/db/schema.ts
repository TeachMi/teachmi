// src/lib/db/schema.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  jsonb,
  date,
  time,
  numeric,
  uniqueIndex,
  primaryKey,
  unique,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Standard meta columns on all business tables.
 * Excluded on Auth.js framework tables and `webhook_idempotency_keys`.
 */
const metaCols = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  createdByKind: text("created_by_kind").notNull(),    // 'user'|'admin'|'system'|'webhook'|'inngest'|'migration'|'manual'
  createdByActor: text("created_by_actor").notNull(),  // user UUID, webhook source, fn name, or 'unknown'
  updatedByKind: text("updated_by_kind"),
  updatedByActor: text("updated_by_actor"),
};

const authUserMetaCols = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  createdByKind: text("created_by_kind").notNull().default("system"),
  createdByActor: text("created_by_actor").notNull().default("authjs"),
  updatedByKind: text("updated_by_kind"),
  updatedByActor: text("updated_by_actor"),
};

// ------------------------------------------------------------------------------
// users - identity + auth + role + locale + soft-delete
// ------------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Auth.js v5 standard fields
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    // TeachMe extensions
    passwordHash: text("password_hash"),                                            // NULL for OAuth-only users; argon2id (NFR12)
    role: text("role", { enum: ["student", "tutor", "admin"] }).notNull().default("student"),
    twoFactorSecret: text("two_factor_secret"),                                     // TOTP secret (MVP 2; encrypted at app layer)
    twoFactorVerifiedAt: timestamp("two_factor_verified_at", { withTimezone: true }),
    // Parent-account model (FR8 / Story 1.19) - under-18 dependents have parentUserId set;
    // dependents have NULL email/passwordHash (no separate sign-in path).
    parentUserId: uuid("parent_user_id").references((): AnyPgColumn => users.id),
    // Locale (Hebrew RTL is foundational - concern #6)
    locale: text("locale").notNull().default("he-IL"),
    timezone: text("timezone").notNull().default("Asia/Jerusalem"),
    // Soft-delete (FR7)
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...authUserMetaCols,
    // NOTE: consent timestamps removed 2026-05-04 - single source of truth is `consent_receipts`.
    // NOTE: dual-role support (FR5) deferred to Phase 2+; `role` remains single-value enum.
  },
  (t) => ({
    emailUnique: unique("uq_users_email").on(t.email),
    roleIdx: index("idx_users_role").on(t.role),
    parentIdx: index("idx_users_parent").on(t.parentUserId),
    deletedAtIdx: index("idx_users_deleted_at").on(t.deletedAt),
  }),
);

// ------------------------------------------------------------------------------
// accounts - Auth.js OAuth provider links (one row per (provider, providerAccountId))
// ------------------------------------------------------------------------------
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),                            // 'oauth' | 'oidc' | 'email' | 'credentials'
    provider: text("provider").notNull(),                    // 'google', 'apple' (deferred), 'credentials'
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    providerAccountUnique: unique("uq_accounts_provider_account").on(t.provider, t.providerAccountId),
    userIdIdx: index("idx_accounts_user_id").on(t.userId),
  }),
);

// ------------------------------------------------------------------------------
// sessions - Auth.js DB-backed sessions (per AD-09)
// ------------------------------------------------------------------------------
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionToken: text("session_token").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({
    sessionTokenUnique: unique("uq_sessions_session_token").on(t.sessionToken),
    userIdIdx: index("idx_sessions_user_id").on(t.userId),
    expiresIdx: index("idx_sessions_expires").on(t.expires),       // for janitor cleanup
  }),
);

// ------------------------------------------------------------------------------
// verification_tokens - Auth.js email-link tokens
// ------------------------------------------------------------------------------
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),          // typically email
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ------------------------------------------------------------------------------
// password_reset_tokens - Story 1.15 FR4 — separate table from verificationTokens
// despite the identical shape. Two reasons (see story Dev Notes):
//   1. Asymmetric consumption: verify is atomic-on-link-click; reset is a
//      two-request flow (click lands user on form, submit consumes token).
//   2. Independent TTL tunability (future) and a self-evident audit surface
//      ("what is this token's purpose" = the table name, no inference).
// Same shape as verificationTokens deliberately — the helpers + lookup
// patterns are interchangeable, only the table differs.
// ------------------------------------------------------------------------------
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    identifier: text("identifier").notNull(),          // email (lower-cased)
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ------------------------------------------------------------------------------
// audit_events - append-only (NFR16 + concern #3)
// Written same-tx with the action it audits via lib/db/audit.ts helper.
// ------------------------------------------------------------------------------
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    eventType: text("event_type").notNull(),                                    // e.g., 'booking.created', 'tutor.approved'
    actorKind: text("actor_kind").notNull(),                                    // 'user'|'admin'|'system'|'webhook'|'inngest'
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }), // NULL when actor is system/webhook; SET NULL on user delete so cleanup-on-error in auth flows isn't blocked by FK while audit trail still records "actor since deleted" (Story 1.21 round-1 fix)
    actorMeta: text("actor_meta"),                                              // optional descriptor (webhook source, fn name)
    targetType: text("target_type").notNull(),                                  // 'booking', 'tutor_profile', etc.
    targetId: uuid("target_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),              // diff / context
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: index("idx_audit_events_target").on(t.targetType, t.targetId, t.createdAt),
    actorIdx: index("idx_audit_events_actor").on(t.actorId, t.createdAt),
    eventTypeIdx: index("idx_audit_events_event_type").on(t.eventType, t.createdAt),
  }),
);
// NB: append-only - no updated_at, no deleted_at, no updated_by. Insert-only enforced at app layer.

// ------------------------------------------------------------------------------
// webhook_idempotency_keys - NFR18 + concern #4
// Single-write-only; no meta cols (would be noise).
// ------------------------------------------------------------------------------
export const webhookIdempotencyKeys = pgTable(
  "webhook_idempotency_keys",
  {
    vendor: text("vendor").notNull(),               // 'payme' | 'green-invoice'
    key: text("key").notNull(),                     // vendor-provided idempotency key or txn id
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    responseBody: jsonb("response_body"),           // optional cached response (for replay)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.vendor, t.key] }),
  }),
);

// ------------------------------------------------------------------------------
// student_settings - 1:1 with users where role='student'. Optional (not all students need overrides).
// ------------------------------------------------------------------------------
export const studentSettings = pgTable("student_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  preferredLanguage: text("preferred_language").notNull().default("he"),
  ...metaCols,
  // NOTE: notification fields removed 2026-05-04 - single source of truth is `notification_preferences`.
});

// ------------------------------------------------------------------------------
// tutor_profiles - 1:1 with users where role='tutor'
// ------------------------------------------------------------------------------
export const tutorProfiles = pgTable(
  "tutor_profiles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    city: text("city"),
    introVideoR2Key: text("intro_video_r2_key"),                                // R2 object key; presigned URL for view
    profilePhotoR2Key: text("profile_photo_r2_key"),
    hourlyPriceIls: integer("hourly_price_ils").notNull(),                      // whole shekels
    lessonLengthMinutes: smallint("lesson_length_minutes").notNull().default(60),
    commissionRateOverride: numeric("commission_rate_override", { precision: 5, scale: 4 }), // NULL = platform default; e.g., 0.2000 = 20%
    // Vetting
    vettingStatus: text("vetting_status", { enum: ["pending", "approved", "rejected", "paused"] }).notNull().default("pending"),
    vettingNotes: text("vetting_notes"),
    vettedByAdminId: uuid("vetted_by_admin_id").references(() => users.id),
    vettedAt: timestamp("vetted_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(false),                    // wizard complete + vetted
    // Denormalized aggregates (kept eventually-consistent via app code)
    totalLessonsCompleted: integer("total_lessons_completed").notNull().default(0),
    averageRating: numeric("average_rating", { precision: 3, scale: 2 }),       // null until first rating
    ratingCount: integer("rating_count").notNull().default(0),
    // Soft-delete (PII)
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...metaCols,
  },
  (t) => ({
    userIdUnique: unique("uq_tutor_profiles_user_id").on(t.userId),
    vettingStatusIdx: index("idx_tutor_profiles_vetting_status").on(t.vettingStatus),
    isActiveIdx: index("idx_tutor_profiles_is_active").on(t.isActive),
    cityIdx: index("idx_tutor_profiles_city").on(t.city),
    priceIdx: index("idx_tutor_profiles_price").on(t.hourlyPriceIls),
    avgRatingIdx: index("idx_tutor_profiles_avg_rating").on(t.averageRating),  // nulls last for browse sort
    deletedAtIdx: index("idx_tutor_profiles_deleted_at").on(t.deletedAt),
  }),
);

// ------------------------------------------------------------------------------
// tutor_documents - FR10 vetting docs (ID, qualifications). Stored in R2; metadata here.
// ------------------------------------------------------------------------------
export const tutorDocuments = pgTable(
  "tutor_documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    docType: text("doc_type", { enum: ["id", "qualification", "certificate", "other"] }).notNull(),
    r2Key: text("r2_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    vettingStatus: text("vetting_status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
    vettingNotes: text("vetting_notes"),
    verifiedByAdminId: uuid("verified_by_admin_id").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...metaCols,
  },
  (t) => ({
    tutorIdx: index("idx_tutor_documents_tutor").on(t.tutorUserId),
    statusIdx: index("idx_tutor_documents_status").on(t.vettingStatus),
  }),
);

// ------------------------------------------------------------------------------
// tutor_wizard_state - per-phase rows (5 phases for tutor onboarding wizard)
// User can navigate back, save partial progress, return days later.
// ------------------------------------------------------------------------------
export const tutorWizardState = pgTable(
  "tutor_wizard_state",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    phase: smallint("phase").notNull(),                                        // 1, 2, 3, 4, 5 (5 = Osek Zair)
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),                   // phase-specific form data
    completedAt: timestamp("completed_at", { withTimezone: true }),            // NULL = draft; non-null = phase submitted
    ...metaCols,
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.phase] }),
  }),
);

// ------------------------------------------------------------------------------
// subjects - admin-managed taxonomy (FR21 + locked: 11 launch subjects)
// ------------------------------------------------------------------------------
export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),                                              // 'mathematics', 'psychometric', etc.
    displayNameHe: text("display_name_he").notNull(),
    displayNameEn: text("display_name_en"),
    category: text("category"),                                                // 'core'|'science'|'humanities'|'preparatory'
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...metaCols,
  },
  (t) => ({
    slugUnique: unique("uq_subjects_slug").on(t.slug),
    activeIdx: index("idx_subjects_active").on(t.isActive, t.sortOrder),
  }),
);

// ------------------------------------------------------------------------------
// tutor_subjects - junction (M:N tutor <-> subject)
// Used by browse query: `WHERE subject_id IN (...)` -> JOIN tutor_profiles
// ------------------------------------------------------------------------------
export const tutorSubjects = pgTable(
  "tutor_subjects",
  {
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
    proficiencyNote: text("proficiency_note"),                                 // optional: "matriculation level", "advanced", etc.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByKind: text("created_by_kind").notNull(),
    createdByActor: text("created_by_actor").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tutorUserId, t.subjectId] }),
    subjectIdx: index("idx_tutor_subjects_subject").on(t.subjectId),
  }),
);

// ------------------------------------------------------------------------------
// tutor_availability - recurring rules + exception overrides
// Two row types: 'recurring' (weekly pattern) and 'exception_blocked' / 'exception_available' (date-specific)
// Booking-calendar query = recurring rules union exceptions - existing bookings
// ------------------------------------------------------------------------------
export const tutorAvailability = pgTable(
  "tutor_availability",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["recurring", "exception_blocked", "exception_available"] }).notNull(),
    weekday: smallint("weekday"),                                              // 0=Sunday .. 6=Saturday; only for kind='recurring'
    date: date("date"),                                                        // only for kind='exception_*'
    startTime: time("start_time").notNull(),                                   // wall time in Asia/Jerusalem
    endTime: time("end_time").notNull(),
    validFrom: date("valid_from"),                                             // null = unbounded; useful for "this term only"
    validUntil: date("valid_until"),
    ...metaCols,
  },
  (t) => ({
    recurringIdx: index("idx_tutor_availability_recurring").on(t.tutorUserId, t.kind, t.weekday),
    exceptionIdx: index("idx_tutor_availability_exception").on(t.tutorUserId, t.date),
    kindCheck: check("ck_tutor_availability_kind", sql`(
      (${t.kind} = 'recurring' AND ${t.weekday} IS NOT NULL AND ${t.date} IS NULL) OR
      (${t.kind} IN ('exception_blocked', 'exception_available') AND ${t.date} IS NOT NULL AND ${t.weekday} IS NULL)
    )`),
    timeOrderCheck: check("ck_tutor_availability_time_order", sql`${t.startTime} < ${t.endTime}`),
  }),
);

// ------------------------------------------------------------------------------
// bookings - student books a slot with a tutor
// Key invariants: NFR21 zero double-booking via UNIQUE partial index + SELECT FOR UPDATE in Server Action.
// ------------------------------------------------------------------------------
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    studentUserId: uuid("student_user_id").notNull().references(() => users.id),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id),
    subjectId: uuid("subject_id").references(() => subjects.id),               // which subject was booked
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),        // canonical UTC; display in IL TZ
    durationMinutes: smallint("duration_minutes").notNull(),
    status: text("status", {
      enum: ["pending_payment", "confirmed", "cancelled", "completed", "no_show"],
    }).notNull().default("pending_payment"),
    // Price snapshot - captured at booking time, not derived live (audit trail)
    priceIls: integer("price_ils").notNull(),
    platformCommissionIls: integer("platform_commission_ils").notNull(),
    tutorPayoutIls: integer("tutor_payout_ils").notNull(),
    // Cancellation
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id),
    ...metaCols,
  },
  (t) => ({
    tutorCalendarIdx: index("idx_bookings_tutor_calendar").on(t.tutorUserId, t.startsAt),
    studentHistoryIdx: index("idx_bookings_student_history").on(t.studentUserId, t.startsAt.desc()),
    statusIdx: index("idx_bookings_status_starts_at").on(t.status, t.startsAt),
    // Partial UNIQUE: prevents two ACTIVE bookings on the same tutor + slot.
    // Cancelled bookings don't block re-booking.
    activeSlotUnique: uniqueIndex("uq_bookings_active_slot")
      .on(t.tutorUserId, t.startsAt)
      .where(sql`${t.status} in ('pending_payment', 'confirmed')`),
  }),
);

// ------------------------------------------------------------------------------
// lesson_sessions - 1:1 with bookings; tracks the actual lesson lifecycle
// ------------------------------------------------------------------------------
export const lessonSessions = pgTable(
  "lesson_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    roomProvider: text("room_provider", { enum: ["stub", "daily"] }).notNull().default("stub"),
    roomUrl: text("room_url"),                                                 // Daily.co room URL (or null for stub)
    status: text("status", {
      enum: ["scheduled", "in_progress", "completed", "no_show_student", "no_show_tutor", "cancelled", "tech_failure"],
    }).notNull().default("scheduled"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationActualMinutes: integer("duration_actual_minutes"),                 // computed; may differ from booking.durationMinutes
    ...metaCols,
  },
  (t) => ({
    bookingIdUnique: unique("uq_lesson_sessions_booking_id").on(t.bookingId),
    statusIdx: index("idx_lesson_sessions_status").on(t.status),
  }),
);

// ------------------------------------------------------------------------------
// tutor_student_notes - FR32: tutor's PRIVATE working notes per student (cross-session)
// 1 row per (tutor, student) pair; persistent across all lessons between them.
// Tutor-only by default; admin disclosure per FR53.
// ------------------------------------------------------------------------------
export const tutorStudentNotes = pgTable(
  "tutor_student_notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    studentUserId: uuid("student_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),                                         // markdown
    ...metaCols,
  },
  (t) => ({
    pairUnique: unique("uq_tutor_student_notes_pair").on(t.tutorUserId, t.studentUserId),
    tutorIdx: index("idx_tutor_student_notes_tutor").on(t.tutorUserId),
    studentIdx: index("idx_tutor_student_notes_student").on(t.studentUserId),
  }),
);

// ------------------------------------------------------------------------------
// student_lesson_notes - FR34: student's PRIVATE notes per lesson
// 1 row per (student, lesson_session) pair; not shared with tutor.
// Admin disclosure per FR53.
// ------------------------------------------------------------------------------
export const studentLessonNotes = pgTable(
  "student_lesson_notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    studentUserId: uuid("student_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonSessionId: uuid("lesson_session_id").notNull().references(() => lessonSessions.id, { onDelete: "cascade" }),
    content: text("content").notNull(),                                         // markdown
    ...metaCols,
  },
  (t) => ({
    pairUnique: unique("uq_student_lesson_notes_pair").on(t.studentUserId, t.lessonSessionId),
    studentIdx: index("idx_student_lesson_notes_student").on(t.studentUserId, t.createdAt.desc()),
  }),
);

// ------------------------------------------------------------------------------
// session_summaries - FR33 tutor-published summaries with append-only versioning
// Visible to student in lesson history (read-only). Multiple versions per lesson if tutor
// republishes - latest is max(version). Per AR-18 audit trail, prior versions retained.
// ------------------------------------------------------------------------------
export const sessionSummaries = pgTable(
  "session_summaries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    lessonSessionId: uuid("lesson_session_id").notNull().references(() => lessonSessions.id, { onDelete: "cascade" }),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id),
    content: text("content").notNull(),                                          // markdown
    version: smallint("version").notNull().default(1),                          // increments on republish
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ...metaCols,
  },
  (t) => ({
    lessonVersionUnique: unique("uq_session_summaries_lesson_version").on(t.lessonSessionId, t.version),
    lessonLatestIdx: index("idx_session_summaries_lesson_latest").on(t.lessonSessionId, t.version.desc()),
  }),
);

// ------------------------------------------------------------------------------
// ratings - FR36 advisory-only (concern #10)
// IMPORTANT: writes to this table NEVER trigger automatic tutor-status changes.
// Aggregation into tutor_profiles.average_rating is via app code, not DB triggers.
// ------------------------------------------------------------------------------
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    lessonSessionId: uuid("lesson_session_id").notNull().references(() => lessonSessions.id, { onDelete: "cascade" }),
    studentUserId: uuid("student_user_id").notNull().references(() => users.id),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id),    // denormalized for query perf
    score: smallint("score").notNull(),
    comment: text("comment"),
    ...metaCols,
  },
  (t) => ({
    lessonSessionIdUnique: unique("uq_ratings_lesson_session_id").on(t.lessonSessionId),
    tutorIdx: index("idx_ratings_tutor").on(t.tutorUserId, t.createdAt.desc()),
    scoreCheck: check("ck_ratings_score", sql`${t.score} BETWEEN 1 AND 5`),
  }),
);

// ------------------------------------------------------------------------------
// disputes - FR37 / FR52 / FR56
// status = workflow state; decision = admin's verdict (separate from workflow per Story 7.6).
// kind discriminates no-show flag (FR37) from problem-report (FR38).
// ------------------------------------------------------------------------------
export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    lessonSessionId: uuid("lesson_session_id").references(() => lessonSessions.id),  // nullable: problem-reports may not target a specific lesson
    filedByUserId: uuid("filed_by_user_id").notNull().references(() => users.id),
    kind: text("kind", { enum: ["no_show", "problem_report"] }).notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    evidenceR2Keys: text("evidence_r2_keys").array(),                          // text[] of R2 object keys
    status: text("status", {
      enum: ["open", "under_review", "resolved", "escalated"],
    }).notNull().default("open"),
    decision: text("decision", {
      enum: [
        "no_show_confirmed",
        "no_fault_both_refunded",
        "tutor_warned",
        "student_warned",
        "partial_refund",
        "dismissed",
        "other",
      ],
    }),                                                                          // null until resolved
    resolutionRationale: text("resolution_rationale"),                           // admin's reasoning (free text)
    resolvedByAdminId: uuid("resolved_by_admin_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...metaCols,
  },
  (t) => ({
    statusIdx: index("idx_disputes_status").on(t.status, t.createdAt),
    filedByIdx: index("idx_disputes_filed_by").on(t.filedByUserId, t.createdAt.desc()),
    lessonSessionIdx: index("idx_disputes_lesson_session").on(t.lessonSessionId),
    kindIdx: index("idx_disputes_kind").on(t.kind, t.createdAt.desc()),
  }),
);

// ------------------------------------------------------------------------------
// dispute_messages - FR56 thread of messages on a dispute
// First message (is_initial_report=true) holds the original report body.
// Reply messages by reporter, respondent, or admin. recipientScope controls visibility.
// ------------------------------------------------------------------------------
export const disputeMessages = pgTable(
  "dispute_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    disputeId: uuid("dispute_id").notNull().references(() => disputes.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    authorRole: text("author_role", { enum: ["reporter", "respondent", "admin"] }).notNull(),
    recipientScope: text("recipient_scope", { enum: ["reporter", "both_parties", "founders_only"] }).notNull(),
    body: text("body").notNull(),
    isInitialReport: boolean("is_initial_report").notNull().default(false),
    ...metaCols,
  },
  (t) => ({
    disputeIdx: index("idx_dispute_messages_dispute").on(t.disputeId, t.createdAt),
  }),
);

// ------------------------------------------------------------------------------
// tutor_green_invoice_business - per-tutor isolated GI business (concern #1)
// Provisioned at MVP 2 onboarding. API token encrypted at app layer (KMS-equivalent).
// ------------------------------------------------------------------------------
export const tutorGreenInvoiceBusiness = pgTable(
  "tutor_green_invoice_business",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    giBusinessId: text("gi_business_id").notNull(),                            // Green Invoice's business ID
    giApiTokenEncrypted: text("gi_api_token_encrypted").notNull(),             // AES-GCM ciphertext
    giApiTokenIv: text("gi_api_token_iv").notNull(),                           // AES-GCM IV
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }).notNull(),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    ...metaCols,
  },
  (t) => ({
    tutorIdUnique: unique("uq_tutor_green_invoice_business_tutor").on(t.tutorUserId),
    giBusinessIdUnique: unique("uq_tutor_green_invoice_business_gi_id").on(t.giBusinessId),
  }),
);

// ------------------------------------------------------------------------------
// payments - FR44; UNIQUE on payme_transaction_id prevents duplicate webhook processing
// ------------------------------------------------------------------------------
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    paymeTransactionId: text("payme_transaction_id"),                          // null until PayMe responds
    amountIls: integer("amount_ils").notNull(),
    platformCommissionIls: integer("platform_commission_ils").notNull(),
    tutorPayoutIls: integer("tutor_payout_ils").notNull(),
    status: text("status", {
      enum: ["pending", "authorized", "settled", "failed", "refunded", "invoiced"],
    }).notNull().default("pending"),
    failureReason: text("failure_reason"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    ...metaCols,
  },
  (t) => ({
    paymeTxnUnique: unique("uq_payments_payme_transaction_id").on(t.paymeTransactionId),
    bookingIdx: index("idx_payments_booking").on(t.bookingId),
    statusIdx: index("idx_payments_status").on(t.status, t.createdAt),
  }),
);

// ------------------------------------------------------------------------------
// invoices - Tax Ruling 3956/16 4-doc set
// ------------------------------------------------------------------------------
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    docType: text("doc_type", {
      enum: [
        // 4-doc set per Tax Ruling 3956/16 (issuance - Story 8.3)
        "customer_receipt",
        "transaction_invoice",
        "commission_tax_invoice",
        "commission_receipt",
        // Credit-note set for refunds (Story 8.5 / FR29) - mirrors the 4-doc structure
        "customer_credit_note",
        "transaction_credit_note",
        "commission_tax_credit_note",
        "commission_credit_note",
      ],
    }).notNull(),
    giBusiness: text("gi_business", { enum: ["tutor", "platform"] }).notNull(), // which GI business issued it
    giDocId: text("gi_doc_id"),                                                 // Green Invoice document ID
    pdfR2Key: text("pdf_r2_key"),                                               // cached PDF in R2
    amountIls: integer("amount_ils").notNull(),
    status: text("status", { enum: ["pending", "issued", "failed"] }).notNull().default("pending"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    ...metaCols,
  },
  (t) => ({
    paymentDocTypeUnique: unique("uq_invoices_payment_doc_type").on(t.paymentId, t.docType),  // exactly one of each per payment
    giDocIdIdx: index("idx_invoices_gi_doc_id").on(t.giDocId),
    statusIdx: index("idx_invoices_status").on(t.status),
  }),
);

// ------------------------------------------------------------------------------
// payouts - FR49; only marked 'ready' after all 4 invoices confirmed for the payment
// ------------------------------------------------------------------------------
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => users.id),
    paymentId: uuid("payment_id").notNull().references(() => payments.id),
    amountIls: integer("amount_ils").notNull(),
    status: text("status", { enum: ["pending_invoices", "ready", "paid", "on_hold"] }).notNull().default("pending_invoices"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymePayoutReference: text("payme_payout_reference"),
    holdReason: text("hold_reason"),
    ...metaCols,
  },
  (t) => ({
    paymentIdUnique: unique("uq_payouts_payment_id").on(t.paymentId),                    // one payout per payment
    tutorIdx: index("idx_payouts_tutor").on(t.tutorUserId, t.createdAt.desc()),
    statusIdx: index("idx_payouts_status").on(t.status),
  }),
);

// ------------------------------------------------------------------------------
// notification_preferences - FR42; 1:1 with users
// Marketing channels can be opted in independently. Transactional email cannot be
// opted out (regulatory + functional). transactional_sms / transactional_whatsapp
// are optional layered channels (default off until ED-03 closes for WhatsApp).
// ------------------------------------------------------------------------------
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Marketing - each channel opted-in independently
    marketingEmail: boolean("marketing_email").notNull().default(false),
    marketingSms: boolean("marketing_sms").notNull().default(false),
    marketingWhatsapp: boolean("marketing_whatsapp").notNull().default(false),
    // Transactional - email always on (regulatory); SMS/WhatsApp optional, default off
    transactionalEmail: boolean("transactional_email").notNull().default(true),
    transactionalSms: boolean("transactional_sms").notNull().default(false),
    transactionalWhatsapp: boolean("transactional_whatsapp").notNull().default(false),
    ...metaCols,
  },
  (t) => ({
    userIdUnique: unique("uq_notification_preferences_user").on(t.userId),
  }),
);

// ------------------------------------------------------------------------------
// consent_receipts - FR11 (Tutor Agreement) + FR59 (Privacy Policy) + FR60 (marketing opt-in/out)
// IMMUTABLE per NFR16: no UPDATE, no DELETE (enforce via Postgres trigger when migration runs).
// One row per (user, document_type, document_version) acceptance event. Re-acceptances on
// document version change produce additional rows. Marketing opt-out also writes a row
// (kind='marketing_opt_out') so the audit trail captures every consent state transition.
// ------------------------------------------------------------------------------
export const consentReceipts = pgTable(
  "consent_receipts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    documentType: text("document_type", {
      enum: [
        "privacy_policy",
        "terms_of_service",
        "tutor_agreement",
        "code_of_conduct",
        "marketing_opt_in",
        "marketing_opt_out",
      ],
    }).notNull(),
    documentVersion: text("document_version").notNull(),                        // e.g., 'v1.2.0' or '2026-05-01'
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    signature: text("signature"),                                                // tutor agreement e-signature payload (base64) - NULL for non-signed types
    documentSnapshot: text("document_snapshot"),                                 // optional copy of doc body at acceptance for stronger audit
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByKind: text("created_by_kind").notNull(),
    createdByActor: text("created_by_actor").notNull(),
    // No updatedAt / updatedBy - immutable per NFR16
  },
  (t) => ({
    userTypeIdx: index("idx_consent_receipts_user_type").on(t.userId, t.documentType, t.acceptedAt.desc()),
    typeIdx: index("idx_consent_receipts_type").on(t.documentType, t.acceptedAt.desc()),
    // One row per (user, document_type, document_version) acceptance event,
    // matching the schema comment above. Race-tolerant: concurrent submits to
    // `runAcceptPrivacyPolicy` lose at INSERT via ON CONFLICT DO NOTHING
    // instead of duplicating the receipt. (Story 1.21 round-1 fix.)
    userTypeVersionUnique: unique("uq_consent_receipts_user_type_version").on(
      t.userId,
      t.documentType,
      t.documentVersion,
    ),
  }),
);

// ------------------------------------------------------------------------------
// notifications_log - FR40-43 + NFR44 (consent receipt logging)
// Every outbound notification logged with consent basis at send time.
// ------------------------------------------------------------------------------
export const notificationsLog = pgTable(
  "notifications_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),               // recipient
    channel: text("channel", { enum: ["email", "sms", "whatsapp", "in_app"] }).notNull(),
    kind: text("kind", { enum: ["transactional", "marketing"] }).notNull(),
    templateKey: text("template_key").notNull(),                                // e.g., 'lesson_reminder_24h'
    subject: text("subject"),                                                    // email subject (nullable)
    bodySnippet: text("body_snippet"),                                          // first 200 chars for audit
    consentBasis: text("consent_basis"),                                        // 'opted_in_TIMESTAMP' or 'transactional_no_consent_required'
    vendorMessageId: text("vendor_message_id"),                                 // Resend / SMS-vendor message id
    status: text("status", { enum: ["queued", "sent", "delivered", "bounced", "failed"] }).notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    ...metaCols,
  },
  (t) => ({
    userIdx: index("idx_notifications_log_user").on(t.userId, t.createdAt.desc()),
    statusIdx: index("idx_notifications_log_status").on(t.status, t.createdAt),
  }),
);

// ------------------------------------------------------------------------------
// data_export_tokens - FR6 PPL data download
// One-shot signed URL; consumed_at set on first use.
// ------------------------------------------------------------------------------
export const dataExportTokens = pgTable(
  "data_export_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),                                              // URL-safe random
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    exportR2Key: text("export_r2_key"),                                          // generated zip in R2
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByKind: text("created_by_kind").notNull(),
    createdByActor: text("created_by_actor").notNull(),
  },
  (t) => ({
    tokenUnique: unique("uq_data_export_tokens_token").on(t.token),
    userIdx: index("idx_data_export_tokens_user").on(t.userId),
    expiresIdx: index("idx_data_export_tokens_expires").on(t.expiresAt),
  }),
);

// ------------------------------------------------------------------------------
// _dev_email_outbox - dev/preview-only visibility surface for the StubEmailProvider.
// Underscore-prefix signals "debug surface, not a product table". Empty in prod
// because EMAIL_PROVIDER=resend swaps the Stub out (Story 6.1).
// ------------------------------------------------------------------------------
export const devEmailOutbox = pgTable(
  "_dev_email_outbox",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(),                                                // 'transactional' | 'marketing'
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    templateId: text("template_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    consentReceiptRef: text("consent_receipt_ref"),                              // null for transactional
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindCheck: check("ck_dev_email_outbox_kind", sql`${t.kind} in ('transactional','marketing')`),
    createdAtIdx: index("idx_dev_email_outbox_created_at").on(t.createdAt),
  }),
);

// ------------------------------------------------------------------------------
// Relations - enable typed `db.query.users.findFirst({ with: { tutorProfile: true } })` etc.
// ------------------------------------------------------------------------------
export const usersRelations = relations(users, ({ one, many }) => ({
  tutorProfile: one(tutorProfiles),
  studentSettings: one(studentSettings),
  notificationPreferences: one(notificationPreferences),
  accounts: many(accounts),
  sessions: many(sessions),
  parent: one(users, { fields: [users.parentUserId], references: [users.id], relationName: "parentDependent" }),
  dependents: many(users, { relationName: "parentDependent" }),
  bookingsAsStudent: many(bookings, { relationName: "studentBookings" }),
  bookingsAsTutor: many(bookings, { relationName: "tutorBookings" }),
  ratingsGiven: many(ratings, { relationName: "studentRatings" }),
  ratingsReceived: many(ratings, { relationName: "tutorRatings" }),
  disputesFiled: many(disputes),
  consentReceipts: many(consentReceipts),
  notifications: many(notificationsLog),
}));

export const tutorProfilesRelations = relations(tutorProfiles, ({ one, many }) => ({
  user: one(users, { fields: [tutorProfiles.userId], references: [users.id] }),
  giBusiness: one(tutorGreenInvoiceBusiness),
  documents: many(tutorDocuments),
  subjects: many(tutorSubjects),
  availability: many(tutorAvailability),
  wizardState: many(tutorWizardState),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  tutors: many(tutorSubjects),
}));

export const tutorSubjectsRelations = relations(tutorSubjects, ({ one }) => ({
  tutor: one(users, { fields: [tutorSubjects.tutorUserId], references: [users.id] }),
  subject: one(subjects, { fields: [tutorSubjects.subjectId], references: [subjects.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  student: one(users, { fields: [bookings.studentUserId], references: [users.id], relationName: "studentBookings" }),
  tutor: one(users, { fields: [bookings.tutorUserId], references: [users.id], relationName: "tutorBookings" }),
  subject: one(subjects, { fields: [bookings.subjectId], references: [subjects.id] }),
  session: one(lessonSessions),
  payments: many(payments),
}));

export const lessonSessionsRelations = relations(lessonSessions, ({ one, many }) => ({
  booking: one(bookings, { fields: [lessonSessions.bookingId], references: [bookings.id] }),
  studentNotes: many(studentLessonNotes),
  summaries: many(sessionSummaries),
  rating: one(ratings),
  disputes: many(disputes),
}));

export const tutorStudentNotesRelations = relations(tutorStudentNotes, ({ one }) => ({
  tutor: one(users, { fields: [tutorStudentNotes.tutorUserId], references: [users.id] }),
  student: one(users, { fields: [tutorStudentNotes.studentUserId], references: [users.id] }),
}));

export const studentLessonNotesRelations = relations(studentLessonNotes, ({ one }) => ({
  student: one(users, { fields: [studentLessonNotes.studentUserId], references: [users.id] }),
  lessonSession: one(lessonSessions, { fields: [studentLessonNotes.lessonSessionId], references: [lessonSessions.id] }),
}));

export const sessionSummariesRelations = relations(sessionSummaries, ({ one }) => ({
  lessonSession: one(lessonSessions, { fields: [sessionSummaries.lessonSessionId], references: [lessonSessions.id] }),
  tutor: one(users, { fields: [sessionSummaries.tutorUserId], references: [users.id] }),
}));

export const disputesRelations = relations(disputes, ({ one, many }) => ({
  lessonSession: one(lessonSessions, { fields: [disputes.lessonSessionId], references: [lessonSessions.id] }),
  filedBy: one(users, { fields: [disputes.filedByUserId], references: [users.id] }),
  resolvedBy: one(users, { fields: [disputes.resolvedByAdminId], references: [users.id] }),
  messages: many(disputeMessages),
}));

export const disputeMessagesRelations = relations(disputeMessages, ({ one }) => ({
  dispute: one(disputes, { fields: [disputeMessages.disputeId], references: [disputes.id] }),
  author: one(users, { fields: [disputeMessages.authorUserId], references: [users.id] }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, { fields: [notificationPreferences.userId], references: [users.id] }),
}));

export const consentReceiptsRelations = relations(consentReceipts, ({ one }) => ({
  user: one(users, { fields: [consentReceipts.userId], references: [users.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
  invoices: many(invoices),
  payout: one(payouts),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  payment: one(payments, { fields: [invoices.paymentId], references: [payments.id] }),
}));

// ------------------------------------------------------------------------------
// Type exports - Drizzle-inferred row types and insert types
// ------------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type AuthSession = typeof sessions.$inferSelect;
export type NewAuthSession = typeof sessions.$inferInsert;

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;

export type TutorProfile = typeof tutorProfiles.$inferSelect;
export type NewTutorProfile = typeof tutorProfiles.$inferInsert;

export type StudentSettings = typeof studentSettings.$inferSelect;
export type NewStudentSettings = typeof studentSettings.$inferInsert;

export type TutorDocument = typeof tutorDocuments.$inferSelect;
export type NewTutorDocument = typeof tutorDocuments.$inferInsert;

export type TutorWizardState = typeof tutorWizardState.$inferSelect;
export type NewTutorWizardState = typeof tutorWizardState.$inferInsert;

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;

export type TutorSubject = typeof tutorSubjects.$inferSelect;
export type NewTutorSubject = typeof tutorSubjects.$inferInsert;

export type TutorAvailability = typeof tutorAvailability.$inferSelect;
export type NewTutorAvailability = typeof tutorAvailability.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type LessonSession = typeof lessonSessions.$inferSelect;
export type NewLessonSession = typeof lessonSessions.$inferInsert;

export type TutorStudentNotes = typeof tutorStudentNotes.$inferSelect;
export type NewTutorStudentNotes = typeof tutorStudentNotes.$inferInsert;

export type StudentLessonNotes = typeof studentLessonNotes.$inferSelect;
export type NewStudentLessonNotes = typeof studentLessonNotes.$inferInsert;

export type SessionSummary = typeof sessionSummaries.$inferSelect;
export type NewSessionSummary = typeof sessionSummaries.$inferInsert;

export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;

export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;

export type DisputeMessage = typeof disputeMessages.$inferSelect;
export type NewDisputeMessage = typeof disputeMessages.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;

export type WebhookIdempotencyKey = typeof webhookIdempotencyKeys.$inferSelect;
export type NewWebhookIdempotencyKey = typeof webhookIdempotencyKeys.$inferInsert;

export type TutorGreenInvoiceBusiness = typeof tutorGreenInvoiceBusiness.$inferSelect;
export type NewTutorGreenInvoiceBusiness = typeof tutorGreenInvoiceBusiness.$inferInsert;

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;

export type ConsentReceipt = typeof consentReceipts.$inferSelect;
export type NewConsentReceipt = typeof consentReceipts.$inferInsert;

export type NotificationLog = typeof notificationsLog.$inferSelect;
export type NewNotificationLog = typeof notificationsLog.$inferInsert;

export type DataExportToken = typeof dataExportTokens.$inferSelect;
export type NewDataExportToken = typeof dataExportTokens.$inferInsert;

export type DevEmailOutbox = typeof devEmailOutbox.$inferSelect;
export type NewDevEmailOutbox = typeof devEmailOutbox.$inferInsert;
