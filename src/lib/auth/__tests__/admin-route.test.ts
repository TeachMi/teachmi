import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";
import { requireAdminRoute } from "../admin-route";

const NOT_FOUND = "NEXT_NOT_FOUND";

function sessionFor(role: "student" | "tutor" | "admin"): Session {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      id: `${role}-1`,
      role,
      email: `${role}@teachme.local`,
    },
  };
}

describe("requireAdminRoute", () => {
  it("returns admin users without emitting unauthorized analytics", async () => {
    const trackEvent = vi.fn();
    const notFound = vi.fn(() => {
      throw new Error(NOT_FOUND);
    });

    await expect(
      requireAdminRoute("/admin", {
        readSession: async () => sessionFor("admin"),
        notFound,
        trackEvent,
      }),
    ).resolves.toMatchObject({ id: "admin-1", role: "admin" });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s anonymous visitors and emits a non-PII analytics event", async () => {
    const trackEvent = vi.fn();
    const notFound = vi.fn(() => {
      throw new Error(NOT_FOUND);
    });

    await expect(
      requireAdminRoute("/admin/vetting", {
        readSession: async () => null,
        notFound,
        trackEvent,
      }),
    ).rejects.toThrow(NOT_FOUND);

    expect(trackEvent).toHaveBeenCalledWith({
      event: "admin_route_unauthorized",
      role: "anonymous",
      path: "/admin/vetting",
    });
  });

  it("404s authenticated non-admin users and reports only their role", async () => {
    const trackEvent = vi.fn();
    const notFound = vi.fn(() => {
      throw new Error(NOT_FOUND);
    });

    await expect(
      requireAdminRoute("/admin", {
        readSession: async () => sessionFor("tutor"),
        notFound,
        trackEvent,
      }),
    ).rejects.toThrow(NOT_FOUND);

    expect(trackEvent).toHaveBeenCalledWith({
      event: "admin_route_unauthorized",
      role: "tutor",
      path: "/admin",
    });
  });
});
