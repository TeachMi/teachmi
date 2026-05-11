import { legalDocuments } from "../../lib/legal/documents";

export interface NavigationLink {
  href: string;
  label: string;
}

export const primaryNavItems = [
  { href: "/", label: "בית" },
  { href: "/browse", label: "חיפוש מורים" },
  { href: "/dashboard", label: "השיעורים שלי" },
  { href: "/help", label: "עזרה" },
] satisfies NavigationLink[];

export const legalLinks: NavigationLink[] = legalDocuments.map((doc) => ({
  href: doc.href,
  label: doc.footerLabel,
}));
