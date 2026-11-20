// Build a PROMPT.md-shape record from model JSON + pages. Pure (tested).
import { isLatestYear } from "./extract";
import type { Page } from "./crawl";

const nn = (v: unknown) => (v == null || v === "" ? null : v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);

export function buildRecord(u: { id: string; slug: string; name: string; country_code: string }, pages: Page[], m: any, today: string, extraNotes: string[] = []) {
  const src = (tag: unknown): string | null => {
    const i = typeof tag === "string" ? /P(\d+)/.exec(tag) : null;
    const p = i ? pages[Number(i[1]) - 1] : undefined;
    return p && p.status === 200 ? p.url : null;
  };
  const notes = [...extraNotes];
  const stamp = (url: string | null) => ({ source_url: url, retrieved_at: today, method: "fetched" as const });
  const rec: any = { id: u.id, slug: u.slug, name: u.name, country_code: u.country_code, collector: "deepseek-ds-collect" };

  const t = m?.tuition;
  let tu: any = { amount: null, currency: null, note: "not found on fetched official pages", ...stamp(null) };
  if (t && num(t.amount) != null && t.currency && src(t.src)) {
    let amount = num(t.amount)!, note = nn(t.note) as string | null;
    const ay = nn(t.academic_year) as string | null;
    if (!isLatestYear(ay)) { tu = { amount: null, currency: null, academic_year: ay, note: `only older data (${ay}) found - not used`, ...stamp(src(t.src)) }; }
    else {
      if (t.period === "semester") { amount *= 2; note = `${note ? note + "; " : ""}annual = 2 x semester fee (computed)`; }
      if (t.period === "credit") tu = { amount: null, currency: null, academic_year: ay, note: "per-credit fee only; annual not computable", ...stamp(src(t.src)) };
      else tu = { amount, currency: String(t.currency).toUpperCase(), academic_year: ay, usd: null, fx_rate_usd_per_unit: null, fx_date: null, mandatory_fees: null, living_cost: null, note, ...stamp(src(t.src)) };
    }
  }
  rec.tuition = tu;

  const dl = (Array.isArray(m?.deadlines) ? m.deadlines : []).filter((d: any) => d?.round && src(d.src)).slice(0, 4);
  const dlSrc = dl.length ? src(dl[0].src) : null;
  rec.deadlines = dl.length ? { value: dl.map((d: any) => ({ round: d.round, date: nn(d.date), cycle: d.cycle ?? "2027 entry" })), ...stamp(dlSrc) } : { value: null, note: "not found", ...stamp(null) };

  rec.platform = m?.platform?.value && src(m.platform.src) ? { value: m.platform.value, ...stamp(src(m.platform.src)) } : { value: null, note: "not found", ...stamp(null) };

  const e = m?.english;
  if (e && src(e.src) && (num(e.ielts_overall) != null || num(e.toefl_ibt) != null || num(e.duolingo) != null)) {
    const io = num(e.ielts_overall), ib = num(e.ielts_band);
    rec.english = { ielts: io != null && io >= 4 && io <= 9 ? `${io} overall${ib ? `, ${ib} each` : ""}` : null, toefl_ibt: num(e.toefl_ibt) != null ? String(num(e.toefl_ibt)) : null, duolingo: num(e.duolingo) != null ? String(num(e.duolingo)) : null, ...stamp(src(e.src)) };
  } else rec.english = { ielts: null, toefl_ibt: null, duolingo: null, note: "not found", ...stamp(null) };

  rec.sat_act = m?.sat_act?.value && src(m.sat_act.src) ? { value: m.sat_act.value, ...stamp(src(m.sat_act.src)) } : { value: null, note: "not found" };
  rec.acceptance_rate = { value: null, note: "not collected" };
  const docs = Array.isArray(m?.documents?.value) ? m.documents.value.filter((x: unknown) => typeof x === "string" && x.length > 2).slice(0, 8) : [];
  rec.documents = docs.length && src(m.documents.src) ? { value: docs, ...stamp(src(m.documents.src)) } : { value: null, note: "not found", ...stamp(null) };
  const progs = Array.isArray(m?.programmes?.value) ? m.programmes.value.filter((p: any) => p?.name).slice(0, 10).map((p: any) => ({ name: String(p.name), faculty: null, years: num(p.years), requires: null })) : [];
  rec.programmes = progs.length && src(m.programmes.src) ? { value: progs, ...stamp(src(m.programmes.src)) } : { value: null, note: "not found", ...stamp(null) };
  rec.notes = notes;
  return rec;
}

export const FIELDS = ["tuition", "deadlines", "platform", "english", "documents", "programmes"] as const;
export function hasField(r: any, f: (typeof FIELDS)[number]): boolean {
  if (f === "tuition") return r.tuition?.amount != null;
  if (f === "english") return !!(r.english?.ielts || r.english?.toefl_ibt || r.english?.duolingo);
  return Array.isArray(r[f]?.value) ? r[f].value.length > 0 : r[f]?.value != null;
}
