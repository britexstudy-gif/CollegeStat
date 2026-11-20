// AI-assisted review hook (opt-in: `npm run data:merge -- --ai-review`).
// Prepares a compact batch an LLM worker can adjudicate later. No API is called here.
// The worker writes its answers to data/curated/review-answers.json (same ids); a later merge can
// apply them through data/curated/overrides.json.
import { createHash } from "node:crypto";
import type { ConflictEntry, CandidateSummary } from "./resolve";

const compact = (c: CandidateSummary) => ({
  value: c.value, source_url: c.source_url, method: c.method, collector: c.collector, retrieved_at: c.retrieved_at, academic_year: c.academic_year,
});

export function buildReviewBatch(conflicts: (ConflictEntry & { university_id: string; name: string })[], opts: { includeResolved?: boolean; limit?: number } = {}) {
  const items = conflicts
    .filter((c) => opts.includeResolved || c.status === "tie")
    .slice(0, opts.limit ?? 500)
    .map((c) => ({
      id: createHash("sha1").update(`${c.university_id}|${c.field}|${JSON.stringify(c.chosen.value)}|${JSON.stringify(c.other.value)}`).digest("hex").slice(0, 16),
      university: c.name, university_id: c.university_id, field: c.field, status: c.status, rule: c.rule,
      candidates: [compact(c.chosen), compact(c.other)],
    }));
  return {
    instructions: "For each item, open the candidate source_url pages (official pages only; skip on 403/captcha) and decide which value is correct for international first-year bachelor's applicants, 2027 entry. Answer with {id, pick: 0|1|'both'|'neither', corrected_value?, source_url, retrieved_at (YYYY-MM-DD), reason (one sentence)}. Never guess: if the pages do not settle it, answer 'neither' with the reason.",
    answer_file: "data/curated/review-answers.json",
    count: items.length,
    items,
  };
}
