import { describe, expect, it } from "vitest";
import {
  auditEvents,
  consentReceipts,
  sessions,
  users,
  verificationTokens,
} from "../../../lib/db/schema";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../../../lib/legal/privacy-consent";
import { runRegister } from "../registration-flow";
import type { DbForRegister } from "../registration-flow";
import {
  FakeDb,
  FakeEmailProvider,
  TrackRecorder,
  makeFormData,
  silentLogger,
} from "./fake-db";

function makeDeps(overrides?: { next?: string | null; skipEmailVerification?: boolean }) {
  const db = new FakeDb();
  const email = new FakeEmailProvider();
  const recorder = new TrackRecorder();
  return {
    db,
    email,
    recorder,
    deps: {
      db: db as unknown as DbForRegister,
      emailProvider: email,
      ip: "10.0.0.1",
      // Story 3.3 — booking-funnel intent target. Null by default so the bulk
      // of existing tests (which assert on the no-intent redirect shape) keep
      // working unchanged.
      next: overrides?.next ?? null,
      origin: "https://teachme.test",
      userAgent: "Mozilla/5.0 (Vitest TeachMe)",
      track: recorder.capture,
      generateSessionToken: () => "sess-tok-fake",
      logger: silentLogger,
      skipEmailVerification: overrides?.skipEmailVerification,
    },
  };
}

function validForm(): FormData {
  return makeFormData({
    name: "Test Student",
    email: "Test@Example.com",
    password: "hello12345",
    role: "student",
    tos: "on",
    privacyPolicy: "on",
  });
}

describe("runRegister — happy path", () => {
  it("writes attempt audit + lowercase user + token + user_registered audit, sends email, tracks signup_completed, redirects", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit count (0 attempts)
    db.queueReturning<{ id: string }>([{ id: "user-1" }]); // user insert ON CONFLICT … RETURNING
    db.queueReturning<{ id: string }>([{ id: "consent-1" }]); // consent_receipts ON CONFLICT DO NOTHING … RETURNING (Story 1.21 round-2)

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );

    // 3 inserts into audit_events (attempt + user_registered + privacy_policy_accepted),
    // 1 into users, 1 into verificationTokens, 1 into consent_receipts (Story 1.21).
    expect(db.insertedInto(auditEvents)).toHaveLength(3);
    expect(db.insertedInto(users)).toHaveLength(1);
    expect(db.insertedInto(verificationTokens)).toHaveLength(1);
    expect(db.insertedInto(consentReceipts)).toHaveLength(1);

    const attempt = db.insertedInto(auditEvents)[0]?.value as Record<string, unknown>;
    expect(attempt.eventType).toBe("auth.signup_attempt");
    expect(attempt.actorMeta).toBe("10.0.0.1");

    const userInsert = db.insertedInto(users)[0]?.value as Record<string, unknown>;
    expect(userInsert.email).toBe("test@example.com"); // lowercased
    expect(userInsert.role).toBe("student");
    expect(userInsert.createdByKind).toBe("user");
    expect(userInsert.createdByActor).toBe("self-signup");
    expect(typeof userInsert.passwordHash).toBe("string");
    expect((userInsert.passwordHash as string).startsWith("$argon2id$")).toBe(true);

    const tokenInsert = db.insertedInto(verificationTokens)[0]?.value as Record<string, unknown>;
    expect(tokenInsert.identifier).toBe("test@example.com");
    expect(typeof tokenInsert.token).toBe("string");
    expect((tokenInsert.token as string).length).toBeGreaterThanOrEqual(43);

    const userRegistered = db.insertedInto(auditEvents)[1]?.value as Record<string, unknown>;
    expect(userRegistered.eventType).toBe("auth.user_registered");
    expect(userRegistered.actorId).toBe("user-1");

    // Story 1.21: consent_receipts row written same-tx as the rest.
    const receipt = db.insertedInto(consentReceipts)[0]?.value as Record<string, unknown>;
    expect(receipt.userId).toBe("user-1");
    expect(receipt.documentType).toBe("privacy_policy");
    expect(receipt.documentVersion).toBe(CURRENT_PRIVACY_POLICY_VERSION);
    expect(receipt.ipAddress).toBe("10.0.0.1");
    expect(receipt.userAgent).toBe("Mozilla/5.0 (Vitest TeachMe)");
    expect(receipt.signature).toBeNull();
    expect(receipt.documentSnapshot).toBeNull();
    expect(receipt.createdByKind).toBe("user");
    expect(receipt.createdByActor).toBe("user-1");
    expect(receipt.acceptedAt).toBeInstanceOf(Date);

    // Story 1.21: auth.privacy_policy_accepted audit row immediately after.
    const ppAudit = db.insertedInto(auditEvents)[2]?.value as Record<string, unknown>;
    expect(ppAudit.eventType).toBe("auth.privacy_policy_accepted");
    expect(ppAudit.actorId).toBe("user-1");
    const ppPayload = ppAudit.payload as Record<string, unknown>;
    expect(ppPayload.documentVersion).toBe(CURRENT_PRIVACY_POLICY_VERSION);
    expect(ppPayload.source).toBe("signup");

    expect(email.sends).toHaveLength(1);
    expect(email.sends[0]?.toAddress).toBe("test@example.com");
    expect(email.sends[0]?.templateId).toBe("account-verification");
    expect(email.sends[0]?.payload.verificationCode).toMatch(/^[0-9]{6}$/);
    expect(email.sends[0]?.payload.verifyUrl).toMatch(
      /^https:\/\/teachme\.test\/signup\/verify\?token=/,
    );

    // privacy_policy_accepted fires BEFORE signup_completed — assert order.
    expect(recorder.events).toEqual([
      {
        event: "privacy_policy_accepted",
        userId: "user-1",
        role: "student",
        documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
        source: "signup",
      },
      { event: "signup_completed", userId: "user-1", role: "student" },
    ]);
  }, 30_000);
});

