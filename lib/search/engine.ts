/** Search over the static index: name and alias matching (typo- and
 * script-tolerant), programme matching and hard filters from the parsed query.
 * Ranking: exact name > alias > programme match > filter-only, with a boost for
 * the 204 target universities. Pure: the same code runs in the Worker
 * (app/api/search) and in tests. */
import { regionForCountry } from "@/lib/regions";
import { FIELDS, STOPWORDS } from "./lexicon";
import { parseSearchQuery, cycleMonth, type ParsedQuery, type SearchFilter } from "./parse";
import { distance, phonetic, typoBudget, words } from "./text";
import {
  slugOfRow,
  type IndexUni,
  type SearchArticle,
  type SearchMeta,
  type SearchResponse,
  type SearchScholarship,
  type SearchUniversity,
  type WhyChip,
} from "./types";

type Postings = Map<string, number[]>;
export type SearchEngine = {
  meta: SearchMeta;
  rows: IndexUni[];
  /** Per row: phonetic keys of the name, and of each alias. */
  nameKeys: string[][];
  aliasKeys: string[][][];
  /** Folded name / alias phrases, for exact-phrase hits. */
  namePhrase: string[];
  aliasPhrase: string[][];
  vocab: Postings;
  vocabKeys: string[];
  progVocab: Postings;
  progVocabKeys: string[];
  progRows: Map<number, number[]>;
  scholarshipKeys: string[][];
  articleKeys: string[][];
};

const keysOf = (text: string) => words(text).filter((w) => !STOPWORDS.has(w)).map(phonetic);
const phraseOf = (text: string) => words(text).join(" ");
const add = (map: Postings, key: string, row: number) => {
  const list = map.get(key);
  if (!list) map.set(key, [row]);
  else if (list[list.length - 1] !== row) list.push(row);
};

/** Builds the in-memory lookup tables once per isolate (~100 ms for 14k rows). */
export function prepareEngine(meta: SearchMeta, rows: IndexUni[]): SearchEngine {
  const vocab: Postings = new Map();
  const nameKeys: string[][] = [];
  const aliasKeys: string[][][] = [];
  const namePhrase: string[] = [];
  const aliasPhrase: string[][] = [];
  const progRows = new Map<number, number[]>();
  rows.forEach((row, i) => {
    const nk = keysOf(row.n);
    nameKeys.push(nk);
    namePhrase.push(phraseOf(row.n));
    const ak = (row.a ?? []).map(keysOf);
    aliasKeys.push(ak);
    aliasPhrase.push((row.a ?? []).map(phraseOf));
    for (const k of nk) add(vocab, k, i);
    for (const list of ak) for (const k of list) add(vocab, k, i);
    for (const p of [...(row.p ?? []), ...(row.su ?? [])]) {
      const list = progRows.get(p);
      if (list) list.push(i);
      else progRows.set(p, [i]);
    }
  });
  const progVocab: Postings = new Map();
  meta.programmes.forEach((name, id) => {
    for (const k of keysOf(name)) add(progVocab, k, id);
  });
  return {
    meta,
    rows,
    nameKeys,
    aliasKeys,
    namePhrase,
    aliasPhrase,
    vocab,
    vocabKeys: [...vocab.keys()].sort(),
    progVocab,
    progVocabKeys: [...progVocab.keys()].sort(),
    progRows,
    scholarshipKeys: meta.scholarships.map((s) => keysOf([s.n, s.pr].filter(Boolean).join(" "))),
    articleKeys: meta.articles.map((a) => keysOf(a.t + " " + (a.sm ?? ""))),
  };
}

/** Keys in `sorted` matching one query key: exact (1), prefix (0.85) or a typo (0.75 / 0.6). */
function lookup(sorted: string[], postings: Postings, key: string, prefix: boolean): Map<string, number> {
  const out = new Map<string, number>();
  if (postings.has(key)) out.set(key, 1);
  if (prefix && key.length >= 3) {
    let lo = 0,
      hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < key) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < sorted.length && sorted[i].startsWith(key) && out.size < 400; i++) if (!out.has(sorted[i])) out.set(sorted[i], 0.85);
  }
  const budget = typoBudget(key.length);
  if (budget && !/^\d+$/.test(key))
    for (const k of sorted) {
      if (out.has(k) || Math.abs(k.length - key.length) > budget || k[0] !== key[0] && budget < 2) continue;
      const d = distance(key, k, budget);
      if (d <= budget) out.set(k, d === 1 ? 0.75 : 0.6);
    }
  return out;
}

