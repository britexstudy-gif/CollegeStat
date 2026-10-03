export type ReportedProgram = {
  cip: string;
  name: string;
  award: string;
  level: string;
  completions: number;
  year: number;
};
export type Paper = {
  id: string;
  title: string;
  doi: string | null;
  date: string;
  type: string;
  authors: string[];
  venue: string | null;
  url: string;
  open_access_url: string | null;
  citations: number;
};
export type ResearchIdentity = {
  openalex_id: string;
  source_url: string;
  ror: string;
  name: string;
  logo_url: string | null;
  works_count: number;
  cited_by_count: number;
  retrieved_at: string;
  papers: Paper[];
  recent_works_count?: number;
  papers_source_url?: string;
  papers_checked_at?: string;
  papers_from_date?: string;
  papers_to_date?: string;
};

/** Collapse duplicate identifiers, retaining the most-cited version of a record. */
export function uniquePapers(papers: Paper[]): Paper[] {
  const rows = new Map<string, Paper>();
  for (const p of papers) {
    const key = p.doi ? p.doi.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").trim() : p.id;
    const existing = rows.get(key);
    if (!existing || p.citations > existing.citations) rows.set(key, p);
  }
  return [...rows.values()];
}