describe("runRegister — validation", () => {
  it("returns fieldErrors when password is too short", async () => {
    const { deps } = makeDeps();
    const form = validForm();
    form.set("password", "short");

    const result = await runRegister(form, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.fieldErrors?.password).toContain("10 תווים");
  });

  // Passive consent (2026-05): terms + privacy moved from required checkboxes
  // to a small-print notice at the submit button — submitting the form IS the
  // acceptance, so there is nothing to field-validate. A signup with no
  // consent fields still succeeds and still writes the privacy_policy receipt.
  it("succeeds with no consent fields and still writes the privacy_policy receipt", async () => {
    const { db, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit count
    db.queueReturning<{ id: string }>([{ id: "user-passive-1" }]); // user RETURNING
    db.queueReturning<{ id: string }>([{ id: "consent-passive-1" }]); // consent RETURNING
    const form = validForm();
    form.delete("tos");
    form.delete("privacyPolicy");

    const result = await runRegister(form, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Submitting the form is the acceptance event — the privacy_policy
    // consent receipt is written regardless of any checkbox.
    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
    expect(
      (db.insertedInto(consentReceipts)[0]?.value as { documentType: string })
        .documentType,
    ).toBe("privacy_policy");
  });

  it("returns fieldErrors when email is malformed", async () => {
    const { deps } = makeDeps();
    const form = validForm();
    form.set("email", "not-an-email");

    const result = await runRegister(form, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.fieldErrors?.email).toBeDefined();
  });

  it("does NOT touch the database when validation fails", async () => {
    const { db, deps } = makeDeps();
    const form = validForm();
    form.set("password", "short");

    await runRegister(form, deps);

    expect(db.inserts).toHaveLength(0);
    expect(db.selectResponses).toHaveLength(0); // nothing was consumed
  });
});

describe("runRegister — email collision", () => {
  it("returns a generic formError (no enumeration) when the email already exists", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0 attempts
    // ON CONFLICT … DO NOTHING … RETURNING produces an empty array when a
    // collision occurs. The fake's `insert(...).values(...).returning(...)`
    // shifts the next `returningResponses` entry — empty means collision.
    db.queueReturning<{ id: string }>([]);

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toBe(
      "אימייל זה כבר רשום במערכת. נסו להיכנס.",
    );
    // The attempted INSERT into users is captured by the fake (the FakeDb
    // records all inserts regardless of whether RETURNING returned rows).
    // No verificationTokens insert and no user_registered audit row.
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    // Only attempt-audit + the (conflicted) user insert.
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    expect(db.insertedInto(users)).toHaveLength(1);
    // No consent_receipts row written on email collision (the inner try where
    // it'd be inserted never runs).
    expect(db.insertedInto(consentReceipts)).toHaveLength(0);
    // No email sent and signup_completed NOT fired.
    expect(email.sends).toHaveLength(0);
    expect(recorder.events).toEqual([]);
  });
});

describe("runRegister — rate-limited", () => {
  it("returns the rate-limit message and tracks signup_rate_limited", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>(Array.from({ length: 5 }, (_, i) => ({ id: `attempt-${i}` })));

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.formError).toContain("יותר מדי ניסיונות");

    // The throttled attempt still writes its own audit row (counted toward future windows).
    expect(db.insertedInto(auditEvents)).toHaveLength(1);
    // No user created, no token issued, no email sent, no consent receipt.
    expect(db.insertedInto(users)).toHaveLength(0);
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    expect(db.insertedInto(consentReceipts)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);
    // signup_rate_limited fires; signup_completed does NOT.
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      event: "signup_rate_limited",
      action: "signup",
    });
    expect((recorder.events[0] as { anonymizedIp: string }).anonymizedIp).toMatch(
      /^ip:[0-9a-f]{8}$/,
    );
  });
});

