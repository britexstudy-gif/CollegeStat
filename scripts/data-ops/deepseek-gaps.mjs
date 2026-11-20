// Gap-fill with DeepSeek as a reader, not a researcher.
//
//   node scripts/data-ops/deepseek-gaps.mjs [--limit N] [--budget 1.80]
//
// For each target university still missing a verified deadline, tuition or IELTS
// minimum (data/review/deepseek-nov20/targets.json):
//   1. fetch its official website: the home page, then the admissions / fees /
//      international / English-requirement pages it links to (same domain only);
//   2. send the page text to DeepSeek, which returns each fact with the exact
//      sentence it came from;
//   3. keep a fact only when that sentence really appears on the fetched page.
// Output: data/review/deepseek-nov20/out/out-NNN.json in the gap-fill schema, for
// scripts/data-ops/codex-gaps-build.py (GAPS_INPUT=data/review/deepseek-nov20/out).
// Spend is tracked from the API's token counts and the run stops at --budget USD.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import dns from "node:dns";

// Several university sites publish AAAA records that do not answer; prefer IPv4.
dns.setDefaultResultOrder("ipv4first");

const DIR = new URL("../../data/review/deepseek-nov20/", import.meta.url);
const KEY = readFileSync(homedir() + "/.config/collegestat/deepseek-key", "utf8").trim();
const arg = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
// --out: a separate output folder, so a second pass can retry universities the
// first pass already read (now looking only for the facts still missing).
const OUT = new URL(arg("out", "out") + "/", DIR);
mkdirSync(OUT, { recursive: true });
const LIMIT = Number(arg("limit", "100000"));
const BUDGET = Number(arg("budget", "1.80"));
// Conservative list prices (USD per million tokens) so the cap errs on the safe side.
const PRICE_IN = 0.3, PRICE_OUT = 1.2;
// Spend is tracked per output folder, so several runs can go in parallel, each
// with its own --budget (USD for that run).
const spentFile = new URL("spent.json", OUT);
let spent = existsSync(spentFile) ? JSON.parse(readFileSync(spentFile, "utf8")).usd : 0;

const UA = "Mozilla/5.0 (compatible; CollegeStatBot/1.0; +https://collegestat.xyz)";
const KEYWORDS = /admission|undergrad|bachelor|international|fee|tuition|cost|english|language|ielts|requirement|deadline|apply|application|dates|entry|foreign|приём|поступ|stoimost|bewerb|studiengeb|sprach/i;

async function get(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.includes("html")) return null;
    return { url: r.url, html: (await r.text()).slice(0, 1_500_000) };
  } catch {
    return null;
  }
}
const text = (html) =>
  html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|h\d|tr|div|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
function links(html, base) {
  const out = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    const label = m[2].replace(/<[^>]+>/g, " ") + " " + u.pathname;
    const score = (label.match(new RegExp(KEYWORDS.source, "gi")) || []).length;
    if (score) out.set(u.href.split("#")[0], Math.max(out.get(u.href) || 0, score));
  }
  return [...out].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}
const sameSite = (a, b) => {
  const root = (h) => h.replace(/^www\./, "").split(".").slice(-2).join(".");
  return root(new URL(a).hostname) === root(new URL(b).hostname);
};

async function getText(url, accept = "text/xml,application/xml,text/plain,*/*") {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    return r.ok ? (await r.text()).slice(0, 8_000_000) : null;
  } catch {
    return null;
  }
}
const GOOD = { tuition: /tuition|fees?\b|fees-|cost|funding|studiengeb|stoimost|oplata/i, ielts: /english|language-requirement|ielts|toefl|entry-requirement|requirements/i, deadline: /deadline|dates|apply|application|timeline|how-to-apply|bewerb/i };
const LEVEL = /undergrad|bachelor|first-year|freshm|ug\b|\/ug\/|admission|international|study/i;
const BAD = /postgrad|graduate-|\/graduate|master|\/phd|doctoral|\/news|\/event|blog|staff|research|alumni|refund|\/library|\/media|press|\/jobs|careers|\.pdf$|\/tag\/|\/page\/\d/i;

