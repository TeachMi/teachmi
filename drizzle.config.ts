import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
const command = process.argv.join(" ");

if (!databaseUrl && /\b(migrate|push|pull|studio)\b/.test(command)) {
  throw new Error("DATABASE_URL is required for Drizzle commands that connect to Neon.");
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgres://missing:missing@localhost:5432/missing",
  },
  strict: true,
  verbose: true,
});
