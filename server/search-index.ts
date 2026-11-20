import { prepareEngine, runSearch, type SearchEngine } from "@/lib/search/engine";
import { SEARCH_INDEX_DIR, SEARCH_META_FILE, SEARCH_SHARDS, searchShardFile, type IndexUni, type SearchMeta } from "@/lib/search/types";
import { assetJson, fromAssets } from "./asset-data";

/** The search index (scripts/build-search-index.ts), loaded once per isolate.
 *
 * Production: dist/client/data/search/*.json through the ASSETS binding, so the
 * Worker needs neither the bundled catalogue nor Supabase to search. Dev server
 * and tests: data/generated/search/ (written by `npm run catalogue`). */
async function file<T>(name: string): Promise<T> {
  if (!fromAssets) return assetJson<T>("generated/" + SEARCH_INDEX_DIR + "/" + name);
  const { env } = await import("cloudflare:workers");
  const assets = (env as { ASSETS?: { fetch(request: Request): Promise<Response> } }).ASSETS;
  if (!assets) throw new Error("ASSETS binding missing; cannot read the search index.");
  const response = await assets.fetch(new Request("https://assets.invalid/data/" + SEARCH_INDEX_DIR + "/" + name));
  if (!response.ok) throw new Error("Search index not published: " + name + " (" + response.status + ")");
  return response.json() as Promise<T>;
}

let engine: Promise<SearchEngine> | undefined;
export function searchEngine(): Promise<SearchEngine> {
  engine ??= Promise.all([
    file<SearchMeta>(SEARCH_META_FILE),
    ...Array.from({ length: SEARCH_SHARDS }, (_, n) => file<IndexUni[]>(searchShardFile(n))),
  ])
    .then(([meta, ...shards]) => prepareEngine(meta as SearchMeta, (shards as IndexUni[][]).flat()))
    .catch((error) => {
      engine = undefined;
      throw error;
    });
  return engine;
}

export { runSearch };
