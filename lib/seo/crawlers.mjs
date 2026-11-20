/** Search and answer-engine crawlers that are explicitly welcome on public pages. */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "Googlebot",
];
export const PRIVATE_PATHS = ["/dashboard", "/admin", "/staff", "/api/", "/auth", "/saved", "/profile"];
/** Public machine-readable reads live under /api/ but are meant to be fetched. */
export const PUBLIC_API_PATHS = ["/api/public/"];

export function robotsTxt(site) {
  const rules = [
    ...PUBLIC_API_PATHS.map((p) => `Allow: ${p}`),
    "Allow: /",
    ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`),
  ];
  const block = (agents) => [...agents.map((a) => `User-agent: ${a}`), ...rules, ""];
  return [
    ...block(["*"]),
    ...AI_CRAWLERS.flatMap((a) => block([a])),
    `Sitemap: ${site}/sitemap.xml`,
    `# Machine-readable overview: ${site}/llms.txt`,
    "",
  ].join("\n");
}
