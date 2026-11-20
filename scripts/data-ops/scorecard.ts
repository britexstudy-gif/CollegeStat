// College Scorecard (US federal, 2025/26) + pre-refresh US history adapters, and the
// institution status table (closed / degree level) used by the exclusion rules.
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { num, path, readJson, str, writeText } from "../ingest/lib";
import type { Adapter, AdapterContext } from "./adapters";
import { observe } from "./adapters";
import type { Observation } from "./model";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SCORECARD_URL = "https://collegescorecard.ed.gov/data/";
const latestFile = (dir: string, re: RegExp) => (existsSync(path(dir)) ? readdirSync(path(dir)).filter((f) => re.test(f)).sort().pop() : undefined);

const usd = (v: unknown) => (num(v) == null ? null : { amount: num(v), currency: "USD", usd: Math.round(num(v)!), text: null });

/** Scorecard record (data/review/scorecard-YYYY-MM.json) → observations. */
export function scorecardObservations(r: Any, file: string, retrievedFallback: string | null): Observation[] {
  const out: Observation[] = [];
  const b = { university_id: str(r.id), name: r.name, country_code: "US", collector: "scorecard", input: file, verified: true, defaultMethod: "dataset" as const };
  const src = { source_url: SCORECARD_URL, retrieved_at: r.retrieved_at ?? retrievedFallback, method: "dataset", note: str(r.source) };
  const ay = str(r.academic_year);
  const add = (o: Observation | null) => { if (o) out.push(o); };
  const opt = { academic_year: ay };
  const outState = num(r.tuition_fees_out_of_state);
  // International students pay the out-of-state (non-resident) rate at public universities.
  if (outState != null) add(observe(b, "tuition", { amount: outState, range_min: null, range_max: null, currency: "USD", period: "year", usd: Math.round(outState), fx: null,
    basis: "Scorecard TUITIONFEE_OUT: tuition and required fees, out-of-state" + (num(r.tuition_fees_in_state) != null ? `; in-state ${num(r.tuition_fees_in_state)}` : "") }, src, opt));
  if (num(r.acceptance_rate) != null) add(observe(b, "acceptance_rate", { percent: num(r.acceptance_rate)!, year: Number(ay?.slice(0, 4)) || null }, src, opt));
  const sat = { reading_25: num(r.sat_reading_25), reading_75: num(r.sat_reading_75), math_25: num(r.sat_math_25), math_75: num(r.sat_math_75), average: num(r.sat_avg) };
  if (Object.values(sat).some((v) => v != null)) add(observe(b, "sat_scores", sat, src, opt));
  if (num(r.act_25) != null || num(r.act_75) != null) add(observe(b, "act_scores", { p25: num(r.act_25), p75: num(r.act_75) }, src, opt));
  add(observe(b, "cost_of_attendance", usd(r.cost_of_attendance), src, opt));
  add(observe(b, "net_price", usd(r.net_price_private ?? r.net_price_public ?? r.net_price), src, opt));
  if (num(r.undergrads) != null) add(observe(b, "undergrads", { value: num(r.undergrads)!, year: Number(ay?.slice(0, 4)) || null }, src, opt));
  if (num(r.international_share) != null) add(observe(b, "international_share", num(r.international_share)!, src, opt));
  if (num(r.grad_rate) != null) add(observe(b, "grad_rate", num(r.grad_rate)!, src, opt));
  add(observe(b, "median_earnings_10y", usd(r.median_earnings_10y), src, opt));
  if (Array.isArray(r.bachelor_fields) && r.bachelor_fields.length) add(observe(b, "bachelor_fields", r.bachelor_fields.filter((x: unknown) => typeof x === "string"), src, opt));
  return out;
}

export const scorecard: Adapter = {
  name: "scorecard",
  inputs: () => { const f = latestFile("data/review", /^scorecard-\d{4}-\d{2}\.json$/); return f ? [`data/review/${f}`] : []; },
  read(ctx: AdapterContext) {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const d = readJson<{ generated?: string; records: Any[] }>(file);
      for (const r of d.records) if (!ctx.scope || ctx.scope.has(r.id)) out.push(...scorecardObservations(r, file, d.generated ?? null));
    }
    return out;
  },
};

