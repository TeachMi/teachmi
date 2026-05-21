import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleProvider = vi.hoisted(() =>
  vi.fn((options?: Record<string, unknown>) => ({
    id: "google",
    name: "Google",
    type: "oidc",
    options,
  })),
);

const fakeDb = vi.hoisted(() => {
  const state = {
    updates: [] as Array<{
      table: unknown;
      set: Record<string, unknown>;
      whereCondition: unknown;
    }>,
  };

  return {
    state,
    reset() {
      state.updates.length = 0;
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(whereCondition: unknown) {
              state.updates.push({ table, set: values, whereCondition });
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
  };
});

vi.mock("next-auth/providers/google", () => ({
  default: googleProvider,
}));

vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: vi.fn(() => ({})),
}));

vi.mock("../../db/client", () => ({
  getDb: () => fakeDb,
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    handlers: {
      GET: vi.fn(),
      POST: vi.fn(),
    },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

const ORIGINAL_GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const ORIGINAL_GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const ORIGINAL_AUTH_GOOGLE_ID = process.env.AUTH_GOOGLE_ID;
const ORIGINAL_AUTH_GOOGLE_SECRET = process.env.AUTH_GOOGLE_SECRET;

beforeEach(() => {
  vi.resetModules();
  googleProvider.mockClear();
  fakeDb.reset();
  process.env.GOOGLE_OAUTH_CLIENT_ID = "google-oauth-client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-oauth-client-secret";
  process.env.AUTH_GOOGLE_ID = "legacy-auth-google-id";
  process.env.AUTH_GOOGLE_SECRET = "legacy-auth-google-secret";
});

afterEach(() => {
  if (ORIGINAL_GOOGLE_OAUTH_CLIENT_ID === undefined) {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  } else {
    process.env.GOOGLE_OAUTH_CLIENT_ID = ORIGINAL_GOOGLE_OAUTH_CLIENT_ID;
  }

  if (ORIGINAL_GOOGLE_OAUTH_CLIENT_SECRET === undefined) {
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  } else {
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = ORIGINAL_GOOGLE_OAUTH_CLIENT_SECRET;
  }

  if (ORIGINAL_AUTH_GOOGLE_ID === undefined) {
    delete process.env.AUTH_GOOGLE_ID;
  } else {
    process.env.AUTH_GOOGLE_ID = ORIGINAL_AUTH_GOOGLE_ID;
  }

  if (ORIGINAL_AUTH_GOOGLE_SECRET === undefined) {
    delete process.env.AUTH_GOOGLE_SECRET;
  } else {
    process.env.AUTH_GOOGLE_SECRET = ORIGINAL_AUTH_GOOGLE_SECRET;
  }
});

async function loadConfig() {
  const { createAuthConfig } = await import("../auth");
  return createAuthConfig();
}

describe("Google OAuth Auth.js config", () => {
  it("configures Google from GOOGLE_OAUTH_* instead of AUTH_GOOGLE_*", async () => {
    await loadConfig();

    expect(googleProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "google-oauth-client-id",
        clientSecret: "google-oauth-client-secret",
        allowDangerousEmailAccountLinking: true,
      }),
    );
    expect(googleProvider).not.toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "legacy-auth-google-id",
        clientSecret: "legacy-auth-google-secret",
      }),
    );
  });

  it("keeps the provided Google client id as the non-secret fallback", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;

    await loadConfig();

    expect(googleProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId:
          "746211293759-f6dclsj323op2buvfnqfffvu97jmklmq.apps.googleusercontent.com",
        clientSecret: "google-oauth-client-secret",
      }),
    );
  });

  it("allows Google sign-in only when Google reports a verified email", async () => {
    const config = await loadConfig();

    expect(
      await config.callbacks?.signIn?.({
        user: {},
        account: { provider: "google" },
        profile: { email_verified: true },
      } as never),
    ).toBe(true);

    expect(
      await config.callbacks?.signIn?.({
        user: {},
        account: { provider: "google" },
        profile: { email_verified: false },
      } as never),
    ).toBe(false);

    expect(
      await config.callbacks?.signIn?.({
        user: {},
        account: { provider: "credentials" },
      } as never),
    ).toBe(true);
  });

  it("stamps linked Google accounts as email-verified", async () => {
    const config = await loadConfig();

    await config.events?.linkAccount?.({
      user: { id: "user-1" },
      account: { provider: "google" },
      profile: { email_verified: true },
    } as never);

    expect(fakeDb.state.updates).toHaveLength(1);
    expect(fakeDb.state.updates[0]?.set).toMatchObject({
      updatedByKind: "system",
      updatedByActor: "google-oauth",
    });
    expect(fakeDb.state.updates[0]?.set.emailVerified).toBeInstanceOf(Date);
    expect(fakeDb.state.updates[0]?.set.updatedAt).toBeInstanceOf(Date);
  });
});
