// Pure authorize-function for the Auth.js Credentials provider. The provider's
// `authorize` callback is a thin shim that calls this function with the runtime
// `db` + `verifyPassword` deps; testing the pure function with FakeDb +
// fake verifyPassword avoids standing up the full Auth.js machinery.
//
// Returning `null` (not throwing) per the Auth.js v5 Credentials contract: any
// null return path causes Auth.js to surface a generic `CredentialsSignin`
// error to the caller. The orchestrator (`signin-flow.ts`) maps that to our
// Hebrew "אימייל או סיסמה לא נכונים." copy.
//
// Timing trade-off: the short-circuits below (no user / OAuth-only / unverified)
// skip the ~50ms argon2 verify, leaking those states via response timing. This
// is intentional at MVP 1 — running verify on every wrong email would let any
// unauthenticated request pin CPU. Documented in story 1.14 AC0.

import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { isValidEmailShape } from "./email-validation";
import { isAppRole, type AppRole } from "./roles";

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  emailVerified: Date | null;
  image: string | null;
}

interface UsersRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: Date | null;
  image: string | null;
  passwordHash: string | null;
  deletedAt: Date | null;
}

interface SelectChain {
  from(table: unknown): { where(condition: unknown): Promise<UsersRow[]> };
}

export interface DbForAuthorize {
  select(cols: unknown): SelectChain;
}

export interface AuthorizeDeps {
  db: DbForAuthorize;
  verifyPassword: (plain: string, encoded: string) => Promise<boolean>;
}

export interface AuthorizeInput {
  email: string;
  password: string;
}

export async function authorizeWithCredentials(
  input: AuthorizeInput,
  deps: AuthorizeDeps,
): Promise<AuthorizedUser | null> {
  const emailRaw = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!emailRaw || !password) return null;
  if (!isValidEmailShape(emailRaw)) return null;

  const email = emailRaw.toLowerCase();

  const rows = await deps.db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerified: users.emailVerified,
      image: users.image,
      passwordHash: users.passwordHash,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.email, email));

  const row = rows[0];
  if (!row) return null;

  // Short-circuit before the expensive verify() call. See module docstring.
  if (row.deletedAt !== null) return null; // soft-deleted (Story 1.17 future)
  if (!row.passwordHash) return null;
  if (!row.emailVerified) return null;

  const ok = await deps.verifyPassword(password, row.passwordHash);
  if (!ok) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: isAppRole(row.role) ? row.role : "student",
    emailVerified: row.emailVerified,
    image: row.image,
  };
}
