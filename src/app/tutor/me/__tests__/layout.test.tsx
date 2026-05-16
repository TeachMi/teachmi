import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT_SENTINEL = "NEXT_REDIRECT_THROWN_IN_TEST:";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`${REDIRECT_SENTINEL}${path}`);
  },
}));

const mockRequireTutor = vi.fn<(cb?: string) => unknown>();
vi.mock("../../onboarding/_lib/require-tutor", () => ({
  requireTutor: (cb?: string) => mockRequireTutor(cb),
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

const TabNavSpy = vi.hoisted(() => vi.fn(() => null));
vi.mock("../_components/TutorTabNav", () => ({
  TutorTabNav: TabNavSpy,
}));

import TutorMeLayout from "../layout";

beforeEach(() => {
  mockRequireTutor.mockReset();
  TabNavSpy.mockReset();
  TabNavSpy.mockImplementation(() => null);
});

afterEach(() => {
  // nothing
});

function findInTree(
  tree: unknown,
  predicate: (node: { type?: unknown; props?: Record<string, unknown> }) => boolean,
  seen: Set<unknown> = new Set(),
): { type?: unknown; props?: Record<string, unknown> } | null {
  if (!tree || typeof tree !== "object" || seen.has(tree)) return null;
  seen.add(tree);
  const node = tree as { type?: unknown; props?: Record<string, unknown> };
  if (predicate(node)) return node;
  if (!node.props) return null;
  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const c of children) {
      const r = findInTree(c, predicate, seen);
      if (r) return r;
    }
    return null;
  }
  if (children !== undefined) return findInTree(children, predicate, seen);
  return null;
}

const APPROVED_TUTOR = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "ד״ר מיכל",
  email: "ofer-tutor@teachme.co.il",
  role: "tutor",
};

describe("TutorMeLayout — auth + role gate (AC0)", () => {
  it("anonymous → requireTutor throws redirect to /signin", async () => {
    // requireTutor (the real one) is implemented to throw via redirect() —
    // we model that here so the layout's `await requireTutor(...)` rethrows
    // the same way.
    mockRequireTutor.mockImplementation(() => {
      throw new Error(`${REDIRECT_SENTINEL}/signin?callbackUrl=/tutor/me`);
    });

    let thrown: unknown;
    try {
      await TutorMeLayout({ children: null });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe(
      `${REDIRECT_SENTINEL}/signin?callbackUrl=/tutor/me`,
    );
  });

  it("student → requireTutor throws redirect to /dashboard", async () => {
    mockRequireTutor.mockImplementation(() => {
      throw new Error(`${REDIRECT_SENTINEL}/dashboard`);
    });

    let thrown: unknown;
    try {
      await TutorMeLayout({ children: null });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe(`${REDIRECT_SENTINEL}/dashboard`);
  });

  it("admin → requireTutor throws redirect to /dashboard", async () => {
    // Admin lands at /tutor/me by manually typing the URL — requireTutor
    // gates on role==='tutor' specifically (admins use /admin), so the
    // redirect mirrors the student branch but for a different reason.
    // Locks in spec AC0's admin-not-tutor → /dashboard branch.
    mockRequireTutor.mockImplementation(() => {
      throw new Error(`${REDIRECT_SENTINEL}/dashboard`);
    });

    let thrown: unknown;
    try {
      await TutorMeLayout({ children: null });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe(`${REDIRECT_SENTINEL}/dashboard`);
  });

  it("approved tutor → renders TutorTabNav + children + header with public-profile link", async () => {
    mockRequireTutor.mockResolvedValue(APPROVED_TUTOR);

    const tree = await TutorMeLayout({ children: "CHILDREN_MARKER" });

    // TabNav is in the tree.
    const tabNavNode = findInTree(tree, (n) => n.type === TabNavSpy);
    expect(tabNavNode).not.toBeNull();

    // "View public profile" link points to /tutor/<userId>.
    const publicLinkNode = findInTree(
      tree,
      (n) =>
        typeof (n.props as Record<string, unknown> | undefined)?.href ===
          "string" &&
        ((n.props as Record<string, unknown>).href as string) ===
          `/tutor/${APPROVED_TUTOR.id}`,
    );
    expect(publicLinkNode).not.toBeNull();
  });

  it("layout passes /tutor/me as the callbackUrl to requireTutor", async () => {
    mockRequireTutor.mockResolvedValue(APPROVED_TUTOR);
    await TutorMeLayout({ children: null });
    expect(mockRequireTutor).toHaveBeenCalledWith("/tutor/me");
  });
});
