import { getProviderName } from "../../feature-flags/env-flags";
import { getDb } from "../../db/client";
import { ResendEmailProvider } from "./resend";
import { StubEmailProvider, type OutboxDb } from "./stub";
import type { EmailProvider } from "./types";

export type {
  EmailProvider,
  MarketingEmail,
  SendResult,
  TransactionalEmail,
} from "./types";

export function getEmailProvider(): EmailProvider {
  const name = getProviderName("email");

  if (name === "stub") {
    const db = getDb();
    const adapter: OutboxDb = {
      insert: (table) => ({
        values: async (value) => {
          await db.insert(table).values(value);
        },
      }),
    };
    return new StubEmailProvider(adapter);
  }

  return new ResendEmailProvider();
}