/** Page URLs from the university's own sitemap(s), scored for the facts still missing. */
async function sitemapUrls(origin, need) {
  const robots = (await getText(origin + "/robots.txt")) || "";
  let maps = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  if (!maps.length) maps = [origin + "/sitemap.xml", origin + "/sitemap_index.xml"];
  const urls = new Set();
  const seen = new Set();
  for (let i = 0; i < maps.length && seen.size < 12; i++) {
    const m = maps[i];
    if (seen.has(m)) continue;
    seen.add(m);
    const xml = await getText(m);
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1].replace(/&amp;/g, "&"));
    if (/<sitemapindex/i.test(xml)) {
      // Child sitemaps: prefer ones about pages, study or admissions.
      maps.push(...locs.sort((a, b) => Number(/page|study|admission|course|undergrad/i.test(b)) - Number(/page|study|admission|course|undergrad/i.test(a))).slice(0, 8));
    } else for (const l of locs) urls.add(l);
  }
  const score = (u) => {
    if (BAD.test(u)) return 0;
    let s = LEVEL.test(u) ? 2 : 0;
    for (const k of need) if (GOOD[k].test(u)) s += 3;
    return s >= 5 ? s - u.length / 200 : 0;
  };
  return [...urls].map((u) => [u, score(u)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([u]) => u);
}

async function gather(website, need) {
  const home = await get(website);
  if (!home) return [];
  const origin = new URL(home.url).origin;
  let candidates = await sitemapUrls(origin, need);
  // No usable sitemap: follow the home page's admissions / fees links instead.
  if (candidates.length < 2)
    candidates = [...candidates, ...links(home.html, home.url).filter((u) => sameSite(u, home.url) && !BAD.test(u)).slice(0, 6)];
  // Still thin: try the addresses universities commonly use for these pages.
  if (candidates.length < 3)
    for (const k of need) for (const path of COMMON[k]) candidates.push(origin + path);
  const pages = [];
  for (const u of [...new Set(candidates)].slice(0, 12)) {
    if (pages.length >= 7) break;
    const p = await get(u);
    if (p && !pages.some((x) => x.url === p.url)) pages.push(p);
  }
  // Crawl one level deeper: from the pages found, follow the same-site links
  // whose text or address names a fact still missing (fees -> international fees).
  const seen = new Set(pages.map((p) => p.url));
  const deeper = new Map();
  for (const p of [home, ...pages])
    for (const u of links(p.html, p.url)) {
      if (seen.has(u) || BAD.test(u) || !sameSite(u, home.url)) continue;
      const s = need.reduce((n, k) => n + (GOOD[k].test(u) ? 3 : 0), LEVEL.test(u) ? 1 : 0);
      if (s >= 3) deeper.set(u, Math.max(deeper.get(u) || 0, s));
    }
  for (const [u] of [...deeper].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    const p = await get(u);
    if (p && !seen.has(p.url)) seen.add(p.url), pages.push(p);
  }
  if (!pages.length) pages.push(home);
  // Keep the pages that talk most about fees, English and deadlines.
  return pages
    .map((p) => ({ url: p.url, text: text(p.html) }))
    .map((p) => ({ ...p, score: (p.text.match(/tuition|fee|ielts|toefl|deadline|international|€|\$|£|₩|¥/gi) || []).length }))
    .sort((a, b) => b.score - a.score)
    .filter((p) => need.some((k) => EVIDENCE[k].test(p.text)))
    .slice(0, 4)
    .map((p) => ({ url: p.url, text: excerpt(p.text) }));
}

// Send DeepSeek only the lines about fees, English, deadlines and admitted
// students (with one line of context each side), not whole pages: fewer tokens
// per call, and the facts deep in a long page are no longer cut off.
const FACT = /tuition|fee|ielts|toefl|duolingo|pte academic|test-optional|test optional|english|deadline|closing date|apply by|international|non-eu|overseas|sat\b|admitted|acceptance|per (year|annum|semester)|€|\$|£|₩|¥|\b20(26|27)\b/i;
function excerpt(t) {
  const lines = t.split("\n");
  const keep = new Set();
  lines.forEach((l, i) => { if (FACT.test(l)) for (let j = i - 1; j <= i + 1; j++) if (j >= 0 && j < lines.length) keep.add(j); });
  return [...keep].sort((a, b) => a - b).map((i) => lines[i].trim()).filter(Boolean).join("\n").slice(0, 5000);
}
// Free pre-check: a page is only sent to DeepSeek when it holds the kind of
// fact still missing (a score next to IELTS, an amount with a currency, a date).
const EVIDENCE = {
  ielts: /(ielts[^\n]{0,60}\b[4-8](\.[05])?\b|(toefl|duolingo|pte)[^\n]{0,60}\b\d{2,3}\b)/i,
  tuition: /([£€$₩¥]|\b(usd|eur|gbp|sek|chf|aud|cad|krw|cny|myr|try|kzt|uzs|czk|huf|pln)\b)\s?\d{1,3}([,. ]?\d{3})+|\d{1,3}([,. ]?\d{3})+\s?([€$]|eur|usd|gbp|sek|chf|aud|cad|krw|won|cny|rmb|yuan|yen|myr|try|kzt|tenge|uzs|czk|huf|pln|руб)/i,
  deadline: /\b(\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})\b[^\n]{0,12}\b20(26|27)\b|\b20(26|27)-\d{2}-\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]20(26|27)\b/i,
};
const COMMON = {
  tuition: ["/fees", "/tuition-fees", "/international/fees", "/study/fees", "/admissions/tuition", "/en/tuition-fees"],
  ielts: ["/english-language-requirements", "/international/english-language-requirements", "/admissions/english-requirements", "/en/language-requirements"],
  deadline: ["/how-to-apply", "/admissions/international", "/international/how-to-apply", "/en/admission"],
};

