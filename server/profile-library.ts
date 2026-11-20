import programsJSON from "@/data/published/program-catalogue.json";
import dictionaryJSON from "@/data/published/program-dictionary.json";
import researchJSON from "@/data/published/openalex-current.json";
import metricsJSON from "@/data/published/reviewed-openalex-metrics.json";
import type { ResearchMetric } from "@/lib/domain";
import type { ReportedProgram, ResearchIdentity } from "@/lib/profile-library";
import { institutionLeidenMetrics } from "./leiden-metrics";
const programs = programsJSON as unknown as Record<
  string,
  [string, string, number][]
>;
const dictionary = dictionaryJSON as {
  cip: Record<string, string>;
  awards: Record<string, string>;
};
export const researchLibrary = researchJSON as unknown as Record<
  string,
  ResearchIdentity
>;
const metrics = new Map<string, ResearchMetric[]>();
for (const row of (metricsJSON as unknown as {records:ResearchMetric[]}).records) {
  const group = metrics.get(row.university_id) || [];
  group.push(row); metrics.set(row.university_id,group);
}
export function institutionResearchMetrics(id: string) {return [...(metrics.get(id) || []), ...institutionLeidenMetrics(id)];}
export function reportedPrograms(id: string): ReportedProgram[] {
  return (programs[id] || []).map(([cip, award, count]) => ({
    cip,
    name: dictionary.cip[cip] || cip,
    award: dictionary.awards[award] || award,
    level:
      (
        {
          "5": "Bachelor",
          "7": "Master",
          "17": "Doctorate",
          "18": "Doctorate",
          "19": "Doctorate",
        } as Record<string, string>
      )[award] || "Certificate / other",
    completions: count,
    year: 2025,
  }));
}