// Story 1.21 — Round-1 code-review finding [H1]: the consent_receipts +
// privacy_policy_accepted audit writes were originally placed INSIDE the
// cleanup-protected inner try, but the FK from consent_receipts.userId ->
// users.id (NO ACTION) + the consent_receipts append-only trigger meant a
// consent insert that succeeded followed by an audit-insert that failed
// would leave the user permanently orphaned (cleanup DELETE blocked by FK)
// with their email locked. So the writes were moved OUTSIDE the cleanup
// block: a consent insert failure leaves the user committed; the dashboard
// gate (requirePrivacyConsent) re-prompts them on first signin and captures
// the receipt then. Strictly better regulatory outcome.
describe("runRegister — consent_receipts insert failure is non-fatal (dashboard gate re-prompts)", () => {
  it("commits the user even when consent_receipts insert throws; skips privacy_policy_accepted analytics; still sends email + fires signup_completed", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit count
    db.queueReturning<{ id: string }>([{ id: "user-pp-fail" }]); // user RETURNING
    // No queueReturning for consent_receipts — `failingTables.add(consentReceipts)`
    // causes the insert builder itself to reject before .returning() is called.
    db.failingTables.add(consentReceipts); // force consent_receipts insert to throw

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );

    // User insert + verification token + user_registered audit all committed.
    expect(db.insertedInto(users)).toHaveLength(1);
    expect(db.insertedInto(verificationTokens)).toHaveLength(1);
    // Cleanup DELETE on `users` is NOT triggered — the user is allowed to
    // proceed; the dashboard gate captures the missing receipt later.
    const userDeletes = db.deletes.filter((d) => d.table === users);
    expect(userDeletes).toHaveLength(0);

    // No consent_receipts row reached the fake's `inserts` capture (it threw
    // before being recorded). auth.privacy_policy_accepted audit also did NOT
    // run, so audit_events only has the rate-limit attempt + user_registered.
    expect(db.insertedInto(consentReceipts)).toHaveLength(0);
    expect(db.insertedInto(auditEvents)).toHaveLength(2);
    const auditTypes = db
      .insertedInto(auditEvents)
      .map((e) => (e.value as { eventType: string }).eventType);
    expect(auditTypes).not.toContain("auth.privacy_policy_accepted");

    // signup_completed analytics still fires (user is committed); the
    // privacy_policy_accepted event is gated on the consent insert succeeding.
    expect(recorder.events).toEqual([
      { event: "signup_completed", userId: "user-pp-fail", role: "student" },
    ]);

    // Verification email is sent normally.
    expect(email.sends).toHaveLength(1);
  }, 30_000);
});