const PROMPT = `You extract admissions facts for an INTERNATIONAL applicant to a FIRST-YEAR BACHELOR'S degree (2027 entry, or the latest published cycle) from the official university pages below. Use ONLY these pages. Never use outside knowledge; if a fact is not stated on the pages, return null for it.
For every fact give "quote": a short sentence copied EXACTLY, character for character, from the page, that states the fact, and "url": the page it came from.
Return JSON only:
{"english": [{"test": "IELTS"|"TOEFL iBT"|"Duolingo"|"PTE Academic", "minimum": number, "detail": string, "quote": string, "url": string}],
 "tuition": {"amount": number, "amount_max": number|null, "currency": "ISO code", "period": "year", "academic_year": string, "detail": string, "quote": string, "url": string} | null,
 "deadlines": [{"title": string, "due_at": "YYYY-MM-DD", "route": string, "quote": string, "url": string}],
 "sat": {"policy": "required"|"optional"|"not_considered", "minimum": number|null, "p25": number|null, "p75": number|null, "quote": string, "url": string} | null,
 "acceptance_rate": {"percent": number, "year": string, "quote": string, "url": string} | null,
 "admitted": {"detail": string, "quote": string, "url": string} | null,
 "notes": string}
Rules: english = the general undergraduate overall minimum for EACH test the pages name (IELTS Academic overall, TOEFL iBT total, Duolingo overall, PTE Academic overall); one entry per test, omit tests not stated. Tuition = yearly fee for international/non-EU undergraduates (convert per-semester to per-year only if the page states both); amount 0 if tuition is free. Deadlines = undergraduate application deadlines for international applicants with full dates. SAT = the policy for international first-year applicants (required, optional / test-optional, or not considered / test-blind) when stated; minimum = the lowest SAT total the university accepts or requires (for admission or for a scholarship/grant, say which in notes) only if stated; and p25/p75 = the middle 50% SAT total of ADMITTED or ENROLLED first-year students only if stated. Acceptance rate = the published admit rate. Admitted = one line on what admitted students actually had (e.g. "average IELTS 7.0", "median GPA 3.9", "average entry score 85/100"), not the minimum. Detail under 140 characters.`;

async function ask(name, pages) {
  const content = pages.map((p, i) => `### PAGE ${i + 1}: ${p.url}\n${p.text}`).join("\n\n");
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 1200,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `University: ${name}\n\n${content}` },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "DeepSeek " + r.status);
  const u = j.usage || {};
  spent += ((u.prompt_tokens || 0) * PRICE_IN + (u.completion_tokens || 0) * PRICE_OUT) / 1e6;
  writeFileSync(spentFile, JSON.stringify({ usd: spent }));
  return JSON.parse(j.choices[0].message.content);
}

