// DeepSeek-powered collector. Usage: node --import tsx scripts/collect/run.ts [--limit N] [--cap 1.5] [--concurrency 6] [--targets-only]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Budget, costOf } from "./cost";
import { Crawler } from "./crawl";
import { callDeepSeek } from "./deepseek";
import { extractHints } from "./extract";
import { approxTokens, filterBlocks } from "./text";
import { FIELDS, buildRecord, hasField } from "./record";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIR = path.join(ROOT, "data/review/ds-collect");
const OUT = path.join(DIR, "output-101.json"); // numeric suffix => picked up by the oc-shards adapter glob
const LEDGER = path.join(DIR, "ledger.json");
const arg = (n: string, d: string) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const TOKEN_BUDGET = 2000;

for (const f of [".dev.vars", ".env.local"]) { try { process.loadEnvFile(path.join(ROOT, f)); } catch { /* absent */ } }
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) { console.error("DEEPSEEK_API_KEY not set in the project env"); process.exit(1); }

const readJson = (p: string, d: any) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const queue = readJson(path.join(ROOT, "data/curated/next-queue.json"), { items: [] }).items as any[];
const directory = new Map<string, any>((readJson(path.join(ROOT, "data/published/global-directory.json"), []) as any[]).map((r) => [r.id, r]));
const out = readJson(OUT, { generated: "", records: [] });
const done = new Set<string>(out.records.map((r: any) => r.id));
const ledger = readJson(LEDGER, { spent: 0, in: 0, out: 0, calls: 0, universities: 0 });
const budget = new Budget(Number(arg("cap", "1.5")), ledger.spent);
const limit = Number(arg("limit", String(queue.length)));
const today = new Date().toISOString().slice(0, 10);
const crawler = new Crawler(path.join(DIR, "cache"));
mkdirSync(DIR, { recursive: true });

const save = () => {
  out.generated = today;
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  writeFileSync(LEDGER, JSON.stringify({ spent: budget.spent, in: ledger.in + budget.inTok, out: ledger.out + budget.outTok, calls: ledger.calls + budget.calls, universities: out.records.length }, null, 1));
};

async function one(u: any) {
  const d = directory.get(u.id);
  const start = [d?.admissions_url, u.website, d?.website].filter((x, i, a) => x && a.indexOf(x) === i) as string[];
  if (!start.length) return buildRecord(u, [], null, today, ["no website"]);
  const pages = (await crawler.crawl(start, 8)).filter((p) => p.status === 200 && p.blocks.length);
  if (!pages.length) return buildRecord(u, [], null, today, [`no readable official pages (site blocked, unreachable or robots-disallowed)`]);
  // global token budget across pages: re-rank all blocks together, tag with page id
  const tagged: { b: string; p: number }[] = pages.flatMap((p, i) => p.blocks.map((b) => ({ b, p: i + 1 })));
  const kept = filterBlocks(tagged.map((x) => x.b), TOKEN_BUDGET - 200);
  const keptSet = new Set(kept);
  const byPage = new Map<number, string[]>();
  for (const x of tagged) if (keptSet.has(x.b.slice(0, 420))) (byPage.get(x.p) ?? byPage.set(x.p, []).get(x.p)!).push(x.b.slice(0, 420));
  const ordered = [...byPage.keys()].sort((a, b) => a - b);
  const text = ordered.map((i) => `[P${i}] ${pages[i - 1].url}\n${byPage.get(i)!.join("\n")}`).join("\n\n");
  const hints = extractHints(text);
  const user = `University: ${u.name} (${u.country_code})\nRegex hints: ${JSON.stringify(hints)}\n\n${text}`;
  // pages array indices must match tags
  const { json, usage } = await callDeepSeek(KEY!, user);
  budget.add(usage.prompt, usage.completion);
  // fill regex-only values the model left null when the hint is unambiguous
  const m = json ?? {};
  if (!m.english?.ielts_overall && hints.ielts.length === 1 && ordered.length) { const src = `P${ordered.find((i) => /IELTS/i.test(byPage.get(i)!.join(" "))) ?? ordered[0]}`; m.english = { ...(m.english ?? {}), ielts_overall: Number(hints.ielts[0].split(" ")[0]), src: m.english?.src ?? src }; }
  const rec = buildRecord(u, pages, m, today, [`pages fetched: ${pages.length}`, `tokens in/out: ${usage.prompt}/${usage.completion}`]);
  return rec;
}

async function main() {
  const todo = queue.slice(0, limit).filter((u) => !done.has(u.id));
  console.log(`queue ${queue.length}, already done ${done.size}, to do ${todo.length}, spent so far $${budget.spent.toFixed(4)}, cap $${budget.cap}`);
  let idx = 0, processed = 0, stop = false;
  const t0 = Date.now(), cost0 = budget.spent;
  const worker = async () => {
    while (!stop) {
      if (budget.exhausted()) { stop = true; console.log(`STOP: estimated spend $${budget.spent.toFixed(4)} reached cap $${budget.cap}`); return; }
      const u = todo[idx++];
      if (!u) return;
      try {
        const rec = await one(u);
        out.records.push(rec); done.add(u.id); processed++;
        if (processed % 5 === 0) save();
        const got = FIELDS.filter((f) => hasField(rec, f)).length;
        console.log(`[${processed}/${todo.length}] ${u.name.slice(0, 40)} fields=${got}/6 $${budget.spent.toFixed(4)}`);
      } catch (e) { console.log(`ERR ${u.name}: ${(e as Error).message}`); }
    }
  };
  await Promise.all(Array.from({ length: Number(arg("concurrency", "6")) }, worker));
  save();
  const recs = out.records;
  const cov = FIELDS.map((f) => `${f} ${recs.filter((r: any) => hasField(r, f)).length}`).join(", ");
  const spentRun = budget.spent - cost0;
  console.log(`done: ${processed} this run in ${Math.round((Date.now() - t0) / 1000)}s; run cost $${spentRun.toFixed(4)} ($${(spentRun / Math.max(1, processed)).toFixed(5)}/uni, ${budget.inTok} in / ${budget.outTok} out tokens); total $${budget.spent.toFixed(4)}`);
  console.log(`coverage over ${recs.length} records: ${cov}; crawler ${JSON.stringify(crawler.stats)}`);
}
void approxTokens; void costOf;
main();
