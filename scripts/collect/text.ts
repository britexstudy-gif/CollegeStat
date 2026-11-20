// HTML -> relevant text blocks, link scoring, sitemap parsing. Pure functions (unit-tested).

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", pound: "£", yen: "¥", ndash: "-", mdash: "-", copy: "" };
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

/** Split HTML into text blocks (paragraphs, list items, headings, table rows joined by " | "). */
export function htmlToBlocks(html: string): string[] {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|template)\b[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, " | ").replace(/<\/tr>/gi, "\n");
  h = h.replace(/<\/?(p|div|li|ul|ol|h[1-6]|section|article|br|table|tr|dt|dd|main|aside|blockquote|details|summary)\b[^>]*>/gi, "\n");
  h = h.replace(/<[^>]+>/g, " ");
  return decodeEntities(h)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l.length >= 12);
}

export const title = (html: string): string => decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim()).slice(0, 160);

const MONEY = /(?:US\$|\$|€|£|¥|₩|₹|CHF|USD|EUR|GBP|CAD|AUD|RMB|CNY|JPY|KRW|SGD|HKD|NZD|SEK|DKK|NOK|AED)\s?\d|\d[\d,.\s]*\s?(?:USD|EUR|GBP|CAD|AUD|RMB|CNY|JPY|KRW|SGD|HKD|NZD|SEK|DKK|NOK|AED|yuan|euros?|dollars?)\b/i;
const KEYWORDS = /\b(tuition|fees?|cost of attendance|IELTS|TOEFL|Duolingo|SAT|ACT|deadline|closing date|apply by|application (?:opens?|period|round|date)|early (?:action|decision)|regular decision|UCAS|Common App(?:lication)?|Coalition|uni-?assist|Studielink|international students?|entry requirements?|English (?:language )?(?:proficiency|requirements?)|transcripts?|recommendation|personal statement|bachelor|undergraduate programmes?|degree programmes?|admission requirements?|required documents?|acceptance rate)\b/i;
const DATEWORD = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b20\d{2}\s?[/-]\s?(?:20)?\d{2}\b/i;

/** A block is relevant when it carries money, a test name, a fee/tuition/deadline word, or a platform name. */
export function isRelevant(b: string): boolean {
  if (b.length > 900) return KEYWORDS.test(b) || MONEY.test(b);
  return MONEY.test(b) || (KEYWORDS.test(b) && (DATEWORD.test(b) || /\d/.test(b) || b.length < 260)) || (KEYWORDS.test(b) && b.length < 500);
}

export const approxTokens = (s: string): number => Math.ceil(s.length / 3.6);

/** Keep relevant blocks, dedupe, score (money/test numbers first), cap to a token budget. */
export function filterBlocks(blocks: string[], maxTokens: number): string[] {
  const seen = new Set<string>();
  const scored: { b: string; s: number; i: number }[] = [];
  blocks.forEach((raw, i) => {
    const b = raw.slice(0, 420);
    const key = b.toLowerCase().replace(/\W+/g, "");
    if (seen.has(key) || !isRelevant(raw)) return;
    seen.add(key);
    let s = 0;
    if (MONEY.test(b)) s += 3;
    if (/tuition/i.test(b)) s += 3;
    if (/international/i.test(b)) s += 2;
    if (/IELTS|TOEFL|Duolingo/i.test(b)) s += 3;
    if (DATEWORD.test(b) && /deadline|apply|application|closing|round|early|regular/i.test(b)) s += 3;
    if (/UCAS|Common App|Coalition|uni-?assist|Studielink/i.test(b)) s += 2;
    scored.push({ b, s, i });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  const keep: typeof scored = [];
  let used = 0;
  for (const x of scored) {
    const t = approxTokens(x.b);
    if (used + t > maxTokens) continue;
    keep.push(x);
    used += t;
  }
  return keep.sort((a, b) => a.i - b.i).map((x) => x.b);
}

const GOOD = /(tuition|fees?|costs?|financ|admission|apply|application|international|undergrad|bachelor|requirement|english|programme|program|deadline|how-to-apply|entry|study-with-us|prospective)/i;
const BAD = /\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|mp4)(\?|$)|\/(news|events?|blog|press|alumni|giving|athletics|sports|research|staff|people|jobs|careers|login|search|tag|category)\b|mailto:|javascript:|#$/i;
const OTHER_LANG = /\/(zh|cn|ru|es|de|fr|ja|jp|ko|kr|it|pt|ar|tr|uz|kk|pl|nl)(-[a-z]{2})?(\/|$)/i;

export function scoreUrl(url: string, text = ""): number {
  if (BAD.test(url)) return -1;
  const u = url.toLowerCase(), t = text.toLowerCase();
  let s = 0;
  if (GOOD.test(u)) s += 2;
  if (GOOD.test(t)) s += 1;
  if (/tuition|fees|cost/.test(u + " " + t)) s += 4;
  if (/international/.test(u + " " + t)) s += 3;
  if (/undergrad|bachelor|first-year|freshman/.test(u + " " + t)) s += 2;
  if (/english|ielts|toefl/.test(u + " " + t)) s += 2;
  if (/deadline|dates|how-to-apply|apply/.test(u + " " + t)) s += 2;
  if (/admission|requirement/.test(u + " " + t)) s += 2;
  if (/graduate|master|phd|doctor|postgrad/.test(u) && !/undergrad/.test(u)) s -= 3;
  if (OTHER_LANG.test(u)) s -= 4;
  s -= Math.min(3, Math.floor((u.split("/").length - 3) / 3)); // prefer shallow
  return s;
}

export function extractLinks(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(decodeEntities(m[1]), base);
      if (!/^https?:$/.test(u.protocol)) continue;
      u.hash = "";
      out.push({ url: u.toString(), text: decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 80) });
    } catch { /* bad href */ }
  }
  return out;
}

