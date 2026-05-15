import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT_SENTINEL = "NEXT_REDIRECT_THROWN_IN_TEST:";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`${REDIRECT_SENTINEL}${path}`);
  },
}));

const mockGetDiscoverable = vi.fn();
vi.mock("@/lib/db/queries/tutor-queries", () => ({
  getDiscoverableTutorByUserId: (...args: unknown[]) => mockGetDiscoverable(...args),
}));

const mockAuth = vi.fn();
const mockSignIn = vi.fn();
vi.mock("@/lib/auth/auth", () => ({
  auth: () => mockAuth(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

const trackedEvents: Array<Record<string, unknown>> = [];
vi.mock("@/lib/analytics", () => ({
  track: (event: Record<string, unknown>) => {
    trackedEvents.push(event);
  },
}));

const SignInFormSpy = vi.hoisted(() => vi.fn(() => null));
vi.mock("../SignInForm", () => ({ SignInForm: SignInFormSpy }));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

import { signSlotPayload } from "@/lib/auth/slot-signing";
import { buildBookingStubUrl } from "@/lib/booking/urls";
import SignInPage from "../page";

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
  mockSignIn.mockReset();
  SignInFormSpy.mockReset();
  SignInFormSpy.mockImplementation(() => null);
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

// Walks the JSX tree looking for any element whose props contain `key` with
// `value`. We use this to detect the IntentBanner without depending on
// JSON.stringify — the /signin page has Server Action refs in its form
// action prop which create circular structures that JSON can't serialize.
function treeHasPropValue(
  tree: unknown,
  key: string,
  value: unknown,
  seen: Set<unknown> = new Set(),
): boolean {
  if (!tree || typeof tree !== "object") return false;
  if (seen.has(tree)) return false;
  seen.add(tree);
  const node = tree as { props?: Record<string, unknown> };
  if (node.props && node.props[key] === value) return true;
  if (!node.props) return false;
  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (treeHasPropValue(child, key, value, seen)) return true;
    }
    return false;
  }
  if (children !== undefined) return treeHasPropValue(children, key, value, seen);
  return false;
}

function treeHasPropKey(
  tree: unknown,
  key: string,
  seen: Set<unknown> = new Set(),
): boolean {
  if (!tree || typeof tree !== "object") return false;
  if (seen.has(tree)) return false;
  seen.add(tree);
  const node = tree as { props?: Record<string, unknown> };
  if (node.props && key in node.props) return true;
  if (!node.props) return false;
  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (treeHasPropKey(child, key, seen)) return true;
    }
    return false;
  }
  if (children !== undefined) return treeHasPropKey(children, key, seen);
  return false;
}

function makeGateSearchParams(): Record<string, string> {
  const sig = signSlotPayload({
    tutorUserId: TUTOR_ID,
    slotIso: SLOT_ISO,
    duration: 60,
  });
  return {
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
  return await SignInPage({
    searchParams:
      searchParams === undefined ? undefined : Promise.resolve(searchParams),
  });
}

function getSignInFormProps(tree: unknown): Record<string, unknown> | null {
  return findPropsByType(tree, SignInFormSpy);
}

describe("SignInPage — valid intent + tutor discoverable", () => {
  it("overrides callbackUrl with the synthesized booking-stub URL and renders the banner", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    const tree = await renderPage(makeGateSearchParams());

    const props = getSignInFormProps(tree);
    expect(props?.callbackUrl).toBe(expectedNext());

    // Banner rendered via IntentBanner component reference.
    expect(treeHasPropValue(tree, "tutorDisplayName", TUTOR_DISPLAY_NAME)).toBe(true);

    expect(trackedEvents).toEqual([
      { event: "signin_intent_book_landed", tutorUserId: TUTOR_ID },
    ]);
  });

  it("overrides an explicit ?callbackUrl= when intent params are present", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    const params = {
      ...makeGateSearchParams(),
      callbackUrl: "/dashboard?tab=lessons",
    };
    const tree = await renderPage(params);

    const props = getSignInFormProps(tree);
    expect(props?.callbackUrl).toBe(expectedNext());
    expect(props?.callbackUrl).not.toBe("/dashboard?tab=lessons");
  });
});

describe("SignInPage — single-param callbackUrl fallback (cross-link from /signup)", () => {
  it("decomposes a /signin?callbackUrl=<bookingstub> URL into gate params + renders banner", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    const callbackUrl = expectedNext();
    const tree = await renderPage({ callbackUrl });

    const props = getSignInFormProps(tree);
    expect(props?.callbackUrl).toBe(callbackUrl);
    expect(treeHasPropValue(tree, "tutorDisplayName", TUTOR_DISPLAY_NAME)).toBe(true);
    expect(trackedEvents).toEqual([
      { event: "signin_intent_book_landed", tutorUserId: TUTOR_ID },
    ]);
  });
});

describe("SignInPage — tampered or missing intent", () => {
  it("hides banner + falls back to default callbackUrl on tampered sig", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    const params = makeGateSearchParams();
    params.sig = "AAAAAAAAAAAAAAAAAAAAAA";

    const tree = await renderPage(params);

    const props = getSignInFormProps(tree);
    expect(props?.callbackUrl).toBe("/dashboard");
    expect(treeHasPropKey(tree, "tutorDisplayName")).toBe(false);
    expect(trackedEvents).toEqual([
      { event: "signup_intent_book_tampered", reason: "sig_invalid", source: "signin" },
    ]);
  });

  it("no intent params — falls back to default callbackUrl + no banner + no events", async () => {
    mockAuth.mockResolvedValue(null);
    const tree = await renderPage({});

    const props = getSignInFormProps(tree);
    expect(props?.callbackUrl).toBe("/dashboard");
    expect(treeHasPropKey(tree, "tutorDisplayName")).toBe(false);
    expect(trackedEvents).toEqual([]);
  });

  it("explicit ?callbackUrl= without intent → callbackUrl preserved (no banner)", async () => {
    mockAuth.mockResolvedValue(null);
    const tree = await renderPage({ callbackUrl: "/dashboard?tab=lessons" });

    const props = getSignInFormProps(tree);
    expect(props?.callbackUrl).toBe("/dashboard?tab=lessons");
    expect(treeHasPropKey(tree, "tutorDisplayName")).toBe(false);
  });
});

describe("SignInPage — already signed in", () => {
  it("redirects to gate next when intent valid + tutor discoverable", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1", email: "u@x.com" } });
    mockGetDiscoverable.mockResolvedValue({
      userId: TUTOR_ID,
      displayName: TUTOR_DISPLAY_NAME,
    });

    await expect(renderPage(makeGateSearchParams())).rejects.toThrow(
      `${REDIRECT_SENTINEL}${expectedNext()}`,
    );
  });

  it("redirects to explicit callbackUrl when no intent", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1", email: "u@x.com" } });

    await expect(
      renderPage({ callbackUrl: "/dashboard?tab=lessons" }),
    ).rejects.toThrow(`${REDIRECT_SENTINEL}/dashboard?tab=lessons`);
  });
});
