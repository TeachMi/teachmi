import { describe, expect, it } from "vitest";
import { HeadlineFourSubjects } from "../HeadlineFourSubjects";
import {
  HEADLINE_FOUR_DISPLAY_ORDER,
  HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE,
} from "@/lib/marketplace/headline-subjects";

const ALL_FOUR = [
  { id: "id-1", slug: "mathematics", displayNameHe: "מתמטיקה", sortOrder: 10 },
  { id: "id-2", slug: "english", displayNameHe: "אנגלית", sortOrder: 20 },
  { id: "id-3", slug: "hebrew-lashon", displayNameHe: "עברית ולשון", sortOrder: 30 },
  { id: "id-4", slug: "psychometric", displayNameHe: "פסיכומטרי", sortOrder: 40 },
];

// Walks the JSX tree and yields every `<a href=...>` element it finds (the
// `Link` mock falls back to `<a>` in tests). Matches type === "a" OR type
// looking like the `Link` symbol — both work because we only inspect props.
function collectLinkHrefs(tree: unknown): string[] {
  const hrefs: string[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    const elem = node as {
      type?: unknown;
      props?: Record<string, unknown> & { href?: unknown; children?: unknown };
    };
    if (typeof elem.props?.href === "string") {
      hrefs.push(elem.props.href);
    }
    const children = elem.props?.children;
    if (Array.isArray(children)) {
      children.forEach(visit);
    } else if (children !== undefined) {
      visit(children);
    }
  }
  visit(tree);
  return hrefs;
}

function collectTextStrings(tree: unknown): string[] {
  const strings: string[] = [];
  function visit(node: unknown) {
    if (typeof node === "string") {
      strings.push(node);
      return;
    }
    if (!node || typeof node !== "object") return;
    const elem = node as { props?: { children?: unknown } };
    const children = elem.props?.children;
    if (Array.isArray(children)) {
      children.forEach(visit);
    } else if (children !== undefined) {
      visit(children);
    }
  }
  visit(tree);
  return strings;
}

describe("HeadlineFourSubjects (Story 3.1)", () => {
  it("renders 4 <Link> cards with /browse?subject=<slug> hrefs", () => {
    const tree = HeadlineFourSubjects({ subjects: ALL_FOUR });
    const hrefs = collectLinkHrefs(tree);
    // 4 hrefs, one per headline-four slug.
    expect(hrefs).toHaveLength(4);
    expect(hrefs).toContain("/browse?subject=mathematics");
    expect(hrefs).toContain("/browse?subject=english");
    expect(hrefs).toContain("/browse?subject=hebrew-lashon");
    expect(hrefs).toContain("/browse?subject=psychometric");
  });

  it("renders the cards in HEADLINE_FOUR_DISPLAY_ORDER (Hebrew alphabetical)", () => {
    const tree = HeadlineFourSubjects({ subjects: ALL_FOUR });
    const hrefs = collectLinkHrefs(tree);
    const expectedHrefs = HEADLINE_FOUR_DISPLAY_ORDER.map((slug) => `/browse?subject=${slug}`);
    expect(hrefs).toEqual(expectedHrefs);
  });

  it("uses displayNameHe from the seeded subject row when present", () => {
    const tree = HeadlineFourSubjects({ subjects: ALL_FOUR });
    const text = collectTextStrings(tree);
    expect(text).toContain("מתמטיקה");
    expect(text).toContain("אנגלית");
    expect(text).toContain("עברית ולשון");
    expect(text).toContain("פסיכומטרי");
  });

  it("falls back to HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE when a headline-four slug is missing from subjects (degenerate state)", () => {
    // Simulate Story 3.6 admin hiding 'mathematics' (is_active=false) — it
    // wouldn't be in getActiveSubjects' result. Card MUST still render.
    const subjectsWithoutMath = ALL_FOUR.filter((s) => s.slug !== "mathematics");
    const tree = HeadlineFourSubjects({ subjects: subjectsWithoutMath });

    const hrefs = collectLinkHrefs(tree);
    expect(hrefs).toContain("/browse?subject=mathematics");

    const text = collectTextStrings(tree);
    expect(text).toContain(HEADLINE_FOUR_FALLBACK_DISPLAY_NAMES_HE.mathematics);
  });

  it("renders a section heading 'המקצועות הפופולריים'", () => {
    const tree = HeadlineFourSubjects({ subjects: ALL_FOUR });
    const text = collectTextStrings(tree);
    expect(text).toContain("המקצועות הפופולריים");
  });
});
