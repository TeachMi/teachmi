import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let sqlClient: ReturnType<typeof neon> | null = null;
let database: ReturnType<typeof createDatabase> | null = null;

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before opening a database connection.");
  }

  return databaseUrl;
}

function createDatabase() {
  return drizzle({ client: getSqlClient(), schema });
}

export function getSqlClient(): ReturnType<typeof neon> {
  if (!sqlClient) {
    sqlClient = neon(getDatabaseUrl());
  }

  return sqlClient;
}

export function getDb(): ReturnType<typeof createDatabase> {
  if (!database) {
    database = createDatabase();
  }

  return database;
}
