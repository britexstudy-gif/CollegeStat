// Type declarations for the College Scorecard snapshot.
import type { ScorecardFacts } from "@/lib/domain";
declare const data: {
  source: Record<string, unknown>;
  records: Record<string, ScorecardFacts>;
};
export default data;
