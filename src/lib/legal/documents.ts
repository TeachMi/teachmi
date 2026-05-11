export type LegalDocumentType =
  | "terms_of_service"
  | "privacy_policy"
  | "tutor_agreement"
  | "code_of_conduct";

export interface LegalDocument {
  type: LegalDocumentType;
  slug: string;
  href: string;
  title: string;
  footerLabel: string;
  version: string;
  lastUpdated: string;
}

const PLACEHOLDER_VERSION = "draft-2026-05-10";
const PLACEHOLDER_LAST_UPDATED = "2026-05-10";

export const legalDocuments = [
  {
    type: "terms_of_service",
    slug: "terms",
    href: "/legal/terms",
    title: "תנאי שימוש",
    footerLabel: "תנאי שימוש",
    version: PLACEHOLDER_VERSION,
    lastUpdated: PLACEHOLDER_LAST_UPDATED,
  },
  {
    type: "privacy_policy",
    slug: "privacy",
    href: "/legal/privacy",
    title: "מדיניות פרטיות",
    footerLabel: "מדיניות פרטיות",
    version: PLACEHOLDER_VERSION,
    lastUpdated: PLACEHOLDER_LAST_UPDATED,
  },
  {
    type: "tutor_agreement",
    slug: "tutor-agreement",
    href: "/legal/tutor-agreement",
    title: "הסכם מורה",
    footerLabel: "הסכם מורה",
    version: PLACEHOLDER_VERSION,
    lastUpdated: PLACEHOLDER_LAST_UPDATED,
  },
  {
    type: "code_of_conduct",
    slug: "code-of-conduct",
    href: "/legal/code-of-conduct",
    title: "קוד התנהגות",
    footerLabel: "קוד התנהגות",
    version: PLACEHOLDER_VERSION,
    lastUpdated: PLACEHOLDER_LAST_UPDATED,
  },
] as const satisfies readonly LegalDocument[];

export function getLegalDocument(type: LegalDocumentType): LegalDocument {
  const doc = legalDocuments.find((d) => d.type === type);
  if (!doc) {
    throw new Error(`Unknown legal document type: ${type}`);
  }
  return doc;
}
