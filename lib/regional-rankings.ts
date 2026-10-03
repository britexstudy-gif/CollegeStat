import records from "@/data/published/regional-rankings.json";
import type { University } from "./domain";
export function regionalRanksForUniversity(u: Pick<University, "website">) {
  try {
    const host = new URL(u.website || "").hostname;
    return records.filter(
      (r) => host === r.domain || host.endsWith("." + r.domain),
    );
  } catch {
    return [];
  }
}
export function regionalRankLabel(label: string) {
  return /^=|[-–+]/.test(label) ? label : "#" + label;
}
