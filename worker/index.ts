import handler from "vinext/server/fetch-handler";
import {
  edgeCachePolicy,
  edgeHints,
  edgeLifetime,
  pageCacheControl,
  type EdgeHint,
  type EdgePolicy,
} from "../server/edge-cache";

/** Production Worker: the vinext app behind a data-center edge cache for
 * public, user-independent pages (server/edge-cache.ts decides which). */

type Handler = {
  fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
};
const app = handler as unknown as Handler;
// A new deployment ships new hashed scripts; never serve HTML from an older one.
const BUILD = process.env.COLLEGESTAT_BUILD_STAMP || "dev";
const STORED_AT = "x-collegestat-edge-stored";
const FRESH_UNTIL = "x-collegestat-edge-fresh";
const CLIENT_CONTROL = "x-collegestat-client-cache-control";
const CLIENT_VARY = "x-collegestat-client-vary";
const refreshing = new Set<string>();
const edgeStore = () => (caches as unknown as { default: Cache }).default;
// The language cookie and Accept-Language select the cached HTML.
const PAGE_VARY =
  "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url, X-Vinext-Interception-Context, X-Vinext-Mounted-Slots, X-Vinext-Rsc-Render-Mode, Accept-Language, Cookie";

async function render(request: Request, env: unknown, ctx: ExecutionContext) {
  const hint: EdgeHint = { skip: false, fallback: false };
  const response = await edgeHints.run(hint, () => app.fetch(request, env, ctx));
  return { response, hint };
}

/** Render, return the response, and store a copy once its body has streamed. */
async function renderAndStore(
  request: Request,
  env: unknown,
  ctx: ExecutionContext,
  policy: EdgePolicy,
) {
  const { response, hint } = await render(request, env, ctx);
  // The lifetime is decided after the body completes: an error reported while
  // streaming (instrumentation.ts) still keeps the page out of the cache.
  if (response.status !== 200 || !response.body) return response;
  const [client, copy] = response.body.tee();
  const headers = new Headers(response.headers);
  const preliminary = edgeLifetime(policy, response, hint);
  if (preliminary && policy.kind === "page") {
    headers.set("Cache-Control", pageCacheControl(preliminary));
    headers.set("Vary", PAGE_VARY);
  }
  if (preliminary) {
    headers.set("X-Edge-Cache", "MISS");
    // Seconds this render will be shared fresh; a short one means the bundled
    // fallback was used (scripts/warm-cache.mjs re-requests those).
    headers.set("X-Edge-Ttl", String(preliminary.fresh));
  }
  ctx.waitUntil(
    (async () => {
      const body = await new Response(copy).arrayBuffer();
      const lifetime = edgeLifetime(policy, response, hint);
      if (!lifetime) return;
      const stored = new Headers(headers);
      const now = Date.now();
      if (policy.kind === "page")
        stored.set("Cache-Control", pageCacheControl(lifetime));
      stored.delete("X-Edge-Cache");
      stored.delete("X-Edge-Ttl");
      stored.set(STORED_AT, String(now));
      stored.set(FRESH_UNTIL, String(now + lifetime.fresh * 1000));
      // The Cache API keeps the entry for the whole stale window; freshness is
      // checked against FRESH_UNTIL on lookup.
      const entry = new Response(body, { status: 200, headers: stored });
      entry.headers.set(
        "Cache-Control",
        `public, max-age=${lifetime.fresh + lifetime.stale}`,
      );
      entry.headers.set(CLIENT_CONTROL, stored.get("Cache-Control") || "");
      // Vary is part of the key above; the Cache API does not match on it.
      entry.headers.set(CLIENT_VARY, stored.get("Vary") || "");
      entry.headers.delete("Vary");
      await edgeStore().put(policy.key, entry);
    })().catch(() => {}),
  );
  return new Response(client, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function fromCache(entry: Response, state: "HIT" | "STALE") {
  const headers = new Headers(entry.headers);
  headers.set("Cache-Control", headers.get(CLIENT_CONTROL) || "public, max-age=0");
  if (headers.get(CLIENT_VARY)) headers.set("Vary", headers.get(CLIENT_VARY)!);
  headers.delete(CLIENT_CONTROL);
  headers.delete(CLIENT_VARY);
  const age = Math.max(0, Math.round((Date.now() - Number(headers.get(STORED_AT))) / 1000));
  headers.delete(STORED_AT);
  headers.delete(FRESH_UNTIL);
  headers.set("Age", String(age));
  headers.set("X-Edge-Cache", state);
  return new Response(entry.body, { status: entry.status, headers });
}

const worker = {
  ...(handler as object),
  async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    const policy = edgeCachePolicy(request, BUILD);
    if (!policy || BUILD === "dev" || typeof caches === "undefined")
      return app.fetch(request, env, ctx);
    let entry: Response | undefined;
    try {
      entry = await edgeStore().match(policy.key);
    } catch {
      entry = undefined;
    }
    if (!entry) return renderAndStore(request, env, ctx, policy);
    if (Date.now() < Number(entry.headers.get(FRESH_UNTIL)))
      return fromCache(entry, "HIT");
    if (!refreshing.has(policy.key)) {
      refreshing.add(policy.key);
      ctx.waitUntil(
        renderAndStore(new Request(request), env, ctx, policy)
          .then((fresh) => fresh.body?.cancel())
          .catch(() => {})
          .finally(() => refreshing.delete(policy.key)),
      );
    }
    return fromCache(entry, "STALE");
  },
};

export default worker;
