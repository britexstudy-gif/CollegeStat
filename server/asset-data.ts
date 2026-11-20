import { KEYED_DATASETS, bucketOf, bucketPath, type KeyedDataset } from "@/lib/asset-datasets";

/** Read-only datasets that are too large for the Worker bundle.
 *
 * Production: fetched from the static assets (dist/client/data) through the
 * ASSETS binding and kept per isolate. Vite dev and plain Node (tests,
 * scripts): read straight from data/. Which datasets exist is declared in
 * lib/asset-datasets.ts. */

const env = (import.meta as { env?: { PROD?: boolean } }).env;
/** True in a production build: datasets come from the static assets, not data/. */
export const fromAssets = !!env?.PROD;
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = load().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, hit);
  }
  return hit;
}

async function readLocal(file: string): Promise<unknown> {
  if (env) {
    // Empty in a production build (build/asset-data-dev-plugin.ts).
    const { devFiles } = await import("./asset-data-dev");
    const load = devFiles["../data/" + file];
    if (!load) throw new Error("Dataset not found: " + file);
    return load();
  }
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(new URL("../data/" + file, import.meta.url), "utf8"));
}

async function readAsset(file: string): Promise<unknown> {
  const { env: bindings } = await import("cloudflare:workers");
  const assets = (bindings as { ASSETS?: { fetch(request: Request): Promise<Response> } }).ASSETS;
  if (!assets) throw new Error("ASSETS binding missing; cannot read dataset " + file);
  const response = await assets.fetch(new Request("https://assets.invalid/data/" + file));
  if (!response.ok) throw new Error("Dataset not published: " + file + " (" + response.status + ")");
  return response.json();
}

/** One published JSON file, parsed once per isolate. */
export function assetJson<T>(file: string): Promise<T> {
  return cached(file, () => (fromAssets ? readAsset(file) : readLocal(file))) as Promise<T>;
}

const keyedLocal = new Map<string, Record<string, unknown>>();
/** One record of a keyed dataset (see KEYED_DATASETS) by university id. */
export async function assetRecord<T>(dataset: KeyedDataset, id: string): Promise<T | undefined> {
  if (fromAssets) return (await assetJson<Record<string, T>>(bucketPath(dataset, bucketOf(id))))[id];
  let records = keyedLocal.get(dataset);
  if (!records) {
    records = (KEYED_DATASETS[dataset] as (d: never) => Record<string, unknown>)(await assetJson<never>(dataset));
    keyedLocal.set(dataset, records);
  }
  return records[id] as T | undefined;
}