const queryKeys = (terms: string[]) => terms.flatMap((t) => words(t)).filter((w) => !STOPWORDS.has(w)).map(phonetic).filter(Boolean);

type Hit = { quality: number; alias: boolean; coverage: number };

/** Rows whose name (or one alias) holds every query key. */
function nameHits(e: SearchEngine, keys: string[], fuzzy: boolean): Map<number, Hit> {
  const result = new Map<number, Hit>();
  if (!keys.length) return result;
  const matches = keys.map((k, i) => (fuzzy ? lookup(e.vocabKeys, e.vocab, k, i === keys.length - 1 || k.length >= 4) : new Map(e.vocab.has(k) ? [[k, 1]] : [])));
  if (matches.some((m) => !m.size)) return result;
  // Candidate rows from the rarest key.
  const order = matches.map((m, i) => ({ i, size: [...m.keys()].reduce((a, k) => a + (e.vocab.get(k)?.length ?? 0), 0) })).sort((a, b) => a.size - b.size);
  const candidates = new Set<number>();
  for (const k of matches[order[0].i].keys()) for (const r of e.vocab.get(k) ?? []) candidates.add(r);
  for (const r of candidates) {
    const lists: { keys: string[]; alias: boolean }[] = [{ keys: e.nameKeys[r], alias: false }, ...e.aliasKeys[r].map((k) => ({ keys: k, alias: true }))];
    let best: Hit | null = null;
    for (const list of lists) {
      let total = 0;
      let ok = true;
      for (const m of matches) {
        let q = 0;
        for (const k of list.keys) q = Math.max(q, m.get(k) ?? 0);
        if (!q) {
          ok = false;
          break;
        }
        total += q;
      }
      if (!ok) continue;
      const hit = { quality: total / matches.length, alias: list.alias, coverage: Math.min(1, keys.length / Math.max(1, list.keys.length)) };
      if (!best || hit.quality + hit.coverage * 0.3 - (hit.alias ? 0.05 : 0) > best.quality + best.coverage * 0.3 - (best.alias ? 0.05 : 0)) best = hit;
    }
    if (best) result.set(r, best);
  }
  return result;
}

/** Programme ids whose name holds every key. */
function programmeHits(e: SearchEngine, keys: string[]): Set<number> {
  let ids: Set<number> | null = null;
  for (const [i, k] of keys.entries()) {
    const m = lookup(e.progVocabKeys, e.progVocab, k, i === keys.length - 1 || k.length >= 4);
    const next = new Set<number>();
    for (const key of m.keys()) for (const id of e.progVocab.get(key) ?? []) if (!ids || ids.has(id)) next.add(id);
    ids = next;
    if (!ids.size) break;
  }
  return ids ?? new Set();
}

const anyKeyMatches = (e: SearchEngine, key: string) =>
  lookup(e.vocabKeys, e.vocab, key, true).size > 0 ||
  lookup(e.progVocabKeys, e.progVocab, key, true).size > 0 ||
  [...e.scholarshipKeys, ...e.articleKeys].some((list) => allKeysIn([key], list));

type Options = { limit?: number; offset?: number; today?: string; scholarships?: number; articles?: number };

