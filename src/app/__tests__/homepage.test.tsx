import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  listSubjects: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { href: string; children: ReactNode }) => children,
}));

vi.mock("@/lib/db/queries/subject-queries", () => ({
  listActiveMarketplaceSubjects: () => mocks.listSubjects(),
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => children,
  CardBody: ({ children }: { children: ReactNode }) => children,
  CardTitle: ({ children }: { children: ReactNode }) => children,
}));

const { default: Home, metadata } = await import("../page");

const LAUNCH_SUBJECTS = [
  {
    id: "s-1",
    slug: "mathematics",
    displayNameHe: "מתמטיקה",
    category: "core",
    sortOrder: 10,
  },
  {
    id: "s-2",
    slug: "english",
    displayNameHe: "אנגלית",
    category: "core",
    sortOrder: 20,
  },
  {
    id: "s-3",
    slug: "hebrew-lashon",
    displayNameHe: "עברית ולשון",
    category: "core",
    sortOrder: 30,
  },
  {
    id: "s-4",
    slug: "psychometric",
    displayNameHe: "פסיכומטרי",
    category: "preparatory",
    sortOrder: 40,
  },
  {
    id: "s-5",
    slug: "statistics",
    displayNameHe: "סטטיסטיקה",
    category: "business",
    sortOrder: 50,
  },
  {
    id: "s-6",
    slug: "accounting",
    displayNameHe: "חשבונאות",
    category: "business",
    sortOrder: 60,
  },
  {
    id: "s-7",
    slug: "economics",
    displayNameHe: "כלכלה",
    category: "business",
    sortOrder: 70,
  },
  {
    id: "s-8",
    slug: "computer-science",
    displayNameHe: "מדעי המחשב",
    category: "science",
    sortOrder: 80,
  },
  {
    id: "s-9",
    slug: "physics",
    displayNameHe: "פיזיקה",
    category: "science",
    sortOrder: 90,
  },
  {
    id: "s-10",
    slug: "chemistry",
    displayNameHe: "כימיה",
    category: "science",
    sortOrder: 100,
  },
  {
    id: "s-11",
    slug: "biology",
    displayNameHe: "ביולוגיה",
    category: "science",
    sortOrder: 110,
  },
];

beforeEach(() => {
  mocks.listSubjects.mockReset().mockResolvedValue(LAUNCH_SUBJECTS);
});

describe("homepage marketplace entry (Story 3.1)", () => {
  it("exports Hebrew public discovery metadata", () => {
    expect(metadata.title).toBe("TeachMe - מצאו מורה פרטי בעברית");
    expect(metadata.description).toContain("מורים פרטיים מאומתים");
  });

  it("renders the headline-four subjects as links into browse", async () => {
    const page = await Home();
    const html = JSON.stringify(page);

    expect(html).toContain("המקצועות הפופולריים");
    expect(html).toContain("/browse?subject=mathematics");
    expect(html).toContain("/browse?subject=english");
    expect(html).toContain("/browse?subject=hebrew-lashon");
    expect(html).toContain("/browse?subject=psychometric");
  });

  it("renders the full active taxonomy from the query result", async () => {
    const page = await Home();
    const html = JSON.stringify(page);

    expect(html).toContain("כל המקצועות");
    for (const subject of LAUNCH_SUBJECTS) {
      expect(html).toContain(subject.displayNameHe);
      expect(html).toContain(`/browse?subject=${subject.slug}`);
    }
  });

  it("URL-encodes subject slugs for browse links", async () => {
    mocks.listSubjects.mockResolvedValue([
      {
        id: "s-he",
        slug: "לשון",
        displayNameHe: "לשון",
        category: "core",
        sortOrder: 10,
      },
    ]);

    const page = await Home();
    const html = JSON.stringify(page);

    expect(html).toContain("/browse?subject=%D7%9C%D7%A9%D7%95%D7%9F");
  });

  it("does not leak stale launch subjects if the configured subject query fails", async () => {
    mocks.listSubjects.mockRejectedValue(new Error("database unavailable"));

    const page = await Home();
    const html = JSON.stringify(page);

    expect(html).toContain("המורה הנכון");
    expect(html).not.toContain("/browse?subject=mathematics");
  });
});
