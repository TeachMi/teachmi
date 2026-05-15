// Subject chip row for the public tutor profile (Story 3.2). RSC.

import { Badge } from "@/components/ui/badge";
import type { TutorSubjectPublic } from "@/lib/db/queries/tutor-queries";

interface SubjectChipsProps {
  subjects: TutorSubjectPublic[];
  /** When true, renders inside the page-level #subjects section with a heading. */
  withSectionHeader?: boolean;
}

export function SubjectChips({ subjects, withSectionHeader = false }: SubjectChipsProps) {
  if (subjects.length === 0) return null;

  const chips = (
    <div className="flex flex-wrap gap-2">
      {subjects.map((s) => (
        <Badge
          key={s.id}
          variant="subject"
          size="md"
          className="rounded-full"
        >
          {s.proficiencyNote
            ? `${s.displayNameHe} — ${s.proficiencyNote}`
            : s.displayNameHe}
        </Badge>
      ))}
    </div>
  );

  if (!withSectionHeader) return chips;

  return (
    <section id="subjects" aria-labelledby="subjects-heading" className="mb-12">
      <h2
        id="subjects-heading"
        className="font-display font-bold text-xl text-primary-container mb-4"
      >
        מקצועות
      </h2>
      {chips}
    </section>
  );
}
