import reference from "@/supabase/reference-catalogue.json";
import { currentScholarships } from "./scholarship-catalogue";
import imported from "@/data/published/imported.json";
import { normalizeUniversity, type ImportedRecord, University } from "@/lib/domain";
// Read-only reference catalogue; factual observations retain official source citations.
export const referenceCatalogue = reference.map((u) => {
  const slug = u.slug as keyof typeof imported.identities;
  const identity = imported.identities[slug];
  return normalizeUniversity({
    ...(u as unknown as University),
    aliases: identity?.aliases ?? [],
    identifiers: identity ? {
      ror: identity.ror,
      openalex: identity.openalex,
      wikidata: identity.wikidata,
      ipeds: identity.unitid,
      opeid: "opeid" in identity ? identity.opeid : null,
    } : {},
    imported_records: imported.records.filter(
      (r) => r.university_id === u.id,
    ) as ImportedRecord[],
  });
});

export const referenceScholarships = [...currentScholarships, ...referenceCatalogue.flatMap((u) =>
  u.university_scholarships.flatMap((l) =>
    l.scholarships ? [l.scholarships] : [],
  ),
)];
