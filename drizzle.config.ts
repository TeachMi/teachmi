import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

const command = process.argv.join(" ");
const isAdminCommand = /\b(migrate|push|pull|studio)\b/.test(command);

// Neon pooler doesn't support multi-statement migration blocks; admin commands
// must use the unpooled (direct) endpoint. Runtime queries continue to use the
// pooled DATABASE_URL via lib/db/client.ts. Fail loud if the unpooled URL is
// missing or empty when an admin command runs — silently falling back to the
// pooled URL would directly contradict the comment above.
const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
const runtimeUrl = process.env.DATABASE_URL;

if (isAdminCommand && (!unpooled || unpooled === "")) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is required (and must be non-empty) for Drizzle migrate/push/pull/studio commands. The Neon pooler doesn't support multi-statement migrations.",
  );
}

const resolvedUrl = isAdminCommand ? unpooled : runtimeUrl;

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolvedUrl ?? "postgres://missing:missing@localhost:5432/missing",
  },
  strict: true,
  verbose: true,
});
