/** The public university catalogue served from Cloudflare D1 (binding CATALOGUE),
 * built by scripts/d1/build-d1.ts from a Supabase export. It answers the reads
 * that were heavy on Supabase (home summary, explore, search, profiles) next to
 * the Worker. Every function returns null when D1 is not bound or not loaded,
 * so callers fall back to Supabase. Accounts and user data stay on Supabase. */
import type { Filters } from "@/lib/research";
import { normalizeSearch, searchRelevance } from "@/lib/search-text";

type D1Result<T> = { results: T[] };
type D1Stmt = { bind(...v: unknown[]): D1Stmt; all<T>(): Promise<D1Result<T>>; first<T>(): Promise<T | null> };
type D1 = { prepare(sql: string): D1Stmt };

async function db(): Promise<D1 | null> {
  try {
    const { env } = await import("cloudflare:workers");
    return ((env as { CATALOGUE?: D1 }).CATALOGUE as D1) ?? null;
  } catch {
    return null;
  }
}

async function unpack<T>(base64: string): Promise<T> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as T;
}

/** Full ('doc') or discovery-card ('card') rows for these ids, in the given order. */
export async function d1Universities<T>(ids: string[], kind: "doc" | "card"): Promise<T[] | null> {
  const d = await db();
  if (!d) return null;
  if (!ids.length) return [];
  try {
    const { results } = await d
      .prepare(`SELECT id, part, body FROM uni_blob WHERE kind = ? AND id IN (${ids.map(() => "?").join(",")}) ORDER BY id, part`)
      .bind(kind, ...ids)
      .all<{ id: string; part: number; body: string }>();
    const joined = new Map<string, string>();
    for (const r of results) joined.set(r.id, (joined.get(r.id) || "") + r.body);
    const out: T[] = [];
    for (const id of ids) {
      const body = joined.get(id);
      if (body) out.push(await unpack<T>(body));
    }
    return out;
  } catch {
    return null;
  }
}

export async function d1UniversityBySlug<T>(slug: string): Promise<T | null | undefined> {
  const d = await db();
  if (!d) return undefined;
  try {
    const row = await d.prepare("SELECT id FROM uni_facts WHERE slug = ?").bind(slug).first<{ id: string }>();
    if (!row) return null;
    const [doc] = (await d1Universities<T>([row.id], "doc")) ?? [];
    return doc ?? undefined;
  } catch {
    return undefined;
  }
}

/** The landing summary: twelve featured ids (QS order), totals and the scholarship list. */
export async function d1HomeSummary<S>(): Promise<{ ids: string[]; total: number; countries: number; scholarships: S[] } | null> {
  const d = await db();
  if (!d) return null;
  try {
    const [{ results: featured }, { results: meta }] = await Promise.all([
      d.prepare("SELECT id FROM uni_facts ORDER BY rank_qs IS NULL, rank_qs, name, id LIMIT 12").all<{ id: string }>(),
      d.prepare("SELECT key, value FROM catalogue_meta").all<{ key: string; value: string }>(),
    ]);
    const m = Object.fromEntries(meta.map((r) => [r.key, r.value]));
    if (!m.total) return null;
    return {
      ids: featured.map((r) => r.id),
      total: Number(m.total),
      countries: Number(m.countries),
      scholarships: await unpack<S[]>(m.scholarships),
    };
  } catch {
    return null;
  }
}

