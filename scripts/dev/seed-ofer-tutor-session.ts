import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sessions, consentReceipts } from "../../src/lib/db/schema";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../../src/lib/legal/privacy-consent";
config({ path: ".env.local" });
config({ path: ".env" });
const OFER_TUTOR_ID = "e577ae61-fda4-4812-a2b1-4a7ebba78d63";
async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = neon(url);
  const db = drizzle(sql);
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId: OFER_TUTOR_ID, expires });
  await db
    .insert(consentReceipts)
    .values({
      userId: OFER_TUTOR_ID,
      documentType: "privacy_policy",
      documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      acceptedAt: new Date(),
      ipAddress: null,
      userAgent: null,
      signature: null,
      documentSnapshot: null,
      createdByKind: "user",
      createdByActor: OFER_TUTOR_ID,
    })
    .onConflictDoNothing();
  console.log(sessionToken);
}
main().catch(e => { console.error(e); process.exit(1); });
