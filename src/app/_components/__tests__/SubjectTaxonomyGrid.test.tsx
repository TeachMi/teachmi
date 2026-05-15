import { describe, expect, it } from "vitest";
import { SubjectTaxonomyGrid } from "../SubjectTaxonomyGrid";

const ELEVEN_SUBJECTS = [
  { id: "id-1", slug: "mathematics", displayNameHe: "מתמטיקה", sortOrder: 10 },
  { id: "id-2", slug: "english", displayNameHe: "אנגלית", sortOrder: 20 },
  { id: "id-3", slug: "hebrew-lashon", displayNameHe: "עברית ולשון", sortOrder: 30 },
  { id: "id-4", slug: "psychometric", displayNameHe: "פסיכומטרי", sortOrder: 40 },
  { id: "id-5", slug: "statistics", displayNameHe: "סטטיסטיקה", sortOrder: 50 },
  { id: "id-6", slug: "accounting", displayNameHe: "חשבונאות", sortOrder: 60 },
  { id: "id-7", slug: "economics", displayNameHe: "כלכלה", sortOrder: 70 },
  { id: "id-8", slug: "computer-science", displayNameHe: "מדעי המחשב", sortOrder: 80 },
  { id: "id-9", slug: "physics", displayNameHe: "פיזיקה", sortOrder: 90 },
  { id: "id-10", slug: "chemistry", displayNameHe: "כימיה", sortOrder: 100 },
  { id: "id-11", slug: "biology", displayNameHe: "ביולוגיה", sortOrder: 110 },
];

function collectLinkHrefs(tree: unknown): string[] {
  const hrefs: string[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    const elem = node as { props?: { href?: unknown; children?: unknown } };
    if (typeof elem.props?.href === "string") hrefs.push(elem.props.href);
    const children = elem.props?.children;
    if (Array.isArray(children)) children.forEach(visit);
    else if (children !== undefined) visit(children);
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
    if (Array.isArray(children)) children.forEach(visit);
    else if (children !== undefined) visit(children);
  }
  visit(tree);
  return strings;
}

describe("SubjectTaxonomyGrid (Story 3.1)", () => {
  it("renders all 11 subjects as <Link> cards", () => {
    const tree = SubjectTaxonomyGrid({ subjects: ELEVEN_SUBJECTS });
    const hrefs = collectLinkHrefs(tree);
    expect(hrefs).toHaveLength(11);
    for (const subject of ELEVEN_SUBJECTS) {
      expect(hrefs).toContain(`/browse?subject=${subject.slug}`);
    }
  });

  it("sorts subjects by displayNameHe via Hebrew localeCompare", () => {
    const tree = SubjectTaxonomyGrid({ subjects: ELEVEN_SUBJECTS });
    const hrefs = collectLinkHrefs(tree);
    // Compute expected order using the same localeCompare the component uses.
    const expectedOrder = [...ELEVEN_SUBJECTS]
      .sort((a, b) => a.displayNameHe.localeCompare(b.displayNameHe, "he-IL"))
      .map((s) => `/browse?subject=${s.slug}`);
    expect(hrefs).toEqual(expectedOrder);
  });

  it("first card by render order starts with the alphabetically-first Hebrew character", () => {
    // אנגלית (alef) is the alphabetically-first of the 11 launch names.
    const tree = SubjectTaxonomyGrid({ subjects: ELEVEN_SUBJECTS });
    const hrefs = collectLinkHrefs(tree);
    expect(hrefs[0]).toBe("/browse?subject=english");
  });

  it("excludes subjects not passed in (hidden subjects are filtered by the query, not by this component)", () => {
    // If the caller passes only 10 subjects (admin hid one via Story 3.6),
    // the grid renders 10 cards — no fallback for taxonomy.
    const tenSubjects = ELEVEN_SUBJECTS.slice(0, 10);
    const tree = SubjectTaxonomyGrid({ subjects: tenSubjects });
    expect(collectLinkHrefs(tree)).toHaveLength(10);
  });

  it("renders the empty-state copy when subjects is empty", () => {
    const tree = SubjectTaxonomyGrid({ subjects: [] });
    const text = collectTextStrings(tree);
    expect(text).toContain("המקצועות מתעדכנים, חזרו בקרוב.");
    expect(collectLinkHrefs(tree)).toHaveLength(0);
  });

  it("renders the section heading 'כל המקצועות'", () => {
    const tree = SubjectTaxonomyGrid({ subjects: ELEVEN_SUBJECTS });
    const text = collectTextStrings(tree);
    expect(text).toContain("כל המקצועות");
  });
});
