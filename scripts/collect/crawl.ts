// Polite same-domain crawler: robots.txt, 1 req/s/domain, honest UA, page cache by URL hash. Never bypasses blocks.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractLinks, filterBlocks, htmlToBlocks, looksBlocked, parseRobots, parseSitemap, sameDomain, scoreUrl, title } from "./text";

export const UA = "CollegeStatBot/1.0 (+https://collegestat.xyz)";
export interface Page { url: string; status: number; fetched_at: string; title: string; blocks: string[]; links: { url: string; text: string }[]; skipped?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

export class Crawler {
  private last = new Map<string, number>();
  private chain = new Map<string, Promise<unknown>>();
  private robots = new Map<string, Promise<ReturnType<typeof parseRobots> | null>>();
  stats = { network: 0, cached: 0, blocked: 0 };
  constructor(public cacheDir: string, public minGapMs = 1000) { mkdirSync(cacheDir, { recursive: true }); }

  private cachePath(url: string, kind: string) { return path.join(this.cacheDir, `${kind}-${createHash("sha1").update(url).digest("hex")}.json`); }

  /** Serialise requests per host with a minimum gap. */
  private throttle<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chain.get(host) ?? Promise.resolve();
    const run = prev.then(async () => {
      const wait = (this.last.get(host) ?? 0) + this.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try { return await fn(); } finally { this.last.set(host, Date.now()); }
    });
    this.chain.set(host, run.catch(() => undefined));
    return run;
  }

  private async raw(url: string): Promise<{ status: number; body: string; type: string }> {
    const host = new URL(url).host;
    return this.throttle(host, async () => {
      this.stats.network++;
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8", "Accept-Language": "en" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
        const type = res.headers.get("content-type") ?? "";
        if (!/html|xml|text\/plain/i.test(type)) return { status: res.status, body: "", type };
        const buf = await res.arrayBuffer();
        return { status: res.status, body: new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 1_500_000)), type };
      } catch { return { status: 0, body: "", type: "" }; }
    });
  }

  private async robotsFor(origin: string) {
    if (!this.robots.has(origin)) {
      this.robots.set(origin, (async () => {
        const cp = this.cachePath(origin + "/robots.txt", "robots");
        let txt: string | null = null;
        if (existsSync(cp)) txt = JSON.parse(readFileSync(cp, "utf8")).txt;
        else {
          const r = await this.raw(origin + "/robots.txt");
          txt = r.status === 200 ? r.body : r.status >= 400 && r.status < 500 && r.status !== 429 ? "" : r.status === 0 ? "" : null;
          if (txt !== null) writeFileSync(cp, JSON.stringify({ txt }));
        }
        return txt === null ? null : parseRobots(txt, "CollegeStatBot");
      })());
    }
    return this.robots.get(origin)!;
  }

  async allowed(url: string): Promise<boolean> {
    const u = new URL(url);
    const r = await this.robotsFor(u.origin);
    return r ? r.allowed(u.pathname + u.search) : false; // robots 5xx -> be conservative
  }

  async sitemapUrls(origin: string): Promise<string[]> {
    const cp = this.cachePath(origin, "sitemap");
    if (existsSync(cp)) { this.stats.cached++; return JSON.parse(readFileSync(cp, "utf8")).urls; }
    const robots = await this.robotsFor(origin);
    const queue = [...new Set([...(robots?.sitemaps ?? []), origin + "/sitemap.xml"])].slice(0, 3);
    const urls: string[] = [];
    let fetched = 0;
    while (queue.length && fetched < 4) {
      const sm = queue.shift()!;
      if (!sameDomain(sm, origin) || !(await this.allowed(sm))) continue;
      const r = await this.raw(sm); fetched++;
      if (r.status !== 200 || !/<(urlset|sitemapindex)/i.test(r.body)) continue;
      const p = parseSitemap(r.body);
      urls.push(...p.urls);
      // follow only child sitemaps that look relevant (admissions, en, pages)
      queue.push(...p.sitemaps.filter((s) => /admission|apply|international|undergrad|page|en\b|main/i.test(s)).slice(0, 2));
    }
    const keep = urls.filter((u) => scoreUrl(u) >= 4).slice(0, 400);
    writeFileSync(cp, JSON.stringify({ urls: keep }));
    return keep;
  }

  async page(url: string): Promise<Page> {
    const cp = this.cachePath(url, "page");
    if (existsSync(cp)) { this.stats.cached++; return JSON.parse(readFileSync(cp, "utf8")); }
    const base: Page = { url, status: 0, fetched_at: today(), title: "", blocks: [], links: [] };
    if (!(await this.allowed(url))) { const p = { ...base, skipped: "robots.txt disallows" }; writeFileSync(cp, JSON.stringify(p)); return p; }
    const r = await this.raw(url);
    let p: Page;
    if (looksBlocked(r.status, r.body)) { this.stats.blocked++; p = { ...base, status: r.status, skipped: `blocked (HTTP ${r.status}) - not bypassed` }; }
    else if (r.status !== 200 || !r.body) p = { ...base, status: r.status, skipped: `HTTP ${r.status || "error"}` };
    else p = { ...base, status: 200, title: title(r.body), blocks: filterBlocks(htmlToBlocks(r.body), 1800), links: extractLinks(r.body, url).filter((l) => sameDomain(l.url, url) && scoreUrl(l.url, l.text) >= 3).slice(0, 80) };
    if (r.status !== 0) writeFileSync(cp, JSON.stringify(p)); // do not cache transient network errors
    return p;
  }

  /** Home/admissions page + best-scoring sitemap/links, up to maxPages pages total. */
  async crawl(start: string[], maxPages = 8): Promise<Page[]> {
    const root = start[0];
    const origin = new URL(root).origin;
    const pages: Page[] = [];
    const seen = new Set<string>();
    const norm = (u: string) => u.replace(/\/$/, "");
    const take = async (u: string) => { if (seen.has(norm(u)) || pages.length >= maxPages) return; seen.add(norm(u)); pages.push(await this.page(u)); };
    for (const s of start.slice(0, 2)) await take(s);
    const cand = new Map<string, number>();
    const add = (u: string, s: number) => { if (s >= 3 && sameDomain(u, root) && !seen.has(norm(u))) cand.set(u, Math.max(cand.get(u) ?? -9, s)); };
    for (const p of pages) for (const l of p.links) add(l.url, scoreUrl(l.url, l.text) + 1);
    if (pages.filter((p) => p.status === 200).length === 0 && pages.every((p) => p.skipped)) return pages; // site unreachable/blocked: stop early
    for (const u of await this.sitemapUrls(origin)) add(u, scoreUrl(u));
    while (pages.length < maxPages && cand.size) {
      const [u] = [...cand.entries()].sort((a, b) => b[1] - a[1])[0];
      cand.delete(u);
      await take(u);
      const p = pages[pages.length - 1];
      if (p?.url === u) for (const l of p.links) add(l.url, scoreUrl(l.url, l.text)); // second-hop links, same ranking
    }
    return pages;
  }
}
