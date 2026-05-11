import { describe, expect, it } from "vitest";
import { legalLinks } from "../../components/layout/navigation";
import {
  getLegalDocument,
  legalDocuments,
  type LegalDocumentType,
} from "./documents";

describe("legalDocuments", () => {
  it("contains exactly four documents", () => {
    expect(legalDocuments).toHaveLength(4);
  });

  it("exposes stable types matching consent_receipts.document_type enum", () => {
    expect(legalDocuments.map((d) => d.type)).toEqual([
      "terms_of_service",
      "privacy_policy",
      "tutor_agreement",
      "code_of_conduct",
    ]);
  });

  it("keeps stable hrefs in the documented order", () => {
    expect(legalDocuments.map((d) => d.href)).toEqual([
      "/legal/terms",
      "/legal/privacy",
      "/legal/tutor-agreement",
      "/legal/code-of-conduct",
    ]);
  });

  it("keeps href and slug consistent", () => {
    for (const doc of legalDocuments) {
      expect(doc.href).toBe(`/legal/${doc.slug}`);
    }
  });

  it("has matching footer labels for the SiteFooter consumer", () => {
    expect(legalDocuments.map((d) => d.footerLabel)).toEqual([
      "תנאי שימוש",
      "מדיניות פרטיות",
      "הסכם מורה",
      "קוד התנהגות",
    ]);
  });

  it("ships a placeholder version that signals draft status", () => {
    for (const doc of legalDocuments) {
      expect(doc.version).toMatch(/^draft-/);
    }
  });
});

describe("getLegalDocument", () => {
  it.each([
    ["terms_of_service", "terms"],
    ["privacy_policy", "privacy"],
    ["tutor_agreement", "tutor-agreement"],
    ["code_of_conduct", "code-of-conduct"],
  ] as const)("returns the %s document with slug %s", (type, slug) => {
    expect(getLegalDocument(type).slug).toBe(slug);
  });

  it("throws for an unknown type", () => {
    expect(() =>
      getLegalDocument("marketing_opt_in" as unknown as LegalDocumentType),
    ).toThrow(/Unknown legal document type/);
  });
});

describe("legalLinks ⇄ legalDocuments correspondence", () => {
  it("derives legalLinks 1:1 from legalDocuments in the same order", () => {
    expect(legalLinks).toEqual(
      legalDocuments.map((doc) => ({
        href: doc.href,
        label: doc.footerLabel,
      })),
    );
  });
});
