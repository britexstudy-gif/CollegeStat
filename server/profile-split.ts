import type { University } from "@/lib/domain";
import type { HeavyProfile } from "@/lib/profile-defer";
import { programListings } from "@/lib/program-discovery";
import { universityEnrichment } from "@/lib/university-enrichment";
import { withAutoLogo } from "./auto-logos";
import { recordCategory } from "@/lib/profile-records";

/** Split a full profile into what the first paint needs and the long lists.
 * The lite record carries the two counts the Overview and Costs summaries
 * derive from the programme list, computed here with the same functions. */
export function splitProfile(full: University): { lite: University; heavy: HeavyProfile } {
  // profile_resources only repeats fields the record already exposes at the top
  // level (normalizeUniversity spreads it), so merge it first and drop the copy.
  const { profile_resources, ...flat } = { ...full.profile_resources, ...full } as University;
  void profile_resources;
  const academic = (r: NonNullable<University["imported_records"]>[number]) =>
    recordCategory(r) === "Academics";
  const heavy: HeavyProfile = {
    university_programs: flat.university_programs,
    research_metrics: flat.research_metrics ?? [],
    papers: flat.research_identity?.papers ?? [],
    academic_records: flat.imported_records?.filter(academic) ?? [],
  };
  const reviewed = universityEnrichment(flat);
  const lite: University = withAutoLogo({
    ...flat,
    university_programs: [],
    research_metrics: [],
    imported_records: flat.imported_records?.filter((r) => !academic(r)),
    research_identity: flat.research_identity ? { ...flat.research_identity, papers: [] } : flat.research_identity,
    deferred: {
      official_programmes: programListings(flat, reviewed?.programmes).filter((p) => p.origin === "official").length,
      current_programmes: flat.university_programs.filter(
        (r) => r.verification_status === "verified" && r.source_id && r.verified_at,
      ).length,
    },
  });
  return { lite, heavy };
}