const norm = (s) => String(s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
function grounded(fact, pages) {
  if (!fact?.quote || !fact?.url) return false;
  const page = pages.find((p) => p.url === fact.url) || pages.find((p) => norm(p.text).includes(norm(fact.quote)));
  return !!page && norm(fact.quote).length >= 12 && norm(page.text).includes(norm(fact.quote)) && ((fact.url = page.url), true);
}

const targets = JSON.parse(readFileSync(new URL(arg("targets", "targets.json"), DIR), "utf8")).slice(0, LIMIT);
let batch = [];
let fileNo = 0;
while (existsSync(new URL(`out-${String(fileNo).padStart(3, "0")}.json`, OUT))) fileNo++;
const done = new Set();
for (const f of Array.from({ length: fileNo }, (_, i) => `out-${String(i).padStart(3, "0")}.json`))
  for (const u of JSON.parse(readFileSync(new URL(f, OUT), "utf8")).universities) done.add(u.id);
const flush = () => {
  if (!batch.length) return;
  writeFileSync(new URL(`out-${String(fileNo++).padStart(3, "0")}.json`, OUT), JSON.stringify({ universities: batch }, null, 1));
  batch = [];
};
const stats = { tried: 0, nopages: 0, ielts: 0, tuition: 0, deadlines: 0, rejected: 0 };
const queue = targets.filter((t) => !done.has(t.id));
async function one(t) {
  if (spent >= BUDGET) return;
  stats.tried++;
  const pages = t.website ? await gather(t.website, t.need) : [];
  if (!pages.length) {
    stats.nopages++;
    return;
  }
  if (process.env.DEBUG) console.log(pages.map((p) => p.url + " (" + p.text.length + " chars)").join("\n"));
  let res;
  try {
    res = await ask(t.name, pages);
    if (process.env.DEBUG) console.log(JSON.stringify(res).slice(0, 600));
  } catch (e) {
    console.log(`  ${t.name}: ${e.message}`);
    return;
  }
  const keep = (f) => (grounded(f, pages) ? true : (f && stats.rejected++, false));
  const RANGE = { IELTS: [4, 9], "TOEFL iBT": [30, 120], Duolingo: [60, 160], "PTE Academic": [30, 90] };
  const english = t.need.includes("ielts") || t.need.includes("english")
    ? (res.english || []).filter((e) => RANGE[e.test] && e.minimum >= RANGE[e.test][0] && e.minimum <= RANGE[e.test][1] && keep(e))
    : [];
  const ielts = english.find((e) => e.test === "IELTS") || english[0] || null;
  const tuition = res.tuition && t.need.includes("tuition") && keep(res.tuition) && res.tuition.amount >= 0 ? res.tuition : null;
  const deadlines = t.need.includes("deadline") ? (res.deadlines || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.due_at) && keep(d)) : [];
  if (ielts) stats.ielts++;
  if (tuition) stats.tuition++;
  if (deadlines.length) stats.deadlines++;
  batch.push({
    id: t.id,
    english: english.map((e) => ({ test: e.test, minimum: e.minimum, detail: String(e.detail || "").slice(0, 160), source_url: e.url })),
    tuition: tuition
      ? { amount: tuition.amount, amount_max: tuition.amount_max ?? null, currency: String(tuition.currency || "").toUpperCase().slice(0, 3), period: "year", academic_year: String(tuition.academic_year || ""), detail: String(tuition.detail || "").slice(0, 160), source_url: tuition.url }
      : null,
    application_fee: null,
    deadlines: deadlines.map((d) => ({ title: String(d.title).slice(0, 120), due_at: d.due_at, route: String(d.route || "").slice(0, 120), source_url: d.url })),
    sat: res.sat && ["required", "optional", "not_considered"].includes(res.sat.policy) && keep(res.sat)
      ? { policy: res.sat.policy, minimum: res.sat.minimum >= 400 && res.sat.minimum <= 1600 ? res.sat.minimum : null, p25: res.sat.p25 >= 400 && res.sat.p25 <= 1600 ? res.sat.p25 : null, p75: res.sat.p75 >= 400 && res.sat.p75 <= 1600 ? res.sat.p75 : null, source_url: res.sat.url }
      : null,
    acceptance_rate: res.acceptance_rate && res.acceptance_rate.percent > 0 && res.acceptance_rate.percent <= 100 && keep(res.acceptance_rate)
      ? { percent: res.acceptance_rate.percent, year: String(res.acceptance_rate.year || ""), source_url: res.acceptance_rate.url }
      : null,
    // What admitted students actually had (beyond the minimum), when the page says it.
    notes: (res.admitted && keep(res.admitted) ? "Admitted students: " + String(res.admitted.detail) : String(res.notes || "")).slice(0, 160),
  });
  console.log(`${t.name}: ielts ${ielts ? ielts.test.split(" ")[0] + " " + ielts.minimum : "-"} | tuition ${tuition ? tuition.amount + " " + tuition.currency : "-"} | deadlines ${deadlines.length} | $${spent.toFixed(3)}`);
  if (batch.length >= 10) flush();
}
// Six universities at a time; each one's page fetches stay sequential (polite).
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length && spent < BUDGET) await one(queue.shift());
  }),
);
if (spent >= BUDGET) console.log(`budget reached: $${spent.toFixed(3)}`);
flush();
console.log(JSON.stringify({ ...stats, spent_usd: Number(spent.toFixed(3)) }));
