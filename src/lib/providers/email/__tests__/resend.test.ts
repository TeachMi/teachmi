import { describe, expect, it } from "vitest";
import { ResendEmailProvider } from "../resend";

describe("ResendEmailProvider", () => {
  it("sends a published template with uppercase variables through the Resend API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const provider = new ResendEmailProvider({
      apiKey: "re_test",
      from: "TeachMe <accounts@support.ayosef.dev>",
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.sendTransactional({
      toAddress: "student@example.com",
      subject: "אימות כתובת אימייל ב-TeachMe",
      templateId: "account-verification",
      payload: {
        displayName: "נועה",
        verifyUrl: "https://teachme.test/signup/verify?token=123456_secure",
        verificationCode: "123456",
        expiresInMinutes: 15,
        ignoredNull: null,
      },
    });

    expect(result).toEqual({ messageId: "email_123", kind: "transactional" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({
      Authorization: "Bearer re_test",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: "TeachMe <accounts@support.ayosef.dev>",
      to: "student@example.com",
      subject: "אימות כתובת אימייל ב-TeachMe",
      template: {
        id: "account-verification",
        variables: {
          DISPLAY_NAME: "נועה",
          VERIFY_URL: "https://teachme.test/signup/verify?token=123456_secure",
          VERIFICATION_CODE: "123456",
          EXPIRES_IN_MINUTES: 15,
        },
      },
    });
  });

  it("fails loudly before network I/O when RESEND_API_KEY is missing", async () => {
    const provider = new ResendEmailProvider({
      apiKey: "",
      fetchFn: (async () => {
        throw new Error("fetch should not run");
      }) as typeof fetch,
    });

    await expect(
      provider.sendTransactional({
        toAddress: "student@example.com",
        subject: "אימות כתובת אימייל ב-TeachMe",
        templateId: "account-verification",
        payload: {},
      }),
    ).rejects.toThrow("RESEND_API_KEY");
  });
});
