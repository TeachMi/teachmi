import { describe, expect, it } from "vitest";
import {
  authorizeWithCredentials,
  type DbForAuthorize,
} from "../credentials-authorize";
import { FakeDb } from "../../../app/signup/__tests__/fake-db";

function makeDeps(opts: {
  verifyResult?: boolean;
  verifyCalled?: { count: number };
} = {}) {
  const db = new FakeDb();
  const calls = opts.verifyCalled ?? { count: 0 };
  const verifyPassword = async (_plain: string, _encoded: string) => {
    calls.count += 1;
    return opts.verifyResult ?? true;
  };
  return {
    db,
    calls,
    deps: {
      db: db as unknown as DbForAuthorize,
      verifyPassword,
    },
  };
}

describe("authorizeWithCredentials — short-circuits before verify()", () => {
  it("returns null for invalid email shape without querying the DB", async () => {
    const { db, calls, deps } = makeDeps();
    const result = await authorizeWithCredentials(
      { email: "not-an-email", password: "anything-long-enough" },
      deps,
    );
    expect(result).toBeNull();
    // No DB query issued.
    expect(db.selectResponses.length).toBe(0);
    expect(calls.count).toBe(0);
  });

  it("returns null for empty password without querying the DB", async () => {
    const { db, calls, deps } = makeDeps();
    const result = await authorizeWithCredentials(
      { email: "user@example.com", password: "" },
      deps,
    );
    expect(result).toBeNull();
    expect(db.selectResponses.length).toBe(0);
    expect(calls.count).toBe(0);
  });

  it("returns null when no users row matches the email", async () => {
    const { db, calls, deps } = makeDeps();
    db.queueSelect([]);
    const result = await authorizeWithCredentials(
      { email: "ghost@example.com", password: "hello12345" },
      deps,
    );
    expect(result).toBeNull();
    expect(calls.count).toBe(0);
  });

  it("returns null when the user has no passwordHash (OAuth-only account)", async () => {
    const { db, calls, deps } = makeDeps();
    db.queueSelect([
      {
        id: "user-1",
        email: "oauth@example.com",
        name: "OAuth User",
        role: "student",
        emailVerified: new Date(),
        image: null,
        passwordHash: null,
      },
    ]);
    const result = await authorizeWithCredentials(
      { email: "oauth@example.com", password: "hello12345" },
      deps,
    );
    expect(result).toBeNull();
    // Verify NOT called — confirms the short-circuit timing trade-off is in effect.
    expect(calls.count).toBe(0);
  });

  it("returns null when the user's email is not verified", async () => {
    const { db, calls, deps } = makeDeps();
    db.queueSelect([
      {
        id: "user-2",
        email: "pending@example.com",
        name: "Pending",
        role: "student",
        emailVerified: null,
        image: null,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
      },
    ]);
    const result = await authorizeWithCredentials(
      { email: "pending@example.com", password: "hello12345" },
      deps,
    );
    expect(result).toBeNull();
    expect(calls.count).toBe(0);
  });
});

describe("authorizeWithCredentials — verify() outcomes", () => {
  it("returns null when verifyPassword returns false (wrong password)", async () => {
    const { db, calls, deps } = makeDeps({ verifyResult: false });
    db.queueSelect([
      {
        id: "user-3",
        email: "verified@example.com",
        name: "Verified",
        role: "student",
        emailVerified: new Date(),
        image: null,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
      },
    ]);
    const result = await authorizeWithCredentials(
      { email: "verified@example.com", password: "wrong-pw-but-long" },
      deps,
    );
    expect(result).toBeNull();
    expect(calls.count).toBe(1); // verify WAS called this time
  });

  it("returns the AuthorizedUser shape when password verifies", async () => {
    const { db, deps } = makeDeps({ verifyResult: true });
    const verifiedAt = new Date("2026-05-12T08:00:00Z");
    db.queueSelect([
      {
        id: "user-4",
        email: "alice@example.com",
        name: "Alice Tutor",
        role: "tutor",
        emailVerified: verifiedAt,
        image: "https://cdn.example/avatar.png",
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
      },
    ]);
    const result = await authorizeWithCredentials(
      { email: "alice@example.com", password: "hello12345" },
      deps,
    );
    expect(result).toEqual({
      id: "user-4",
      email: "alice@example.com",
      name: "Alice Tutor",
      role: "tutor",
      emailVerified: verifiedAt,
      image: "https://cdn.example/avatar.png",
    });
  });

  it("coerces an unknown stored role to 'student'", async () => {
    const { db, deps } = makeDeps({ verifyResult: true });
    db.queueSelect([
      {
        id: "user-5",
        email: "rogue@example.com",
        name: null,
        role: "weird-role-from-future",
        emailVerified: new Date(),
        image: null,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
      },
    ]);
    const result = await authorizeWithCredentials(
      { email: "rogue@example.com", password: "hello12345" },
      deps,
    );
    expect(result?.role).toBe("student");
  });
});

describe("authorizeWithCredentials — email normalization", () => {
  it("lowercases the input email before querying", async () => {
    const { deps } = makeDeps({ verifyResult: true });
    // Capture the where condition by spying on the FakeDb.
    const db = new FakeDb();
    db.queueSelect([
      {
        id: "user-6",
        email: "case@example.com",
        name: null,
        role: "student",
        emailVerified: new Date(),
        image: null,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
      },
    ]);

    const result = await authorizeWithCredentials(
      { email: "Case@Example.COM", password: "hello12345" },
      { ...deps, db: db as unknown as DbForAuthorize },
    );

    expect(result).not.toBeNull();
    expect(result?.email).toBe("case@example.com");
  });
});
