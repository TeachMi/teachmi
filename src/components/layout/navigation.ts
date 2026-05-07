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

export const legalLinks = [
  { href: "/legal/terms", label: "תנאי שימוש" },
  { href: "/legal/privacy", label: "מדיניות פרטיות" },
  { href: "/legal/tutor-agreement", label: "הסכם מורה" },
  { href: "/legal/code-of-conduct", label: "קוד התנהגות" },
] satisfies NavigationLink[];
