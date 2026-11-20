// Type declarations for the Common App member profiles snapshot.
import type { CommonAppProfile } from "@/lib/domain";
declare const data: {
  source: Record<string, unknown>;
  records: Record<string, CommonAppProfile>;
};
export default data;