function filterPredicate(e: SearchEngine, filters: SearchFilter[], today: string) {
  const checks: ((r: IndexUni) => boolean)[] = [];
  const countries = new Set(filters.flatMap((f) => (f.kind === "country" ? [f.code] : [])));
  const regions = new Set(filters.flatMap((f) => (f.kind === "region" ? [f.region] : [])));
  if (countries.size || regions.size) checks.push((r) => countries.has(r.c) || regions.has(regionForCountry(r.c) ?? ""));
  const fieldBits = filters.flatMap((f) => (f.kind === "field" ? [1 << FIELDS.findIndex((x) => x.id === f.field)] : []));
  if (fieldBits.length) checks.push((r) => fieldBits.some((b) => ((r.f ?? 0) & b) !== 0));
  for (const f of filters) {
    if (f.kind === "budget") {
      const max = f.max * (e.meta.fx[f.currency] ?? 1);
      checks.push((r) => r.fr === 1 || (r.t != null && r.t <= max));
    } else if (f.kind === "free") checks.push((r) => r.fr === 1);
    else if (f.kind === "ielts") checks.push((r) => r.ien === 1 || (r.ie != null && r.ie <= f.score));
    else if (f.kind === "toefl") checks.push((r) => r.ien === 1 || (r.to != null && r.to <= f.score));
    else if (f.kind === "noIelts") checks.push((r) => r.ien === 1);
    else if (f.kind === "noSat") checks.push((r) => r.sat === "opt" || r.sat === "no");
    else if (f.kind === "platform") checks.push((r) => (r.pl ?? "direct") === f.platform);
    else if (f.kind === "rank") checks.push((r) => r.r != null && r.r <= f.max);
    else if (f.kind === "deadline") {
      const ok = deadlineTest(f);
      checks.push((r) => !!r.dl?.some((d) => d >= today && ok(d)));
    }
  }
  return (r: IndexUni) => checks.every((c) => c(r));
}

/** Does an ISO date satisfy a deadline filter ("before January", "by 15 January", "in March")? */
export function deadlineTest(f: Extract<SearchFilter, { kind: "deadline" }>): (iso: string) => boolean {
  const { year, month } = cycleMonth(f.month);
  const mm = String(month).padStart(2, "0");
  if (f.mode === "in") {
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return (d) => d >= `${year}-${mm}-01` && d < end;
  }
  const cutoff = `${year}-${mm}-${f.day ? String(f.day).padStart(2, "0") : "01"}`;
  return f.day ? (d) => d <= cutoff : (d) => d < cutoff;
}

function rankBonus(r: IndexUni) {
  return r.r ? Math.max(0, 30 - Math.log2(r.r) * 3) : 0;
}

function whyChips(e: SearchEngine, r: IndexUni, filters: SearchFilter[], progIds: Set<number> | null, today: string, deadlineOk?: (d: string) => boolean): WhyChip[] {
  const chips: WhyChip[] = [];
  const has = (k: SearchFilter["kind"]) => filters.some((f) => f.kind === k);
  const fieldRes = filters.flatMap((f) => (f.kind === "field" ? [FIELDS.find((x) => x.id === f.field)!.match] : []));
  const wants = (id: number) => (progIds ? progIds.has(id) : false) || fieldRes.some((re) => re.test(e.meta.programmes[id]));
  if (progIds || fieldRes.length) {
    const pick = best(e, [...(r.p ?? []).map((id) => ({ id, subject: false })), ...(r.su ?? []).map((id) => ({ id, subject: true }))], wants, fieldRes);
    if (pick) chips.push({ kind: pick.subject ? "subject" : "programme", text: e.meta.programmes[pick.id] });
  }
  if (r.fr) chips.push({ kind: "free" });
  else if (r.t != null) chips.push({ kind: "tuition", usd: r.t });
  if (r.ie != null) chips.push({ kind: "ielts", value: r.ie });
  else if (r.ien && (has("ielts") || has("noIelts") || has("toefl"))) chips.push({ kind: "ieltsNo" });
  if (has("noSat") && (r.sat === "opt" || r.sat === "no")) chips.push({ kind: "sat", policy: r.sat });
  if (has("platform") && r.pl) chips.push({ kind: "platform", id: r.pl });
  if (has("scholarship") && r.sc?.length) chips.push({ kind: "scholarships", count: r.sc.length });
  const next = r.dl?.find((d) => d >= today && (!deadlineOk || deadlineOk(d)));
  if (next && (has("deadline") || chips.length < 3)) chips.push({ kind: "deadline", date: next });
  if (r.rl && (has("rank") || chips.length < 2)) chips.push({ kind: "rank", label: r.rl });
  return chips.slice(0, 4);
}

