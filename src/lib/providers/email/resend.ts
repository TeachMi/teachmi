import type {
  EmailProvider,
  MarketingEmail,
  SendResult,
  TransactionalEmail,
} from "./types";

const RESEND_SEND_EMAIL_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "TeachMe <accounts@support.ayosef.dev>";

type FetchFn = typeof fetch;

interface ResendSendResponse {
  id?: unknown;
  message?: unknown;
  name?: unknown;
}

export interface ResendEmailProviderOptions {
  apiKey?: string;
  from?: string;
  fetchFn?: FetchFn;
}

function readRequired(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new Error(
      `ResendEmailProvider: required env var ${name} is missing or empty.`,
    );
  }
  return trimmed;
}

function templateVariableKey(key: string): string {
  if (/^[A-Z0-9_]+$/.test(key)) return key;
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function toTemplateVariables(payload: Record<string, unknown>): Record<string, string | number> {
  const variables: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" || typeof value === "number") {
      variables[templateVariableKey(key)] = value;
    }
  }

  return variables;
}

async function readResponseBody(response: Response): Promise<ResendSendResponse> {
  try {
    return (await response.json()) as ResendSendResponse;
  } catch {
    return {};
  }
}

export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey?: string;
  private readonly from?: string;
  private readonly fetchFn?: FetchFn;

  constructor(options: ResendEmailProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.from = options.from;
    this.fetchFn = options.fetchFn;
  }

  async sendTransactional(input: TransactionalEmail): Promise<SendResult> {
    return this.send("transactional", input);
  }

  async sendMarketingWithConsentReceipt(input: MarketingEmail): Promise<SendResult> {
    if (input.consentReceiptRef.trim() === "") {
      throw new Error(
        "Marketing email requires a non-empty consentReceiptRef pointing at a row in consent_receipts.",
      );
    }
    return this.send("marketing", input);
  }

  private async send(
    kind: "transactional" | "marketing",
    input: TransactionalEmail,
  ): Promise<SendResult> {
    const apiKey = readRequired(this.apiKey ?? process.env.RESEND_API_KEY, "RESEND_API_KEY");
    const from = (this.from ?? process.env.RESEND_FROM ?? DEFAULT_FROM).trim();
    const fetchImpl = this.fetchFn ?? globalThis.fetch;

    const response = await fetchImpl(RESEND_SEND_EMAIL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.toAddress,
        subject: input.subject,
        template: {
          id: input.templateId,
          variables: toTemplateVariables(input.payload),
        },
      }),
    });

    const body = await readResponseBody(response);

    if (!response.ok) {
      const detail =
        typeof body.message === "string"
          ? body.message
          : `${response.status} ${response.statusText}`;
      throw new Error(`ResendEmailProvider: send failed: ${detail}`);
    }

    if (typeof body.id !== "string" || body.id.trim() === "") {
      throw new Error("ResendEmailProvider: send succeeded without a message id.");
    }

    return { messageId: body.id, kind };
  }
}
