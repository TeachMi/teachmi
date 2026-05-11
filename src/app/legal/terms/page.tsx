import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { getLegalDocument } from "@/lib/legal/documents";

const legalDoc = getLegalDocument("terms_of_service");

export const metadata: Metadata = {
  title: `${legalDoc.title} · TeachMe`,
  description:
    "טיוטה של תנאי השימוש של TeachMe. תוכן סופי בהמתנה לסקירה משפטית.",
};

export const dynamic = "force-static";

export default function TermsPage() {
  return <LegalPageShell document={legalDoc} />;
}
