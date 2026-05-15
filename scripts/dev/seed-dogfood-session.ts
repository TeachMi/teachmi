// One-off: create an active session row for ofer-student so the dev preview
// can land on /dashboard without going through the React form-action signin
// flow (which is finicky to drive programmatically from preview tools).
//
// Outputs the session token so the user can set the cookie manually. Delete
// the row + cookie when done.

import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sessions } from "../../src/lib/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const OFER_STUDENT_ID = "bbe3b80a-03f3-48bb-b112-9e3b5b4165e1";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = neon(url);
  const db = drizzle(sql);

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(sessions).values({
    sessionToken,
    userId: OFER_STUDENT_ID,
    expires,
  });

  console.log("Session created for ofer-student.");
  console.log(`  sessionToken = ${sessionToken}`);
  console.log(`  expires      = ${expires.toISOString()}`);
  console.log("");
  console.log("Set the cookie in the dev preview:");
  console.log(
    `  document.cookie = "authjs.session-token=${sessionToken}; path=/; max-age=2592000"`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
