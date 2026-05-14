import { describe, expect, it } from "vitest";
import { ageInYears, validateDependentInput } from "../dependents";

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

describe("dependent helpers", () => {
  const today = new Date("2026-05-14T12:00:00.000Z");

  it("calculates age from ISO date-only strings", () => {
    expect(ageInYears("2010-05-14", today)).toBe(16);
    expect(ageInYears("2008-05-15", today)).toBe(17);
    expect(ageInYears("2008-05-14", today)).toBe(18);
  });

  it("accepts under-18 dependent input", () => {
    expect(
      validateDependentInput(
        form({ name: "נועה כהן", dateOfBirth: "2012-01-10" }),
        today,
      ),
    ).toEqual({
      ok: true,
      values: { name: "נועה כהן", dateOfBirth: "2012-01-10" },
    });
  });

  it("rejects missing name, invalid dates, future dates, and adults", () => {
    expect(
      validateDependentInput(form({ name: "", dateOfBirth: "2012-01-10" }), today),
    ).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });

    expect(
      validateDependentInput(form({ name: "נועה", dateOfBirth: "not-date" }), today),
    ).toMatchObject({ ok: false, fieldErrors: { dateOfBirth: expect.any(String) } });

    expect(
      validateDependentInput(form({ name: "נועה", dateOfBirth: "2027-01-01" }), today),
    ).toMatchObject({ ok: false, fieldErrors: { dateOfBirth: expect.any(String) } });

    expect(
      validateDependentInput(form({ name: "נועה", dateOfBirth: "2008-05-14" }), today),
    ).toMatchObject({ ok: false, fieldErrors: { dateOfBirth: expect.any(String) } });
  });
});