/** Pre-refresh US values (IPEDS 2023/24 and earlier) — history for trends. */
export function usHistoryObservations(r: Any, file: string, retrieved: string | null): Observation[] {
  const v = r.values ?? {};
  const out: Observation[] = [];
  const b = { university_id: str(r.id), name: r.name, country_code: "US", collector: "ipeds-pre-2026-11", input: file, verified: true, defaultMethod: "dataset" as const };
  const opt = { academic_year: "2023/24", flags: ["history-import"] };
  const cost = { source_url: "https://nces.ed.gov/ipeds/datacenter/data/IC2023_AY.zip", retrieved_at: retrieved, method: "dataset", note: str(r.note) };
  const adm = { ...cost, source_url: "https://nces.ed.gov/ipeds/datacenter/data/ADM2023.zip" };
  const add = (o: Observation | null) => { if (o) out.push(o); };
  if (num(v.tuition_out_of_state) != null) add(observe(b, "tuition", { amount: num(v.tuition_out_of_state), range_min: null, range_max: null, currency: "USD", period: "year", usd: Math.round(num(v.tuition_out_of_state)!), fx: null,
    basis: "IPEDS tuition, out-of-state (before the 2026-11 Scorecard refresh)" }, cost, opt));
  if (num(v.acceptance_rate) != null) add(observe(b, "acceptance_rate", { percent: num(v.acceptance_rate)!, year: 2023 }, adm, opt));
  const sat = { reading_25: num(v.sat_reading_25), reading_75: num(v.sat_reading_75), math_25: num(v.sat_math_25), math_75: num(v.sat_math_75), average: null };
  if (Object.values(sat).some((x) => x != null)) add(observe(b, "sat_scores", sat, adm, opt));
  if (num(v.act_25) != null || num(v.act_75) != null) add(observe(b, "act_scores", { p25: num(v.act_25), p75: num(v.act_75) }, adm, opt));
  return out;
}
export const usHistory: Adapter = {
  name: "us-history",
  inputs: () => { const f = latestFile("data/review", /^us-history-.*\.json$/); return f ? [`data/review/${f}`] : []; },
  read(ctx: AdapterContext) {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const d = readJson<{ generated?: string; records: Any[] }>(file);
      for (const r of d.records) if (!ctx.scope || ctx.scope.has(r.id)) out.push(...usHistoryObservations(r, file, d.generated ?? null));
    }
    return out;
  },
};

// ── Institution status (CURROPER / PREDDEG / HIGHDEG) from the raw Scorecard CSV ──
export interface InstStatus { unitid: string; name: string; curroper: number | null; preddeg: number | null; highdeg: number | null; control: number | null; url: string | null }
const STATUS_CACHE = "data/curated/scorecard-status.json";
const RAW_DIR = "data/raw/scorecard-2026-11";

/** Splits one CSV line (RFC 4180 quotes; Scorecard rows have no embedded newlines). */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { cells.push(cur); cur = ""; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
}

/** Reads the raw institution CSV when present (and caches the slim table); otherwise the cache. */
export async function loadInstitutionStatus(): Promise<Map<string, InstStatus>> {
  const dir = existsSync(path(RAW_DIR)) ? RAW_DIR : null;
  const csv = dir && readdirSync(path(dir)).find((f) => /Most-Recent-Cohorts-Institution.*\.csv$/.test(f));
  const map = new Map<string, InstStatus>();
  if (csv) {
    const rl = createInterface({ input: createReadStream(path(`${dir}/${csv}`), "utf8"), crlfDelay: Infinity });
    let idx: Record<string, number> | null = null;
    for await (const raw of rl) {
      const line = raw.replace(/^﻿/, "");
      const cells = splitCsvLine(line);
      if (!idx) { idx = Object.fromEntries(cells.map((c, i) => [c, i])); continue; }
      const n = (k: string) => { const v = cells[idx![k]]; return v == null || v === "" || v === "NULL" ? null : Number(v); };
      map.set(cells[idx.UNITID], { unitid: cells[idx.UNITID], name: cells[idx.INSTNM], curroper: n("CURROPER"), preddeg: n("PREDDEG"), highdeg: n("HIGHDEG"), control: n("CONTROL"), url: str(cells[idx.INSTURL]) });
    }
    writeText(STATUS_CACHE, JSON.stringify({ source: `${RAW_DIR}/${csv}`, columns: "CURROPER, PREDDEG, HIGHDEG, CONTROL, INSTURL", rows: [...map.values()].sort((a, b) => (a.unitid < b.unitid ? -1 : 1)) }) + "\n");
  } else if (existsSync(path(STATUS_CACHE))) {
    for (const r of readJson<{ rows: InstStatus[] }>(STATUS_CACHE).rows) map.set(r.unitid, r);
  }
  return map;
}

/** Exclusion reason for a US institution, or null. HIGHDEG 0 non-degree, 1 certificate, 2 associate. */
export function statusExclusion(s: InstStatus | undefined): string | null {
  if (!s) return null;
  if (s.curroper === 0) return "closed";
  if (s.highdeg != null && (s.highdeg === 1 || s.highdeg === 2 || (s.highdeg === 0 && (s.preddeg ?? 0) <= 2))) return "no-bachelors";
  return null;
}
