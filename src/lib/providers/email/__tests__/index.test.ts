import { afterEach, describe, expect, it } from "vitest";
import { getEmailProvider } from "../index";

const ORIGINAL_EMAIL_PROVIDER = process.env.EMAIL_PROVIDER;

afterEach(() => {
  if (ORIGINAL_EMAIL_PROVIDER === undefined) {
    delete process.env.EMAIL_PROVIDER;
  } else {
    process.env.EMAIL_PROVIDER = ORIGINAL_EMAIL_PROVIDER;
  }
});

describe("getEmailProvider", () => {
  it("constructs the Resend provider lazily when EMAIL_PROVIDER=resend", () => {
    process.env.EMAIL_PROVIDER = "resend";

    expect(() => getEmailProvider()).not.toThrow();
  });
});
