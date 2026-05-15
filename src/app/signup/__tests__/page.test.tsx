import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `redirect()` from next/navigation throws a Next.js-internal error to halt
// rendering. Mock it to throw a recognizable sentinel we can assert against —
// includes the redirect target so each test can verify where the redirect
// pointed.
const REDIRECT_SENTINEL = "NEXT_REDIRECT_THROWN_IN_TEST:";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`${REDIRECT_SENTINEL}${path}`);
  },
}));

// Mock the discoverable-tutor lookup. Default returns null; individual tests
// override per case.
const mockGetDiscoverable = vi.fn();
vi.mock("@/lib/db/queries/tutor-queries", () => ({
  getDiscoverableTutorByUserId: (...args: unknown[]) => mockGetDiscoverable(...args),
}));

// Mock `auth()`.
const mockAuth = vi.fn();
vi.mock("@/lib/auth/auth", () => ({
  auth: () => mockAuth(),
}));

// Track recorder.
const trackedEvents: Array<Record<string, unknown>> = [];
vi.mock("@/lib/analytics", () => ({
  track: (event: Record<string, unknown>) => {
    trackedEvents.push(event);
  },
}));

// Mock SignupForm so we can inspect the `next` prop passed in via the JSX
// tree. React component spies are referenced as element types — the function
// body never runs at test time; we walk the returned tree to find the element
// whose `type === SignupFormSpy` and read its props.
const SignupFormSpy = vi.hoisted(() => vi.fn(() => null));
vi.mock("../SignupForm", () => ({ SignupForm: SignupFormSpy }));

// Mock AppShell — passes through children only.
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

import { signSlotPayload } from "@/lib/auth/slot-signing";
import { buildBookingStubUrl } from "@/lib/booking/urls";
import SignupPage from "../page";

const TUTOR_ID = "11111111-2222-3333-4444-555555555555";
const SLOT_ISO = "2026-05-20T11:00:00.000Z";
const TUTOR_DISPLAY_NAME = "ד״ר מיכל לוי";

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  delete process.env.AUTH_SECRET;
  (process.env as Record<string, string>).NODE_ENV = "test";

  mockGetDiscoverable.mockReset();
  mockAuth.mockReset();
  SignupFormSpy.mockReset();
  SignupFormSpy.mockImplementation(() => null);
  trackedEvents.length = 0;
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

function findPropsByType(
  tree: unknown,
  type: unknown,
): Record<string, unknown> | null {
  if (!tree || typeof tree !== "object") return null;
  const node = tree as { type?: unknown; props?: Record<string, unknown> };
  if (node.type === type) return node.props ?? {};
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findPropsByType(child, type);
      if (found) return found;
    }
    return null;
  }
  if (children !== undefined) return findPropsByType(children, type);
  return null;
}

function makeGateSearchParams(): Record<string, string> {
  const sig = signSlotPayload({
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration: 60,
  });
  return {
    callbackUrl: `/tutor/${TUTOR_ID}?duration=60`,
    intent: "book",
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration: "60",
    sig,
  };
}

function expectedNext(): string {
  const sig = signSlotPayload({
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration: 60,
  });
  return buildBookingStubUrl({
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration: 60,
    sig,
  });
}

async function renderPage(
  searchParams: Record<string, string | undefined> | undefined,
): Promise<unknown> {
  return await SignupPage({
    searchParams:
      searchParams === undefined ? undefined : Promise.resolve(searchParams),
  });
}

function getSignupFormProps(tree: unknown): Record<string, unknown> | null {
  return findPropsByType(tree, SignupFormSpy);
}

describe("SignupPage — valid intent + tutor discoverable", () => {
  it("renders the banner with tutor display name and passes next to SignupForm", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    const tree = await renderPage(makeGateSearchParams());
    expect(tree).toBeDefined();

    const props = getSignupFormProps(tree);
    expect(props).not.toBeNull();
    expect(props?.next).toBe(expectedNext());

    // Banner copy somewhere in the rendered tree.
    // IntentBanner is rendered as a component reference in the JSX tree; its
    // body isn't expanded by the page server-component executor. Assert via
    // the prop the page passes in.
    expect(JSON.stringify(tree)).toContain(`"tutorDisplayName":"${TUTOR_DISPLAY_NAME}"`);

    // `signup_intent_book_landed` fired once with the right tutorUserId.
    expect(trackedEvents).toEqual([
      { event: "signup_intent_book_landed", tutorUserId: TUTOR_ID },
    ]);
  });
});

