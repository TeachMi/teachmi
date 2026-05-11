import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { getLegalDocument } from "@/lib/legal/documents";

const legalDoc = getLegalDocument("tutor_agreement");

export const metadata: Metadata = {
  title: `${legalDoc.title} · TeachMe`,
  description:
    "טיוטה של הסכם המורה של TeachMe. תוכן סופי בהמתנה לסקירה משפטית.",
};

export const dynamic = "force-static";

export default function TutorAgreementPage() {
  return <LegalPageShell document={legalDoc} />;
}
