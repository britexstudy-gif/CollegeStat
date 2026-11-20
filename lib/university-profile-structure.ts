import type { University } from "./domain";
import type { UniversityEnrichment } from "./university-enrichment";
import { profileCampusGallery } from "./campus-gallery";
import { programListings } from "./program-discovery";

/** Counts describe reviewed selections, never the university's complete offering. */
export function profileSectionSummaries(
  u: Pick<
    University,
    | "id"
    | "university_programs"
    | "reported_programs"
    | "admissions_url"
    | "requirements"
    | "deadlines"
    | "costs"
    | "financial_aid_url"
    | "media"
  > & Partial<Pick<University, "deferred">>,
  enrichment?: UniversityEnrichment,
) {
  // A lite profile (lib/profile-defer.ts) carries this count precomputed.
  const programmes =
    u.deferred?.official_programmes ??
    programListings(u, enrichment?.programmes).filter(
      (p) => p.origin === "official",
    ).length;
  const hasDirectory = enrichment?.resources.some(
    (r) => r.kind === "programmes",
  );
  const hasAdmissions = !!(
    enrichment?.admissions.length ||
    enrichment?.resources.some((r) => r.kind === "admissions") ||
    u.admissions_url ||
    u.requirements.length ||
    u.deadlines.length
  );
  const hasCosts = !!(
    enrichment?.costs.length ||
    enrichment?.resources.some((r) => r.kind === "costs") ||
    u.costs.length ||
    u.financial_aid_url
  );
  const photos = profileCampusGallery(u, enrichment).length;
  const videos = enrichment?.videos.length || 0;
  const people = enrichment?.people.length || 0;
  const stories = enrichment?.student_stories.length || 0;
  return {
    Academics: programmes
      ? `${programmes} reviewed programme${programmes === 1 ? "" : "s"}`
      : hasDirectory
        ? "Official course directory"
        : "Start with the course catalogue",
    Admissions: hasAdmissions
      ? "Admissions information available"
      : "Confirm with the admissions office",
    Costs: hasCosts
      ? "Fees & funding sources available"
      : "Check your course and residency",
    Rankings: "Publisher, edition & scope together",
    Campus:
      [
        photos ? `${photos} photo${photos === 1 ? "" : "s"}` : "",
        videos ? `${videos} university film${videos === 1 ? "" : "s"}` : "",
      ]
        .filter(Boolean)
        .join(" · ") || "Location & official visits",
    People:
      [
        people ? `${people} profile${people === 1 ? "" : "s"}` : "",
        stories ? `${stories} student stor${stories === 1 ? "y" : "ies"}` : "",
      ]
        .filter(Boolean)
        .join(" · ") || "Explore the university community",
  };
}
