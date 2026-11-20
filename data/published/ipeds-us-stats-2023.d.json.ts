// Type declarations for the NCES IPEDS 2023 US statistics snapshot.
import type { USStats } from "@/lib/domain";
declare const data: {
  source: { name: string; url: string; academic_year: string; retrieved_at: string; notes: string[] };
  records: Record<string, USStats>;
};
export default data;
