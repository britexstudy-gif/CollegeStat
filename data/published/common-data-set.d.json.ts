// Type declarations for the Common Data Set extracts snapshot.
import type { CommonDataSet } from "@/lib/domain";
declare const data: {
  source: Record<string, unknown>;
  records: Record<string, CommonDataSet>;
};
export default data;