// Story 1.21 round-2: consent insert uses ON CONFLICT DO NOTHING on the
// new unique constraint. On a race-loss (extremely rare for signup since
// each user is unique-by-email), skip audit + analytics writes but still
// commit the user — the receipt exists at the target version regardless.
describe("runRegister — consent_receipts race-loser is non-fatal", () => {
  it("commits the user without firing privacy_policy_accepted audit/analytics when consent insert returns empty (race-loser)", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit count
    db.queueReturning<{ id: string }>([{ id: "user-race-1" }]); // user RETURNING
    db.queueReturning<{ id: string }>([]); // consent RETURNING empty = race-loser

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );

    // Consent insert was attempted (captured by FakeDb) but didn't return a
    // row, so audit + analytics are skipped to avoid double-counting.
    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
    const auditTypes = db
      .insertedInto(auditEvents)
      .map((e) => (e.value as { eventType: string }).eventType);
    expect(auditTypes).not.toContain("auth.privacy_policy_accepted");
    expect(auditTypes).toEqual(["auth.signup_attempt", "auth.user_registered"]);

    // signup_completed still fires — the user has a working account; the
    // receipt (written by the race-winner) covers the regulatory bit.
    expect(recorder.events).toEqual([
      { event: "signup_completed", userId: "user-race-1", role: "student" },
    ]);
    expect(email.sends).toHaveLength(1);
  }, 30_000);
});

describe("runRegister — email-send failure is non-fatal", () => {
  it("still redirects to verify-email-sent when the email provider throws", async () => {
    const { db, email, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit: 0
    db.queueReturning<{ id: string }>([{ id: "user-2" }]); // user RETURNING (no conflict)
    db.queueReturning<{ id: string }>([{ id: "consent-2" }]); // consent RETURNING
    email.failNext = new Error("SMTP down");

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );
    // User row + token + audit rows + consent receipt are still committed
    expect(db.insertedInto(users)).toHaveLength(1);
    expect(db.insertedInto(verificationTokens)).toHaveLength(1);
    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
  }, 30_000);
});

describe("runRegister — dev-only skip-email-verification", () => {
  it("stamps emailVerified=now() on insert, skips token + email, mints a session, redirects to /dashboard", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]); // rate-limit count
    db.queueReturning<{ id: string }>([{ id: "user-dev-1" }]);
    db.queueReturning<{ id: string }>([{ id: "consent-dev-1" }]); // consent RETURNING

    const result = await runRegister(validForm(), {
      ...deps,
      skipEmailVerification: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Skip path now mints a session and lands the user signed in on the
    // dashboard (which routes a tutor onward to the onboarding wizard).
    expect(result.redirectTo).toBe("/dashboard");
    expect(result.session?.token).toBe("sess-tok-fake");
    expect(result.session?.expires).toBeInstanceOf(Date);

    // A sessions row was written so the action wrapper can set the cookie.
    expect(db.insertedInto(sessions)).toHaveLength(1);
    const sessionInsert = db.insertedInto(sessions)[0]?.value as Record<string, unknown>;
    expect(sessionInsert.userId).toBe("user-dev-1");
    expect(sessionInsert.sessionToken).toBe("sess-tok-fake");
    expect(sessionInsert.expires).toBeInstanceOf(Date);

    // User row inserted with emailVerified set (a Date instance, value =
    // approximately now). No verification-token row, no email send.
    const userInsert = db.insertedInto(users)[0]?.value as Record<string, unknown>;
    expect(userInsert.email).toBe("test@example.com");
    expect(userInsert.emailVerified).toBeInstanceOf(Date);
    expect(db.insertedInto(verificationTokens)).toHaveLength(0);
    expect(email.sends).toHaveLength(0);

    // Audit row records the bypass via the devEmailVerificationSkipped flag.
    const userRegistered = db.insertedInto(auditEvents)[1]?.value as Record<string, unknown>;
    expect(userRegistered.eventType).toBe("auth.user_registered");
    const payload = userRegistered.payload as Record<string, unknown>;
    expect(payload.requiresVerification).toBe(false);
    expect(payload.devEmailVerificationSkipped).toBe(true);

    // Story 1.21: consent receipt + privacy_policy_accepted audit STILL fire
    // on the skip-verification path — the dev flag only bypasses email
    // verification, not consent capture.
    expect(db.insertedInto(consentReceipts)).toHaveLength(1);
    expect(db.insertedInto(auditEvents)).toHaveLength(3);
    const ppAudit = db.insertedInto(auditEvents)[2]?.value as Record<string, unknown>;
    expect(ppAudit.eventType).toBe("auth.privacy_policy_accepted");

    // signup_completed analytics still fires; privacy_policy_accepted precedes.
    expect(recorder.events).toEqual([
      {
        event: "privacy_policy_accepted",
        userId: "user-dev-1",
        role: "student",
        documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
        source: "signup",
      },
      { event: "signup_completed", userId: "user-dev-1", role: "student" },
    ]);
  }, 30_000);

  it("default (no skipEmailVerification) preserves the email-loop branch", async () => {
    const { db, email, recorder, deps } = makeDeps();
    db.queueSelect<{ id: string }>([]);
    db.queueReturning<{ id: string }>([{ id: "user-default-1" }]);
    db.queueReturning<{ id: string }>([{ id: "consent-default-1" }]); // consent RETURNING

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );
    // Email loop intact: token + email send both happen.
    expect(db.insertedInto(verificationTokens)).toHaveLength(1);
    expect(email.sends).toHaveLength(1);
    // Story 1.21: two analytics events now — privacy_policy_accepted + signup_completed.
    expect(recorder.events).toHaveLength(2);
  }, 30_000);
});