/** explore_universities: matching ids for one page of 24, totals and medians. */
export async function d1Explore(f: Filters): Promise<{ ids: string[]; total: number; medianTuition: number | null; medianAdmission: number | null; countries: number } | null> {
  const d = await db();
  if (!d) return null;
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, ...v: unknown[]) => (where.push(sql), args.push(...v));
  for (const token of normalizeSearch(f.q).split(/\s+/).filter(Boolean)) add("instr(search, ?) > 0", token);
  if (f.country) {
    const codes = f.country.split(",");
    add(`country_code IN (${codes.map(() => "?").join(",")})`, ...codes);
  }
  if (f.region) add("region = ?", f.region);
  if (f.city) add("instr(lower(city), ?) > 0", f.city.toLowerCase());
  if (f.type) add("type = ?", f.type);
  if (f.field || f.degree || f.language) {
    const field = f.field.toLowerCase();
    const alt: string[] = [];
    if (!f.degree && !f.language && field) {
      alt.push("instr(subjects, ?) > 0");
      args.push(field);
    }
    alt.push("EXISTS (SELECT 1 FROM json_each(progs) p WHERE (? = '' OR instr(p.value ->> 0, ?) > 0) AND (? = '' OR p.value ->> 1 = ?) AND (? = '' OR p.value ->> 2 = ?))");
    args.push(field, field, f.degree, f.degree, f.language, f.language);
    if (!f.language) {
      alt.push("EXISTS (SELECT 1 FROM json_each(reported) p WHERE (? = '' OR instr(p.value ->> 0, ?) > 0) AND (? = '' OR p.value ->> 1 = ?))");
      args.push(field, field, f.degree, f.degree);
    }
    where.push("(" + alt.join(" OR ") + ")");
  }
  if (f.scholarships) where.push("schol = 1");
  if (f.cost_max != null) add("tuition_usd <= ?", f.cost_max);
  if (f.admission_min != null) add("admission >= ?", f.admission_min);
  if (f.admission_max != null) add("admission <= ?", f.admission_max);
  if (f.ielts_max != null) add("ielts <= ?", f.ielts_max);
  if (f.intl_min != null) add("intl >= ?", f.intl_min);
  if (f.graduation_min != null) add("grad >= ?", f.graduation_min);
  if (f.aid) where.push("aid = 1");
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const col: Record<Filters["sort"], [string, "ASC" | "DESC"]> = {
    rank: ["rank_qs", "ASC"], rank_desc: ["rank_qs", "DESC"], rank_the: ["rank_the", "ASC"], rank_arwu: ["rank_arwu", "ASC"],
    tuition: ["tuition_usd", "ASC"], tuition_desc: ["tuition_usd", "DESC"], admission: ["admission", "ASC"], admission_desc: ["admission", "DESC"],
    international: ["intl", "DESC"], international_asc: ["intl", "ASC"],
  };
  const [c, dir] = col[f.sort];
  const order = `${c} IS NULL, ${c} ${dir}, name, id`;
  try {
    const stats = await d
      .prepare(`SELECT count(*) total, count(DISTINCT country_code) countries, count(tuition_usd) nt, count(admission) na FROM uni_facts ${w}`)
      .bind(...args)
      .first<{ total: number; countries: number; nt: number; na: number }>();
    if (!stats) return null;
    const pages = Math.max(1, Math.ceil(stats.total / 24));
    const page = Math.min(f.page, pages);
    const median = async (column: string, n: number) => {
      if (!n) return null;
      const lo = await d.prepare(`SELECT avg(v) m FROM (SELECT ${column} v FROM uni_facts ${w}${w ? " AND" : " WHERE"} ${column} IS NOT NULL ORDER BY ${column} LIMIT ? OFFSET ?)`)
        .bind(...args, n % 2 ? 1 : 2, Math.floor((n - 1) / 2))
        .first<{ m: number }>();
      return lo?.m ?? null;
    };
    const [{ results }, medianTuition, medianAdmission] = await Promise.all([
      d.prepare(`SELECT id FROM uni_facts ${w} ORDER BY ${order} LIMIT 24 OFFSET ?`).bind(...args, (page - 1) * 24).all<{ id: string }>(),
      median("tuition_usd", stats.nt),
      median("admission", stats.na),
    ]);
    return { ids: results.map((r) => r.id), total: stats.total, medianTuition, medianAdmission, countries: stats.countries };
  } catch {
    return null;
  }
}

/** search_universities: the eight best name matches. */
export async function d1Search(query: string): Promise<string[] | null> {
  const d = await db();
  if (!d) return null;
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  try {
    const { results } = await d
      .prepare(`SELECT id, name, aliases FROM uni_facts WHERE ${tokens.map(() => "instr(search, ?) > 0").join(" AND ")} ORDER BY rank_qs IS NULL, rank_qs LIMIT 200`)
      .bind(...tokens)
      .all<{ id: string; name: string; aliases: string }>();
    return results
      .map((r) => ({ id: r.id, score: searchRelevance(query, r.name, JSON.parse(r.aliases || "[]")) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.id);
  } catch {
    return null;
  }
}
