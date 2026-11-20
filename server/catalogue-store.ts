// Runtime access to the precomputed local catalogue (scripts/build-catalogue.ts).
// Each file is its own lazily imported module, so a profile page parses one
// ~1 MB shard instead of building 14k profiles from ~40 source files.
import type { University, Scholarship } from "@/lib/domain";
import { shardOf } from "@/lib/catalogue-shards";
import { withAutoLogos } from "./auto-logos";
import { withTuition } from "./tuition-index";
import { assetJson, fromAssets } from "./asset-data";

type Loader<T> = () => Promise<T>;
type Featured = { reference: string[]; landing: University[]; scholarships: Scholarship[] };

// Dev, tests and scripts read the generated files from data/. A production
// Worker reads only the landing snapshot, from its static assets: the full list
// (50 MB) and the profile shards (110 MB) are not published, because production
// serves profiles, search and explore from Supabase (NEXT_PUBLIC_CATALOGUE_SOURCE=supabase).
const unpublished = () => Promise.reject(new Error("The bundled catalogue is not published with this deployment."));
const file = <T>(name: string, published = false): Loader<T> => {
  if (fromAssets && !published) return unpublished;
  let p: Promise<T> | undefined;
  return () => (p ??= assetJson<T>("generated/catalogue/" + name).catch((e) => ((p = undefined), Promise.reject(e))));
};
const shardFile = (n: number) => file<Record<string, University>>(`shard-${String(n).padStart(2, "0")}.json`);
const shardCache = new Map<number, Loader<Record<string, University>>>();
function shard(slug: string) {
  const n = shardOf(slug);
  let load = shardCache.get(n);
  if (!load) shardCache.set(n, (load = shardFile(n)));
  return load();
}

export const catalogueList = file<University[]>("list.json");
const catalogueIds = file<Record<string, string>>("ids.json");
const featured = file<Featured>("featured.json", true);

export async function universityBySlug(slug: string) {
  return (await shard(slug))[slug];
}

export async function universitiesByIds(ids: readonly string[]) {
  const map = await catalogueIds();
  const rows = await Promise.all(ids.map((id) => (map[id] ? universityBySlug(map[id]) : undefined)));
  // Compare reads one international tuition figure; fill it from the tuition index when a record has none.
  return rows.filter((u): u is University => !!u).map(withTuition);
}

/** The landing catalogue and reference scholarships for the root layout. */
export async function landingCatalogue() {
  const f = await featured();
  // Every page hydrates these rows; resolve logos here so the browser never
  // needs the id-to-icon map for them.
  return { universities: withAutoLogos(f.landing), scholarships: f.scholarships };
}

/** The default rows the catalog API shows before a search. */
export async function referenceRows() {
  const [f, list] = await Promise.all([featured(), catalogueList()]);
  const byId = new Map(list.map((u) => [u.id, u]));
  return f.reference.flatMap((id) => byId.get(id) ?? []);
}
