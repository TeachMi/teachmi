import { describe, expect, it, vi, beforeEach } from "vitest";

// Tests for `submitCheckoutAction` — the Server Action behind the checkout
// form. Focus: the load-bearing role gate. `checkoutHandoffAction` bounces
// tutors before they reach /checkout, but a hand-crafted POST straight to
// this action must also be rejected — server-side, on the write path.

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({ auth: mockAuth }));

// `redirect()` throws to abort control flow; the mock mirrors that.
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { submitCheckoutAction } = await import("../booking-actions");

const TUTOR = "11111111-1111-1111-1111-111111111111";
const OTHER_TUTOR = "22222222-2222-2222-2222-222222222222";

function checkoutInput(overrides: Record<string, unknown> = {}) {
  return {
    tutorUserId: OTHER_TUTOR,
    slotIso: "2026-06-01T15:00:00Z",
    duration: 60 as const,
    sig: "sig",
    billing: {} as never,
    ...overrides,
  };
}

async function captureRedirect(): Promise<string> {
  try {
    await submitCheckoutAction(checkoutInput());
  } catch {
    // redirect mock throws — swallow; the target is read from the spy.
  }
  const call = redirectMock.mock.calls[0];
  if (!call) throw new Error("redirect was not called");
  return call[0] as string;
}

beforeEach(() => {
  mockAuth.mockReset();
  redirectMock.mockClear();
});

describe("submitCheckoutAction — role gate", () => {
  it("rejects a logged-in tutor with a redirect to /tutor/me", async () => {
    // The redirect throws before any DB work, so no db mocks are needed.
    mockAuth.mockResolvedValue({ user: { id: TUTOR, role: "tutor" } });
    expect(await captureRedirect()).toBe("/tutor/me");
  });

  it("rejects a logged-in admin with a redirect to /admin", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "55555555-5555-5555-5555-555555555555", role: "admin" },
    });
    expect(await captureRedirect()).toBe("/admin");
  });

  it("redirects an anonymous caller to /signin", async () => {
    mockAuth.mockResolvedValue(null);
    expect(await captureRedirect()).toBe("/signin?callbackUrl=/checkout");
  });
});