describe("SignupPage — tampered sig", () => {
  it("hides banner and fires signup_intent_book_tampered with reason sig_invalid", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    const params = makeGateSearchParams();
    params.sig = "AAAAAAAAAAAAAAAAAAAAAA";

    const tree = await renderPage(params);

    const props = getSignupFormProps(tree);
    expect(props?.next).toBeUndefined();
    expect(JSON.stringify(tree)).not.toContain(`"tutorDisplayName"`);
    expect(trackedEvents).toEqual([
      { event: "signup_intent_book_tampered", reason: "sig_invalid", source: "signup" },
    ]);
  });

  it("missing tutorUserId fires reason missing_fields", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    const params: Record<string, string> = {
      intent: "book",
      slotIso: SLOT_ISO,
      duration: "60",
      sig: "AAAAAAAAAAAAAAAAAAAAAA",
    };
    await renderPage(params);

    expect(trackedEvents).toEqual([
      { event: "signup_intent_book_tampered", reason: "missing_fields", source: "signup" },
    ]);
  });

  it("missing intent silently degrades — no tampered event, no banner", async () => {
    mockAuth.mockResolvedValue(null);
    const tree = await renderPage({});

    const props = getSignupFormProps(tree);
    expect(props?.next).toBeUndefined();
    expect(JSON.stringify(tree)).not.toContain(`"tutorDisplayName"`);
    expect(trackedEvents).toEqual([]);
  });
});

describe("SignupPage — valid sig but tutor not discoverable", () => {
  it("hides banner and fires signup_intent_book_tutor_not_found", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue(null);

    const tree = await renderPage(makeGateSearchParams());

    const props = getSignupFormProps(tree);
    expect(props?.next).toBeUndefined();
    expect(JSON.stringify(tree)).not.toContain(`"tutorDisplayName"`);

    expect(trackedEvents).toEqual([
      {
        event: "signup_intent_book_tutor_not_found",
        tutorUserId: TUTOR_ID,
        source: "signup",
      },
    ]);
  });
});

describe("SignupPage — single-param callbackUrl fallback (cross-link from /signin)", () => {
  it("decomposes /signup?callbackUrl=<bookingstub> into gate params + renders banner", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    const callbackUrl = expectedNext();
    const tree = await renderPage({ callbackUrl });

    const props = getSignupFormProps(tree);
    expect(props?.next).toBe(callbackUrl);
    // IntentBanner is rendered as a component reference in the JSX tree; its
    // body isn't expanded by the page server-component executor. Assert via
    // the prop the page passes in.
    expect(JSON.stringify(tree)).toContain(`"tutorDisplayName":"${TUTOR_DISPLAY_NAME}"`);
    expect(trackedEvents).toEqual([
      { event: "signup_intent_book_landed", tutorUserId: TUTOR_ID },
    ]);
  });
});

describe("SignupPage — already signed in", () => {
  it("redirects to next when intent valid + tutor discoverable", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1", email: "u@x.com" } });
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    await expect(renderPage(makeGateSearchParams())).rejects.toThrow(
      `${REDIRECT_SENTINEL}${expectedNext()}`,
    );
  });

  it("redirects to /dashboard when no intent params", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1", email: "u@x.com" } });
    await expect(renderPage({})).rejects.toThrow(
      `${REDIRECT_SENTINEL}/dashboard`,
    );
  });

  it("redirects to /dashboard when intent sig is tampered (no preserved next)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1", email: "u@x.com" } });
    const params = makeGateSearchParams();
    params.sig = "AAAAAAAAAAAAAAAAAAAAAA";

    await expect(renderPage(params)).rejects.toThrow(
      `${REDIRECT_SENTINEL}/dashboard`,
    );
    expect(trackedEvents).toContainEqual({
      event: "signup_intent_book_tampered",
      reason: "sig_invalid",
      source: "signup",
    });
  });
});

describe("SignupPage — DB outage during tutor lookup", () => {
  it("degrades to no-banner signup when getDiscoverableTutorByUserId throws", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockRejectedValue(new Error("Neon unreachable"));

    const tree = await renderPage(makeGateSearchParams());

    const props = getSignupFormProps(tree);
    expect(props?.next).toBeUndefined();
    expect(JSON.stringify(tree)).not.toContain(`"tutorDisplayName"`);
  });
});