/** The programme that names the wanted field most directly: earliest match,
 * a programme before a subject area, then the shortest name. */
function best(e: SearchEngine, ids: { id: number; subject: boolean }[], wants: (id: number) => boolean, res: RegExp[]) {
  let pick: { id: number; subject: boolean; rank: number; len: number } | undefined;
  for (const c of ids) {
    if (!wants(c.id)) continue;
    const name = e.meta.programmes[c.id];
    const at = res.length ? Math.min(99, ...res.map((re) => name.search(re)).filter((x) => x >= 0)) : 0;
    const rank = at + (c.subject ? 0.5 : 0);
    if (!pick || rank < pick.rank || (rank === pick.rank && name.length < pick.len)) pick = { ...c, rank, len: name.length };
  }
  return pick;
}

function toResult(r: IndexUni, match: SearchUniversity["match"], why: WhyChip[]): SearchUniversity {
  return {
    id: r.i,
    slug: slugOfRow(r),
    name: r.n,
    short_name: r.a?.find((a) => a.length <= 8 && /^[A-Z][A-Za-z&-]+$/.test(a)) ?? null,
    country_code: r.c,
    city: r.y ?? null,
    website: r.w ? "https://" + r.w : null,
    logo_url: r.l ?? null,
    website_icon_url: r.li ?? null,
    brand_color: r.b ?? null,
    match,
    target: r.g === 1,
    why,
  };
}

/** Runs one query. `query` may be a string or an already parsed query. */
export function runSearch(e: SearchEngine, query: string | ParsedQuery, options: Options = {}): Omit<SearchResponse, "tookMs"> {
  const parsed = typeof query === "string" ? parseSearchQuery(query) : query;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const filters = parsed.filters;
  const passes = filterPredicate(e, filters, today);
  const dlFilter = filters.find((f): f is Extract<SearchFilter, { kind: "deadline" }> => f.kind === "deadline");
  const deadlineOk = dlFilter ? deadlineTest(dlFilter) : undefined;

  // Residual words: drop the ones that match nothing at all ("good", "please").
  let keys = queryKeys(parsed.terms);
  const ignored: string[] = [];
  keys = keys.filter((k, i) => {
    if (anyKeyMatches(e, k)) return true;
    ignored.push(parsed.terms[i] ?? k);
    return false;
  });

  const scored = new Map<number, { score: number; match: SearchUniversity["match"]; prog: boolean }>();
  const put = (i: number, score: number, match: SearchUniversity["match"], prog = false) => {
    const prev = scored.get(i);
    if (!prev || prev.score < score) scored.set(i, { score, match, prog: prog || !!prev?.prog });
  };
  const bonus = (r: IndexUni) => (r.g ? 40 : 0) + rankBonus(r);

  // 1. The whole query as a university name ("Korea University", "American University of Central Asia").
  if (filters.length) {
    const all = queryKeys(parsed.allTerms);
    for (const [i, hit] of nameHits(e, all, false)) if (hit.coverage >= 0.6) put(i, 1000 + hit.coverage * 100 + bonus(e.rows[i]), hit.alias ? "alias" : "name");
  }

  // 2. Name and alias matches of the residual words, inside the filters.
  let progIds: Set<number> | null = null;
  if (keys.length) {
    const phrase = keys.join(" ");
    for (const [i, hit] of nameHits(e, keys, true)) {
      const r = e.rows[i];
      if (!passes(r)) continue;
      const exact = e.nameKeys[i].join(" ") === phrase;
      const aliasExact = e.aliasKeys[i].some((a) => a.join(" ") === phrase);
      const base = exact ? 900 : aliasExact ? 880 : hit.alias ? 400 : 500;
      put(i, base + hit.quality * 100 + hit.coverage * 60 + bonus(r), hit.alias || aliasExact ? (exact ? "name" : "alias") : "name");
    }
    // 3. Programme names ("aerospace", "computer science" when not a lexicon word).
    progIds = programmeHits(e, keys);
    if (progIds.size)
      for (const id of progIds)
        for (const i of e.progRows.get(id) ?? []) {
          const r = e.rows[i];
          if (!passes(r)) continue;
          const own = r.p?.includes(id) ? 30 : 0;
          put(i, 300 + own + bonus(r), "programme", true);
        }
    if (!progIds.size) progIds = null;
  } else if (filters.length) {
    // 4. Filters only: every university that passes.
    const fieldFilter = filters.some((f) => f.kind === "field");
    e.rows.forEach((r, i) => {
      if (!passes(r)) return;
      put(i, 100 + bonus(r) + (fieldFilter && r.p?.length ? 10 : 0), "filter");
    });
  }

  // Soft preferences: cheaper first, linked scholarships first.
  const cheap = filters.some((f) => f.kind === "cheap" || f.kind === "budget" || f.kind === "free");
  const scholarship = filters.some((f) => f.kind === "scholarship");
  const ordered = [...scored.entries()]
    .map(([i, s]) => {
      const r = e.rows[i];
      let score = s.score;
      if (cheap && r.t != null) score += Math.max(0, 40 - r.t / 1000);
      if (scholarship && r.sc?.length) score += 60;
      return { i, score, match: s.match, data: 2 * Number(r.t != null) + Number(r.ie != null) + Number(!!r.dl) };
    })
    .sort((a, b) => b.score - a.score || b.data - a.data || e.rows[a.i].n.localeCompare(e.rows[b.i].n));

  const universities = ordered
    .slice(offset, offset + limit)
    .map(({ i, match }) => toResult(e.rows[i], match, whyChips(e, e.rows[i], filters, match === "programme" ? progIds : null, today, deadlineOk)));

  return {
    q: parsed.raw,
    filters,
    ignored,
    universities,
    total: ordered.length,
    scholarships: searchScholarships(e, parsed, keys, options.scholarships ?? 4),
    articles: searchArticles(e, parsed, keys, options.articles ?? 3),
  };
}

