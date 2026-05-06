import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { accounts, sessions, users, verificationTokens } from "../../db/schema";

interface SqlCall {
  sql: string;
  params: unknown[];
}

function createRecordingDb(calls: SqlCall[]) {
  const client = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });

    return {
      rows: [[]],
    };
  };

  return drizzle({ client: client as never, schema });
}

describe("Auth.js Drizzle adapter table compatibility", () => {
  it("generates writes for users, accounts, and database sessions through the Story 1.3 tables", async () => {
    const calls: SqlCall[] = [];
    const db = createRecordingDb(calls);
    const adapter = DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    } as never);

    await adapter.createUser?.({
      id: "user-1",
      name: "Ada",
      email: "ada@teachme.local",
      emailVerified: null,
      image: null,
    });
    await adapter.linkAccount?.({
      userId: "user-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "google-1",
      access_token: "token",
      expires_at: 123,
      token_type: "bearer",
      scope: "openid email profile",
      id_token: "id-token",
    });
    await adapter.createSession?.({
      sessionToken: "session-token",
      userId: "user-1",
      expires: new Date("2099-01-01T00:00:00.000Z"),
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.sql).toContain('insert into "users"');
    expect(calls[0]?.sql).toContain('"role"');
    expect(calls[0]?.sql).toContain('"created_by_kind"');
    expect(calls[0]?.sql).toContain('"created_by_actor"');
    expect(calls[0]?.params).toEqual(["Ada", "ada@teachme.local", null, null]);

    expect(calls[1]?.sql).toContain('insert into "accounts"');
    expect(calls[1]?.sql).toContain('"access_token"');
    expect(calls[1]?.sql).toContain('"expires_at"');
    expect(calls[1]?.params).toContain("token");
    expect(calls[1]?.params).toContain(123);

    expect(calls[2]?.sql).toContain('insert into "sessions"');
    expect(calls[2]?.sql).toContain('"session_token"');
    expect(calls[2]?.params).toContain("session-token");
  });
});
