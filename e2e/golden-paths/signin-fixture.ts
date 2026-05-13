// Programmatic-login fixture for the golden-path E2E.
//
// Contract: insert a verified user + active session via Drizzle (HTTP driver),
// return the session cookie material. Callers set the cookie via
// `page.context().addCookies(...)` and start the test already-signed-in.
//
// Why bypass the signin UI: the golden path tests the post-signin user journey
// (browse → book), not the signin UI itself (which is exercised by the
// integration tests in src/app/signin/__tests__/signin-flow.test.ts plus the
// page-render smoke check in student-loop.flow.ts). Going through the form
// would add ~1s/test for marginal coverage.
//
// Graceful skip: if DATABASE_URL is unset (local devs without a DB branch),
// `createVerifiedSession` returns null. Callers use `test.skip()` instead of
// throwing — the rest of the spec is still useful as a build-render check.
//
// Cleanup: per-test unique emails + test-isolated Neon branches make leaked
// rows a non-issue at MVP 1. A future hardening pass can add a `cleanup()` if
// real shared-environment tests start running here.

import type { TestInfo } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  auditEvents,
  consentReceipts,
  sessions,
  users,
} from "../../src/lib/db/schema";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../../src/lib/legal/privacy-consent";
import { buildStudentEmail } from "./student-loop.flow";

// Short-lived: a single Playwright spec never needs more than a few minutes.
// Keep the fixture cookie short-lived so a stale fixture row never lingers as
// a usable session in a shared environment.
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Pre-computed argon2id hash of "hello12345" using the OWASP params declared
// in src/lib/auth/password-hashing.ts. Static so the fixture doesn't pay the
// ~100ms hashing cost on every test. Re-generate with:
//   pnpm tsx -e 'import("@node-rs/argon2").then(m => m.hash("hello12345", { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 }).then(console.log))'
// Any valid argon2id encoded string will do — verifyPassword decodes the
// stored params from the hash, so this doesn't need to match runtime tuning.
const KNOWN_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$3PPjsk2I3jJpzthkSr5BUw$xUDFvSzhTb3stHRRX1HKxlFmEDxJ5HGfPYrPMl/zcsk";

export interface VerifiedSession {
  email: string;
  userId: string;
  sessionToken: string;
  expiresMs: number;
}

export function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export async function createVerifiedSession(
  testInfo: TestInfo,
): Promise<VerifiedSession | null> {
  // Hard refusal in production. Even with a misconfigured CI step, the fixture
  // must NOT provision a known-credential user in a non-test DB. The
  // `KNOWN_PASSWORD_HASH` below is a documented test password — anyone who
  // grabs this code could brute-force it offline.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[signin-fixture] refuses to run when NODE_ENV === 'production' — this fixture provisions a known-credential test user.",
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const sql = neon(url);
  const db = drizzle(sql);

  const email = buildStudentEmail(testInfo);
  const now = new Date();

  // Idempotent: insert if missing, look up afterwards regardless. The fixture
  // re-runs on retries with the same email — must not double-throw on
  // unique-constraint conflict.
  await db
    .insert(users)
    .values({
      email,
      passwordHash: KNOWN_PASSWORD_HASH,
      name: "Student Loop Test",
      role: "student",
      emailVerified: now,
      createdByKind: "system",
      createdByActor: "e2e-fixture",
    })
    .onConflictDoNothing({ target: users.email });

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  const userId = rows[0]?.id;
  if (!userId) {
    throw new Error(
      `[signin-fixture] failed to provision user row for ${email} — check DATABASE_URL is the right branch`,
    );
  }

  const sessionToken = randomUUID();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    sessionToken,
    userId,
    expires,
  });

  await db.insert(auditEvents).values({
    eventType: "auth.signin_succeeded",
    actorKind: "user",
    actorId: userId,
    actorMeta: "e2e-fixture",
    targetType: "user",
    targetId: userId,
    payload: { provider: "e2e-fixture" },
  });

  // Story 1.21: the fixture's user wasn't created via the real signup flow, so
  // it lacks a `consent_receipts` row. Future E2Es that navigate to a route
  // guarded by `requirePrivacyConsent` (today: /dashboard; tomorrow: more)
  // would trip the gate and redirect to /legal/privacy/accept, breaking the
  // golden path. Stamp a current-version receipt at fixture-creation time so
  // these tests can ignore the gate. Idempotent via the rest of the fixture's
  // re-run semantics — duplicate rows for the same (user, version) are legal
  // per schema (no unique constraint), but in practice the fixture only runs
  // once per test.
  await db.insert(consentReceipts).values({
    userId,
    documentType: "privacy_policy",
    documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
    acceptedAt: now,
    ipAddress: null,
    userAgent: "e2e-fixture",
    signature: null,
    documentSnapshot: null,
    createdByKind: "system",
    createdByActor: "e2e-fixture",
  });

  return {
    email,
    userId,
    sessionToken,
    expiresMs: expires.getTime(),
  };
}
