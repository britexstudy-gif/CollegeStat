// Type declarations for cited CWUR/URAP positions keyed by university id.
type Provider = { name: string; edition: string; year: number; source_url: string; terms_url: string; attribution: string };
declare const data: {
  checked_at: string;
  note: string;
  providers: { cwur: Provider; urap: Provider };
  stats: Record<string, { rows: number; matched: number; dup_skipped: number }>;
  records: Record<string, [string, string, number | null, string | null, string | null, string | null][]>;
};
export default data;
