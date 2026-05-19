import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSlotPayload } from "../../auth/slot-signing";
import {
  buildCheckoutUrl,
  buildGateSignupUrl,
  buildSignedCheckoutUrl,
  decomposeNextToGateParams,
  parseGateParams,
} from "../urls";

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  // Force the dev-fallback secret path so the HMAC is deterministic across
  // tests + matches the slot-signing.test.ts convention.
  delete process.env.AUTH_SECRET;
  (process.env as Record<string, string>).NODE_ENV = "test";
});

afterEach(() => {
  if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  if (ORIGINAL_NODE_ENV === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    (process.env as Record<string, string>).NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

const TUTOR_ID = "11111111-2222-3333-4444-555555555555";
const SLOT_ISO = "2026-05-20T11:00:00.000Z";

function validSig(): string {
  return signSlotPayload({
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration: 60,
  });
}

describe("buildGateSignupUrl", () => {
  it("composes a /signup URL with all the gate params + an internally-signed sig", () => {
    const url = buildGateSignupUrl({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    expect(url.startsWith("/signup?")).toBe(true);
    const search = new URLSearchParams(url.slice("/signup?".length));
    expect(search.get("callbackUrl")).toBe(`/tutor/${TUTOR_ID}?duration=60`);
    expect(search.get("intent")).toBe("book");
    expect(search.get("tutorUserId")).toBe(TUTOR_ID);
    expect(search.get("slotIso")).toBe(SLOT_ISO);
    expect(search.get("duration")).toBe("60");
    expect(search.get("sig")).toBe(validSig());
  });

  it("uses 45 in callbackUrl + duration param when duration=45", () => {
    const url = buildGateSignupUrl({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 45,
    });
    const search = new URLSearchParams(url.slice("/signup?".length));
    expect(search.get("callbackUrl")).toBe(`/tutor/${TUTOR_ID}?duration=45`);
    expect(search.get("duration")).toBe("45");
  });

  // Story 3.2 emitted this exact URL shape from AvailabilityCalendar.tsx —
  // the refactor must produce byte-equivalent output so existing tests + the
  // shipped consumer (Story 3.3's /signup gate) continue to work unchanged.
  it("matches the byte-equivalent shape AvailabilityCalendar emitted pre-refactor", () => {
    const url = buildGateSignupUrl({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    // Snapshot a stable form (URLSearchParams stringifies in insertion order).
    const expectedCallback = encodeURIComponent(
      `/tutor/${TUTOR_ID}?duration=60`,
    );
    const sig = validSig();
    expect(url).toBe(
      `/signup?callbackUrl=${expectedCallback}&intent=book&tutorUserId=${TUTOR_ID}&slotIso=${encodeURIComponent(SLOT_ISO)}&duration=60&sig=${sig}`,
    );
  });
});

describe("buildCheckoutUrl", () => {
  it("composes a /checkout URL with tutor, slot, duration, sig", () => {
    const sig = validSig();
    const url = buildCheckoutUrl({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
      sig,
    });
    expect(url).toBe(
      `/checkout?tutor=${TUTOR_ID}&slot=${encodeURIComponent(SLOT_ISO)}&duration=60&sig=${sig}`,
    );
  });
});

describe("buildSignedCheckoutUrl", () => {
  it("signs + composes — output equals buildCheckoutUrl with the same sig", () => {
    const signed = buildSignedCheckoutUrl({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    const composed = buildCheckoutUrl({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
      sig: validSig(),
    });
    expect(signed).toBe(composed);
  });
});

describe("parseGateParams — happy path", () => {
  it("accepts a Record<string, string|string[]> input and returns the parsed payload + next URL", () => {
    const sig = validSig();
    const raw = {
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "60",
      sig,
      callbackUrl: `/tutor/${TUTOR_ID}?duration=60`,
    };
    const { payload, reason } = parseGateParams(raw);
    expect(reason).toBeNull();
    expect(payload).not.toBeNull();
    expect(payload?.tutorUserId).toBe(TUTOR_ID);
    expect(payload?.slotIso).toBe(SLOT_ISO);
    expect(payload?.duration).toBe(60);
    expect(payload?.sig).toBe(sig);
    expect(payload?.next).toBe(
      `/checkout?tutor=${TUTOR_ID}&slot=${encodeURIComponent(SLOT_ISO)}&duration=60&sig=${sig}`,
    );
  });

  it("accepts a URLSearchParams input", () => {
    const sig = validSig();
    const sp = new URLSearchParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "60",
      sig,
    });
    const { payload, reason } = parseGateParams(sp);
    expect(reason).toBeNull();
    expect(payload?.duration).toBe(60);
  });

  it("accepts duration=45", () => {
    const sig45 = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 45,
    });
    const raw = {
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "45",
      sig: sig45,
    };
    const { payload, reason } = parseGateParams(raw);
    expect(reason).toBeNull();
    expect(payload?.duration).toBe(45);
  });

  it("unwraps array-shaped query values (Next 16 RSC searchParams quirk)", () => {
    // Next 16 RSC searchParams may surface repeated keys as arrays —
    // ?intent=book&intent=other would be string[]. firstString() takes [0].
    const sig = validSig();
    const raw: Record<string, string | string[]> = {
      intent: ["book", "ignored"],
      tutorUserId: [TUTOR_ID],
      slotIso: SLOT_ISO,
      duration: "60",
      sig,
    };
    const { payload, reason } = parseGateParams(raw);
    expect(reason).toBeNull();
    expect(payload?.tutorUserId).toBe(TUTOR_ID);
  });
});

describe("parseGateParams — validation failures", () => {
  it("returns missing_intent when intent is absent", () => {
    const { payload, reason } = parseGateParams({});
    expect(payload).toBeNull();
    expect(reason).toBe("missing_intent");
  });

  it("returns missing_intent when intent is not 'book'", () => {
    const { payload, reason } = parseGateParams({ intent: "browse" });
    expect(payload).toBeNull();
    expect(reason).toBe("missing_intent");
  });

  it("returns missing_fields when tutorUserId is absent", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      slotIso: SLOT_ISO,
      duration: "60",
      sig: "x",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("missing_fields");
  });

  it("returns missing_fields when slotIso is absent", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      duration: "60",
      sig: "x",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("missing_fields");
  });

  it("returns missing_fields when duration is absent", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      sig: "x",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("missing_fields");
  });

  it("returns missing_fields when sig is absent", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "60",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("missing_fields");
  });

  it("returns missing_fields when sig is an empty string", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "60",
      sig: "",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("missing_fields");
  });

  it("returns bad_uuid when tutorUserId is not a UUID", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: "not-a-uuid",
      slotIso: SLOT_ISO,
      duration: "60",
      sig: "AAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("bad_uuid");
  });

  it("returns bad_slot_iso when slotIso is not a valid ISO UTC string", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: "tomorrow at 2pm",
      duration: "60",
      sig: "AAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("bad_slot_iso");
  });

  it("returns bad_duration when duration is not 45 or 60", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "30",
      sig: "AAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("bad_duration");
  });

  it("returns bad_duration for non-numeric duration", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "sixty",
      sig: "AAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("bad_duration");
  });

  it("returns sig_invalid when the sig was minted for a different tutorUserId", () => {
    const otherSig = signSlotPayload({
      tutorUserId: "00000000-0000-0000-0000-000000000000",
      slotIso: SLOT_ISO,
      duration: 60,
    });
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "60",
      sig: otherSig,
    });
    expect(payload).toBeNull();
    expect(reason).toBe("sig_invalid");
  });

  it("returns sig_invalid for a malformed base64url sig", () => {
    const { payload, reason } = parseGateParams({
      intent: "book",
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: "60",
      sig: "not-base64!!",
    });
    expect(payload).toBeNull();
    expect(reason).toBe("sig_invalid");
  });
});

