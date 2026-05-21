import { describe, expect, it, vi, beforeEach } from "vitest";

// Tests for `checkoutHandoffAction` — the Server Action behind the booking
// modal's "המשך" click. It RETURNS the target URL (the modal does a soft
// `router.push`, so the anon `/signup` gate is caught by the `(.)signup`
// intercepting route as a modal) — it does NOT `redirect()`. Focus: the role
// gate that keeps tutors/admins out of the booking funnel (single-role model
// — CLAUDE.md) plus the student / anonymous branches.

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({ auth: mockAuth }));

const { checkoutHandoffAction } = await import("../handoff-action");

const TUTOR_A = "11111111-1111-1111-1111-111111111111";
const TUTOR_B = "22222222-2222-2222-2222-222222222222";
const STUDENT = "33333333-3333-3333-3333-333333333333";
const ADMIN = "44444444-4444-4444-4444-444444444444";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function validBookingForm(tutorUserId = TUTOR_A): FormData {
  return formData({
    tutorUserId,
    slotIso: "2026-06-01T15:00:00Z",
    duration: "60",
  });
}

beforeEach(() => {
  mockAuth.mockReset();
});

describe("checkoutHandoffAction — tutor role gate", () => {
  it("bounces a logged-in tutor booking a DIFFERENT tutor to /tutor/me", async () => {
    // The bug this fixes: the self-booking check only catches a tutor
    // booking themselves; a tutor booking another tutor used to fall
    // through to /checkout.
    mockAuth.mockResolvedValue({ user: { id: TUTOR_B, role: "tutor" } });
    const result = await checkoutHandoffAction(validBookingForm(TUTOR_A));
    expect(result.url).toBe("/tutor/me");
  });

  it("bounces a tutor booking THEMSELVES to /tutor/me", async () => {
    mockAuth.mockResolvedValue({ user: { id: TUTOR_A, role: "tutor" } });
    const result = await checkoutHandoffAction(validBookingForm(TUTOR_A));
    expect(result.url).toBe("/tutor/me");
  });

  it("bounces a logged-in admin to /admin — only students book", async () => {
    mockAuth.mockResolvedValue({ user: { id: ADMIN, role: "admin" } });
    const result = await checkoutHandoffAction(validBookingForm(TUTOR_A));
    expect(result.url).toBe("/admin");
  });

  it("sends a signed-in student to /checkout", async () => {
    mockAuth.mockResolvedValue({ user: { id: STUDENT, role: "student" } });
    const result = await checkoutHandoffAction(validBookingForm(TUTOR_A));
    expect(result.url).toMatch(/^\/checkout\?/);
  });

  it("sends an anonymous visitor to the /signup gate", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await checkoutHandoffAction(validBookingForm(TUTOR_A));
    expect(result.url).toMatch(/^\/signup\?/);
  });
});
