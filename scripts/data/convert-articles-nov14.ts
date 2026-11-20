/** Converts data/review/articles-nov14/*.md into loader JSON next to each .md and
 * quality-checks them: every source URL resolves, figures and dates carry a
 * link, nothing reads as marketing. Passing guides become "approved"; the rest
 * stay "draft" with a review_note. The .md files are never changed.
 *
 *   node --import tsx scripts/data/convert-articles-nov14.ts */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { checkUrl, convertArticle, pool, reviewArticleText, type Raw, type UrlCheck } from "./nov14-lib";

const DIR = "data/review/articles-nov14";
const CACHE = "data/review/url-checks-articles-nov14.json";
const cache: Record<string, UrlCheck> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
const articles = files.map((f) => convertArticle(readFileSync(`${DIR}/${f}`, "utf8")));

const urls = new Set<string>();
for (const a of articles) {
  for (const s of a.sources as { url: string }[]) urls.add(s.url);
  for (const m of String(a.body).matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) urls.add(m[1]);
}
const todo = [...urls].filter((u) => !cache[u] || cache[u].status === 0);
console.log(`checking ${todo.length} of ${urls.size} URLs`);
await pool(todo, 6, async (u) => {
  cache[u] = await checkUrl(u);
});
writeFileSync(CACHE, JSON.stringify(cache, null, 1));

let approved = 0;
for (const a of articles) {
  const issues: string[] = [];
  const srcs = a.sources as { title: string; url: string }[];
  for (const u of new Set([...srcs.map((s) => s.url), ...[...String(a.body).matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1])])) {
    const c = cache[u];
    if (!c?.ok) issues.push(`source does not resolve: ${u} (${c?.reason ?? "unchecked"})`);
  }
  for (const k of ["slug", "title", "summary", "category", "checked_at"]) if (!a[k]) issues.push(`missing ${k}`);
  issues.push(...reviewArticleText(String(a.body), srcs));
  const out: Raw = { ...a, status: issues.length ? "draft" : "approved" };
  if (issues.length) out.review_note = issues.join("; ");
  else approved++;
  writeFileSync(`${DIR}/${a.slug}.json`, JSON.stringify(out, null, 2) + "\n");
  console.log(`${String(out.status).padEnd(8)} ${a.slug}${issues.length ? "\n    - " + issues.join("\n    - ") : ""}`);
}
console.log(`approved ${approved} of ${articles.length}`);
