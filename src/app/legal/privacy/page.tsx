import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { getLegalDocument } from "@/lib/legal/documents";

const legalDoc = getLegalDocument("privacy_policy");

export const metadata: Metadata = {
  title: `${legalDoc.title} · TeachMe`,
  description:
    "טיוטה של מדיניות הפרטיות של TeachMe. תוכן סופי בהמתנה לסקירה משפטית.",
};

export const dynamic = "force-static";

export default function PrivacyPage() {
  return <LegalPageShell document={legalDoc} />;
}
