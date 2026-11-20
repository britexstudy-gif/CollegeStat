import type { ImportedRecord, ProgramOffer, ResearchMetric, University } from "./domain";
import type { Paper } from "./profile-library";

/** The parts of a profile that are long, rarely opened and only read by the
 * Programmes, Research, Rankings and Sources views. The page ships a "lite"
 * record without them; the profile loads them when one of those views opens. */
export type HeavyProfile = {
  university_programs: ProgramOffer[];
  research_metrics: ResearchMetric[];
  papers: Paper[];
  /** Per-programme completion counts (IPEDS): the bulk of a US profile. */
  academic_records: ImportedRecord[];
};

/** Views that read the deferred lists (see pages-ui/university.tsx). */
export function viewNeedsHeavyProfile(tab: string, view: string): boolean {
  return (
    tab === "Rankings" ||
    tab === "Sources" ||
    (tab === "Academics" && (view === "programs" || view === "research"))
  );
}

/** Put the deferred lists back; the result is the record the page used to receive. */
export function mergeHeavyProfile(lite: University, heavy: HeavyProfile): University {
  const { deferred: _deferred, ...rest } = lite;
  void _deferred;
  return {
    ...rest,
    university_programs: heavy.university_programs,
    research_metrics: heavy.research_metrics,
    imported_records: heavy.academic_records?.length
      ? [...(rest.imported_records ?? []), ...heavy.academic_records]
      : rest.imported_records,
    research_identity: rest.research_identity
      ? { ...rest.research_identity, papers: heavy.papers }
      : rest.research_identity,
  };
}
