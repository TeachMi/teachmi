import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { getLegalDocument } from "@/lib/legal/documents";

const legalDoc = getLegalDocument("code_of_conduct");

export const metadata: Metadata = {
  title: `${legalDoc.title} · TeachMe`,
  description:
    "טיוטה של קוד ההתנהגות של TeachMe. תוכן סופי בהמתנה לסקירה משפטית.",
};

export const dynamic = "force-static";

export default function CodeOfConductPage() {
  return <LegalPageShell document={legalDoc} />;
}
