// Stable source-observation shape prevents compiler work scaling with snapshot rows.
import type { ImportedRecord } from "@/lib/domain";
declare const snapshot: {
  generated_at: string;
  identities: Record<string, {
    id: string;
    ror: string;
    openalex: string;
    wikidata: string | null;
    unitid: string | null;
    opeid?: string | null;
    aliases: string[];
  }>;
  records: (ImportedRecord & { university_id: string })[];
  summary: Record<string, {
    imported_records: number;
    imported_universities: number;
    published_records?: number;
    held_mapping_corrections?: number;
    fields_populated: string[];
    license_note: string;
  }>;
};
export default snapshot;