describe("decomposeNextToGateParams", () => {
  it("extracts gate params from a valid checkout URL", () => {
    const sig = validSig();
    const next = buildCheckoutUrl({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
      sig,
    });
    const result = decomposeNextToGateParams(next);
    expect(result).not.toBeNull();
    expect(result?.tutorUserId).toBe(TUTOR_ID);
    expect(result?.slotIso).toBe(SLOT_ISO);
    expect(result?.duration).toBe(60);
    expect(result?.sig).toBe(sig);
    expect(result?.next).toBe(next);
  });

  it("returns null for an empty string", () => {
    expect(decomposeNextToGateParams("")).toBeNull();
  });

  it("returns null when the path is not /checkout", () => {
    const sig = validSig();
    const fake = `/dashboard?tutor=${TUTOR_ID}&slot=${SLOT_ISO}&duration=60&sig=${sig}`;
    expect(decomposeNextToGateParams(fake)).toBeNull();
  });

  it("returns null when sig is missing from the embedded URL", () => {
    const partial = `/checkout?tutor=${TUTOR_ID}&slot=${SLOT_ISO}&duration=60`;
    expect(decomposeNextToGateParams(partial)).toBeNull();
  });

  it("returns null when sig is tampered", () => {
    const tampered = `/checkout?tutor=${TUTOR_ID}&slot=${SLOT_ISO}&duration=60&sig=AAAAAAAAAAAAAAAAAAAAAA`;
    expect(decomposeNextToGateParams(tampered)).toBeNull();
  });

  it("returns null when the embedded duration is not 45 or 60", () => {
    const sig = signSlotPayload({
      tutorUserId: TUTOR_ID,
      slotIso: SLOT_ISO,
      duration: 60,
    });
    // Even with a valid sig for duration=60, passing duration=30 in the URL
    // must fail (coerceDuration rejects).
    const fake = `/checkout?tutor=${TUTOR_ID}&slot=${SLOT_ISO}&duration=30&sig=${sig}`;
    expect(decomposeNextToGateParams(fake)).toBeNull();
  });

  it("returns null when the embedded tutorUserId is not a UUID", () => {
    const sig = validSig();
    const fake = `/checkout?tutor=not-a-uuid&slot=${SLOT_ISO}&duration=60&sig=${sig}`;
    expect(decomposeNextToGateParams(fake)).toBeNull();
  });

  it("accepts an absolute URL form (defensive)", () => {
    const sig = validSig();
    const next = `https://teachme.app/checkout?tutor=${TUTOR_ID}&slot=${encodeURIComponent(SLOT_ISO)}&duration=60&sig=${sig}`;
    const result = decomposeNextToGateParams(next);
    expect(result).not.toBeNull();
    expect(result?.tutorUserId).toBe(TUTOR_ID);
  });

  it("returns null for a malformed absolute URL", () => {
    expect(decomposeNextToGateParams("http://[invalid]")).toBeNull();
  });
});