// Story 3.3 (FR19) — booking-funnel intent threading. The /signup page passes
// `next` (a /booking-stub URL) as a hidden form field; `actions.ts` extracts
// + sanitizes it; `runRegister` threads it into BOTH the verification email
// URL (so the magic-link click lands on /booking-stub instead of /dashboard)
// AND the post-submit redirect (so a resend retains intent via the embedded
// `&next=` query param).
describe("runRegister — Story 3.3 next threading", () => {
  const NEXT_URL =
    "/checkout?tutor=11111111-2222-3333-4444-555555555555&slot=2026-05-20T11%3A00%3A00.000Z&duration=60&sig=abcdef0123456789";

  it("threads next into the verification email URL as &next=<encoded>", async () => {
    const { db, email, deps } = makeDeps({ next: NEXT_URL });
    db.queueSelect<{ id: string }>([]);
    db.queueReturning<{ id: string }>([{ id: "user-next-1" }]);
    db.queueReturning<{ id: string }>([{ id: "consent-next-1" }]);

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Verification URL includes &next= with the booking-stub URL encoded.
    expect(email.sends).toHaveLength(1);
    const verifyUrl = email.sends[0]?.payload.verifyUrl as string;
    expect(verifyUrl).toMatch(
      /^https:\/\/teachme\.test\/signup\/verify\?token=/,
    );
    expect(verifyUrl).toContain(`&next=${encodeURIComponent(NEXT_URL)}`);
  }, 30_000);

  it("appends &next= to the verify-email-sent redirect when next is provided", async () => {
    const { db, deps } = makeDeps({ next: NEXT_URL });
    db.queueSelect<{ id: string }>([]);
    db.queueReturning<{ id: string }>([{ id: "user-next-2" }]);
    db.queueReturning<{ id: string }>([{ id: "consent-next-2" }]);

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      `/signup/verify-email-sent?email=test%40example.com&next=${encodeURIComponent(NEXT_URL)}`,
    );
  }, 30_000);

  it("omits &next= from the redirect when next is null (backward-compatible)", async () => {
    const { db, deps } = makeDeps({ next: null });
    db.queueSelect<{ id: string }>([]);
    db.queueReturning<{ id: string }>([{ id: "user-next-3" }]);
    db.queueReturning<{ id: string }>([{ id: "consent-next-3" }]);

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(
      "/signup/verify-email-sent?email=test%40example.com",
    );
  }, 30_000);

  it("dev-skip path redirects to next when set (not /signin?verified=1)", async () => {
    const { db, deps } = makeDeps({
      next: NEXT_URL,
      skipEmailVerification: true,
    });
    db.queueSelect<{ id: string }>([]);
    db.queueReturning<{ id: string }>([{ id: "user-next-4" }]);
    db.queueReturning<{ id: string }>([{ id: "consent-next-4" }]);

    const result = await runRegister(validForm(), deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectTo).toBe(NEXT_URL);
  }, 30_000);
});
