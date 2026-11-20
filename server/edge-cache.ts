import { AsyncLocalStorage } from "node:async_hooks";
import { LANG_COOKIE, resolveLang } from "@/lib/i18n/languages";

/** Edge cache for anonymous, user-independent public pages and public API JSON.
 *
 * The Worker entry (worker/index.ts) looks a GET up in the data center's Cache
 * API before rendering. A fresh entry is returned as is; a stale one is
 * returned at once and re-rendered in the background (ctx.waitUntil). These
 * pages read no session on the server: the only request input the HTML uses
 * is the interface language (cs-lang cookie, else Accept-Language), so the
 * resolved language is part of the key. Theme is applied in the browser.
 *
 * Never add account, auth, dashboard, staff or admin routes here. */

/** Public pages are built from published data that changes rarely (a data
 * release ships with a deploy, and the build stamp in the key retires every
 * entry then). Three days fresh, then a month of serve-stale-and-refresh. */
export const PAGE_FRESH_SECONDS = 3 * 86400;
export const PAGE_STALE_SECONDS = 30 * 86400;
/** Pages rendered from the bundled fallback while Supabase was slow. */
export const FALLBACK_FRESH_SECONDS = 300;
export const FALLBACK_STALE_SECONDS = 3600;
const API_STALE_SECONDS = 600;

const PUBLIC_PAGES = [
  /^\/$/,
  /^\/universities$/,
  /^\/university\/[a-z0-9-]{1,160}$/,
  /^\/rankings$/,
  /^\/scholarships$/,
  /^\/scholarships\/[^/]{1,200}$/,
  /^\/articles$/,
  /^\/articles\/[^/]{1,200}$/,
  /^\/compare$/,
  /^\/(?:methodology|sources|about|terms|privacy)$/,
];
const PUBLIC_APIS = [
  /^\/api\/catalog$/,
  /^\/api\/rankings\/national$/,
  /^\/api\/learning-resources$/,
  /^\/api\/public\/university\/[a-z0-9-]{1,160}$/,
  // 1200x630 share cards (app/og); the route's public s-maxage sets the lifetime.
  /^\/og\/(?:university|article)\/[a-z0-9-]{1,200}$/,
  // 1200x630 share cards (app/og): public s-maxage from the route decides.
  /^\/og\/(?:university|article)\/[a-z0-9-]{1,200}$/,
];
/** Request headers the App Router varies on (see the response Vary header).
 * Their values are part of the key, so client navigations and prefetches get
 * their own entries and documents never share one with an RSC payload. */
const ROUTER_HEADERS = [
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-url",
  "x-vinext-interception-context",
  "x-vinext-mounted-slots",
  "x-vinext-rsc-render-mode",
];
/** Vary names a cached page may carry; anything else means "do not share". */
const KNOWN_VARY = new Set([...ROUTER_HEADERS, "accept", "accept-encoding"]);

export type EdgePolicy = { key: string; kind: "page" | "api" };

/** Which cache entry a request may use, or null when it must reach the app. */
export function edgeCachePolicy(
  request: Request,
  buildStamp: string,
): EdgePolicy | null {
  if (request.method !== "GET") return null;
  if (request.headers.has("authorization")) return null;
  const url = new URL(request.url);
  const kind = PUBLIC_PAGES.some((p) => p.test(url.pathname))
    ? "page"
    : PUBLIC_APIS.some((p) => p.test(url.pathname))
      ? "api"
      : null;
  if (!kind) return null;
  // Same origin as the request: the Cache API stores entries per zone.
  const key = new URL(url.pathname, url.origin);
  const params = [...url.searchParams].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  for (const [name, value] of params) key.searchParams.append(name, value);
  key.searchParams.set("__build", buildStamp);
  if (kind === "page") {
    key.searchParams.set(
      "__lang",
      resolveLang(
        cookieValue(request.headers.get("cookie"), LANG_COOKIE),
        request.headers.get("accept-language"),
      ),
    );
    const router = ROUTER_HEADERS.map(
      (name) => name + "=" + (request.headers.get(name) ?? ""),
    ).join("\n");
    if (ROUTER_HEADERS.some((name) => request.headers.has(name)))
      key.searchParams.set("__router", hashText(router));
  }
  return { key: key.href, kind };
}

function cookieValue(header: string | null, name: string) {
  for (const part of (header || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

/** 64-bit FNV-1a: a short, stable key part for long router-state headers. */
function hashText(text: string) {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(36);
}

type Lifetime = { fresh: number; stale: number };

/** How long a rendered response may be shared, or null to keep it private. */
export function edgeLifetime(
  policy: EdgePolicy,
  response: Response,
  hint: EdgeHint,
): Lifetime | null {
  if (response.status !== 200 || hint.skip) return null;
  if (response.headers.has("set-cookie")) return null;
  const vary = (response.headers.get("vary") || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (vary.some((v) => !KNOWN_VARY.has(v))) return null;
  const control = (response.headers.get("cache-control") || "").toLowerCase();
  if (policy.kind === "api") {
    // Route handlers decide: only an explicit public lifetime is shared.
    if (!/\bpublic\b/.test(control) || /no-store|private/.test(control))
      return null;
    const age = Number(
      control.match(/s-maxage=(\d+)/)?.[1] ?? control.match(/max-age=(\d+)/)?.[1],
    );
    return age > 0 ? { fresh: age, stale: API_STALE_SECONDS } : null;
  }
  if (/\bprivate\b/.test(control)) return null;
  return hint.fallback
    ? { fresh: FALLBACK_FRESH_SECONDS, stale: FALLBACK_STALE_SECONDS }
    : { fresh: PAGE_FRESH_SECONDS, stale: PAGE_STALE_SECONDS };
}

export function pageCacheControl({ fresh, stale }: Lifetime) {
  return `public, max-age=0, s-maxage=${fresh}, stale-while-revalidate=${stale}`;
}

/** Per-request notes from the render: errors and fallbacks must not be shared
 * for the normal lifetime. Kept on globalThis so the RSC and SSR module graphs
 * and the Worker entry see the same store. */
export type EdgeHint = { skip: boolean; fallback: boolean };
const STORE = Symbol.for("collegestat.edge-cache-hint");
const scope = globalThis as { [STORE]?: AsyncLocalStorage<EdgeHint> };
export const edgeHints = (scope[STORE] ??= new AsyncLocalStorage<EdgeHint>());

/** The response shows an error or a retry state: serve it, never share it. */
export function skipEdgeCache() {
  const hint = edgeHints.getStore();
  if (hint) hint.skip = true;
}
/** The response used the bundled fallback; share it only briefly. */
export function shortEdgeCache() {
  const hint = edgeHints.getStore();
  if (hint) hint.fallback = true;
}
