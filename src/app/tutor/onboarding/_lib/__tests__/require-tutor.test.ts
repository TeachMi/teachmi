import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";
import { createTutorGuard } from "../require-tutor";

function sessionFor(role: "student" | "tutor" | "admin"): Session {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: { id: `${role}-1`, role, email: `${role}@teachme.local` },
  };
}

describe("requireTutor", () => {
  it("returns the user when the session role is tutor", async () => {
    const guard = createTutorGuard(async () => sessionFor("tutor"));

    await expect(guard()).resolves.toMatchObject({ id: "tutor-1", role: "tutor" });
  });

  it("invokes onNonTutor for students", async () => {
    const guard = createTutorGuard(async () => sessionFor("student"), {
      onNonTutor(): never {
        throw new Error("redirect:/dashboard");
      },
    });

    await expect(guard()).rejects.toThrow("redirect:/dashboard");
  });

  it("invokes onNonTutor for admins (admins must hit /admin, not the tutor onboarding wizard)", async () => {
    const guard = createTutorGuard(async () => sessionFor("admin"), {
      onNonTutor(): never {
        throw new Error("redirect:/dashboard");
      },
    });

    await expect(guard()).rejects.toThrow("redirect:/dashboard");
  });

  it("invokes onUnauthenticated for null sessions, preserving callbackUrl", async () => {
    const guard = createTutorGuard(async () => null, {
      onUnauthenticated(callbackUrl): never {
        throw new Error(`signin:${callbackUrl}`);
      },
    });

    await expect(guard("/tutor/onboarding/profile")).rejects.toThrow(
      "signin:/tutor/onboarding/profile",
    );
  });
});
