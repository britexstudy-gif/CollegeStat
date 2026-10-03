import programsJSON from "@/data/published/program-catalogue.json";
import dictionaryJSON from "@/data/published/program-dictionary.json";
import researchJSON from "@/data/published/openalex-current.json";
import type { ReportedProgram, ResearchIdentity } from "@/lib/profile-library";
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
