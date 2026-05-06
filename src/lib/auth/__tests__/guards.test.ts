import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";
import { AdminForbiddenError, createAuthGuards } from "../guards";

function sessionFor(role: "student" | "tutor" | "admin"): Session {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      id: `${role}-1`,
      role,
      email: `${role}@teachmi.local`,
    },
  };
}

describe("auth guards", () => {
  it("returns the session user when requireAuth has an authenticated session", async () => {
    const guards = createAuthGuards(async () => sessionFor("student"));

    await expect(guards.requireAuth()).resolves.toMatchObject({
      id: "student-1",
      role: "student",
    });
  });

  it("redirects unauthenticated users through the injected handler", async () => {
    const guards = createAuthGuards(async () => null, {
      onUnauthenticated(callbackUrl): never {
        throw new Error(`redirect:${callbackUrl}`);
      },
    });

    await expect(guards.requireAuth("/dashboard?tab=lessons")).rejects.toThrow("redirect:/dashboard?tab=lessons");
  });

  it("returns admin users and rejects non-admin users", async () => {
    const adminGuards = createAuthGuards(async () => sessionFor("admin"));
    const studentGuards = createAuthGuards(async () => sessionFor("student"));

    await expect(adminGuards.requireAdmin()).resolves.toMatchObject({
      id: "admin-1",
      role: "admin",
    });
    await expect(studentGuards.requireAdmin()).rejects.toBeInstanceOf(AdminForbiddenError);
  });
});