const hostKey = (h: string) => h.toLowerCase().replace(/^www\./, "");
/** Same site: same host (ignoring www) or a subdomain of the start host / shared registrable suffix. */
export function sameDomain(url: string, root: string): boolean {
  try {
    const a = hostKey(new URL(url).hostname), b = hostKey(new URL(root).hostname);
    if (a === b || a.endsWith("." + b)) return true;
    const reg = (h: string) => { const p = h.split("."); return /^(ac|co|edu|com|org|gov)$/.test(p[p.length - 2] ?? "") ? p.slice(-3).join(".") : p.slice(-2).join("."); };
    return reg(a) === reg(b) && reg(b).split(".").length >= 2 && b.split(".").length <= reg(b).split(".").length + 1;
  } catch { return false; }
}

export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const urls: string[] = [], sitemaps: string[] = [];
  const idx = /<sitemapindex/i.test(xml);
  for (const m of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)) (idx ? sitemaps : urls).push(decodeEntities(m[1]));
  return { urls, sitemaps };
}

/** robots.txt: returns allow(path) for our agent. Longest matching rule wins; Allow wins ties. */
export function parseRobots(txt: string, agent = "CollegeStatBot"): { allowed: (path: string) => boolean; sitemaps: string[]; crawlDelay: number | null } {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[]; delay: number | null }[] = [];
  const sitemaps: string[] = [];
  let cur: (typeof groups)[number] | null = null, lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "sitemap") { sitemaps.push(v); continue; }
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === "disallow") cur.rules.push({ allow: false, path: v });
    else if (k === "allow") cur.rules.push({ allow: true, path: v });
    else if (k === "crawl-delay") cur.delay = Number(v) || null;
  }
  const me = agent.toLowerCase();
  const g = groups.find((x) => x.agents.some((a) => a !== "*" && me.includes(a))) ?? groups.find((x) => x.agents.includes("*"));
  const rules = g?.rules ?? [];
  const match = (p: string, path: string) => {
    if (!p) return false;
    const re = new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    return re.test(path);
  };
  return {
    sitemaps,
    crawlDelay: g?.delay ?? null,
    allowed(path: string) {
      let best: { allow: boolean; len: number } | null = null;
      for (const r of rules) if (match(r.path, path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
      return best ? best.allow : true;
    },
  };
}

export const looksBlocked = (status: number, body: string): boolean =>
  [401, 403, 429, 503].includes(status) || /cf-chl|Just a moment\.\.\.|g-recaptcha|hcaptcha|Attention Required! \| Cloudflare|captcha-delivery|Access Denied/i.test(body.slice(0, 6000)) && body.length < 40000;
