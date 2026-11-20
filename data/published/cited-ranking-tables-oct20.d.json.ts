// Type declarations for the CWUR and URAP publisher tables.
type Provider = { name: string; edition: string; year: number; source_url: string; terms_url: string; attribution: string };
type Row = [string, string, number, number, string | null, string | null, string, string];
declare const data: { checked_at: string; providers: { cwur: Provider; urap: Provider }; cwur: Row[]; urap: Row[] };
export default data;
