/** A cache every Worker isolate in a data center shares (Cloudflare Cache API),
 * for anonymous published data only. The in-isolate memo (public-read-cache)
 * is lost whenever Cloudflare starts a new isolate, so on the free Supabase
 * compute each new isolate re-ran the heavy summary and explore functions.
 * This keeps one result per data center for `ttlSeconds`.
 *
 * Outside Workers (dev, tests, scripts) `caches` is absent and this just loads.
 * Never pass session, account or staff data through here. */

const ORIGIN = "https://collegestat.xyz/__shared-read/";

function store(): Cache | undefined {
  try {
    if (typeof caches === "undefined") return undefined;
    return (caches as unknown as { default?: Cache }).default;
  } catch {
    return undefined;
  }
}

// Each deployment (and preview) gets its own entries, so a new build never reads
// result shapes stored by an older one.
const BUILD = process.env.COLLEGESTAT_BUILD_STAMP || "dev";

async function keyUrl(key: string) {
  const bytes = new TextEncoder().encode(BUILD + ":" + key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return ORIGIN + hex;
}

export async function sharedRead<Value>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<Value>,
): Promise<Value> {
  const cache = store();
  if (!cache) return load();
  let url: string;
  try {
    url = await keyUrl(key);
    const hit = await cache.match(url);
    if (hit) return (await hit.json()) as Value;
  } catch {
    return load();
  }
  const value = await load();
  try {
    await cache.put(
      url,
      new Response(JSON.stringify(value), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttlSeconds}`,
        },
      }),
    );
  } catch {
    // A failed store only costs the next isolate one database read.
  }
  return value;
}
