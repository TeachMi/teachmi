// One-off: seed a current-version privacy_policy consent receipt for
// ofer-student so the dev preview can pass the /dashboard privacy gate
// without going through the React form-action flow.

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { consentReceipts } from "../../src/lib/db/schema";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../../src/lib/legal/privacy-consent";

config({ path: ".env.local" });
config({ path: ".env" });

const OFER_STUDENT_ID = "bbe3b80a-03f3-48bb-b112-9e3b5b4165e1";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = neon(url);
  const db = drizzle(sql);

  await db
    .insert(consentReceipts)
    .values({
      userId: OFER_STUDENT_ID,
      documentType: "privacy_policy",
      documentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      acceptedAt: new Date(),
      ipAddress: null,
      userAgent: null,
      signature: null,
      documentSnapshot: null,
      createdByKind: "user",
      createdByActor: OFER_STUDENT_ID,
    })
    .onConflictDoNothing({
      target: [
        consentReceipts.userId,
        consentReceipts.documentType,
        consentReceipts.documentVersion,
      ],
    });

  console.log(`Seeded privacy_policy consent receipt for ofer-student at version ${CURRENT_PRIVACY_POLICY_VERSION}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