const allKeysIn = (wanted: string[], have: string[]) =>
  wanted.every((k) => have.some((h) => h === k || (k.length >= 3 && h.startsWith(k)) || (k.length >= 5 && distance(k, h, 1) <= 1)));

function searchScholarships(e: SearchEngine, parsed: ParsedQuery, keys: string[], limit: number): SearchScholarship[] {
  if (!limit) return [];
  const countries = new Set(parsed.filters.flatMap((f) => (f.kind === "country" ? [f.code] : [])));
  const regions = new Set(parsed.filters.flatMap((f) => (f.kind === "region" ? [f.region] : [])));
  const intent = parsed.filters.some((f) => f.kind === "scholarship");
  if (!keys.length && !intent) return [];
  return e.meta.scholarships
    .map((s, i) => {
      if ((countries.size || regions.size) && !(s.c && (countries.has(s.c) || regions.has(regionForCountry(s.c) ?? "")))) return null;
      if (keys.length && !allKeysIn(keys, e.scholarshipKeys[i])) return null;
      return { s, score: (s.u ? 2 : 0) + (s.ca ? 1 : 0) + (s.k === "full" ? 1 : 0) };
    })
    .filter((x): x is { s: (typeof e.meta.scholarships)[number]; score: number } => !!x)
    .sort((a, b) => b.score - a.score || a.s.n.localeCompare(b.s.n))
    .slice(0, limit)
    .map(({ s }) => ({ slug: s.s, name: s.n, provider: s.pr ?? null, country_code: s.c ?? null, headline: s.h ?? null, deadline: s.d ?? null, kind: s.k ?? null }));
}

function searchArticles(e: SearchEngine, parsed: ParsedQuery, keys: string[], limit: number): SearchArticle[] {
  if (!limit || !keys.length) return [];
  return e.meta.articles
    .filter((_, i) => allKeysIn(keys, e.articleKeys[i]))
    .slice(0, limit)
    .map((a) => ({ slug: a.s, title: a.t, summary: a.sm ?? null }));
}
