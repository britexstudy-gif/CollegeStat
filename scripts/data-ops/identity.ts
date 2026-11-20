// University identity: catalogue ids, lookup by slug / name, and true-duplicate detection.
import { existsSync } from "node:fs";
import { path, readJson, str } from "../ingest/lib";
import { normName } from "./normalise";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Identity {
  id: string;
  slug: string | null;
  name: string;
  country_code: string | null;
  city: string | null;
  website: string | null;
  aliases: string[];
  rankings: number;
  unitid: string | null;
  ror: string | null;
  domains: string[];
}

export function loadIdentities(): Map<string, Identity> {
  const map = new Map<string, Identity>();
  for (const u of readJson<Any[]>("data/generated/catalogue/list.json")) {
    map.set(u.id, {
      id: u.id, slug: str(u.slug), name: u.name, country_code: str(u.country_code), city: str(u.city), website: str(u.website),
      aliases: (u.aliases ?? []).filter((a: unknown) => typeof a === "string"), rankings: (u.rankings ?? []).length,
      unitid: null, ror: str(u.identifiers?.ror), domains: [],
    });
  }
  if (existsSync(path("data/published/global-directory.json"))) {
    for (const g of readJson<Any[]>("data/published/global-directory.json")) {
      const i = map.get(g.id);
      if (!i) continue;
      i.unitid = g.unitid ? String(g.unitid) : null;
      i.ror ??= str(g.ror);
      i.domains = (g.domains ?? []).filter((d: unknown) => typeof d === "string").map((d: string) => d.toLowerCase().replace(/^www\./, ""));
      i.website ??= str(g.website);
    }
  }
  return map;
}

export const hostOf = (url: string | null) => {
  if (!url) return null;
  try { return new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
};

/** Resolves ids that are not catalogue ids (slug, then unique name+country). */
export class IdentityIndex {
  private bySlug = new Map<string, string>();
  private byName = new Map<string, string[]>();
  constructor(readonly ids: Map<string, Identity>) {
    for (const i of ids.values()) {
      if (i.slug) this.bySlug.set(i.slug, i.id);
      const k = `${i.country_code}|${normName(i.name)}`;
      this.byName.set(k, [...(this.byName.get(k) ?? []), i.id]);
    }
  }
  resolve(o: { university_id: string | null; slug?: string | null; name?: string | null; country_code?: string | null }): string | null {
    if (o.university_id && this.ids.has(o.university_id)) return o.university_id;
    if (o.slug && this.bySlug.has(o.slug)) return this.bySlug.get(o.slug)!;
    if (o.name && o.country_code) {
      const hits = this.byName.get(`${o.country_code}|${normName(o.name)}`);
      if (hits?.length === 1) return hits[0];
    }
    return null;
  }
}

/** True duplicates: same IPEDS unitid, same ROR, or same name + country + domain. Different campuses
 * (different names or domains) stay separate. Returns groups of ≥2 ids. */
export function duplicateGroups(ids: Map<string, Identity>): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  for (const id of ids.keys()) parent.set(id, id);
  const keyed = new Map<string, string>();
  const link = (key: string, id: string, guard?: (a: Identity, b: Identity) => boolean) => {
    const prev = keyed.get(key);
    if (!prev) keyed.set(key, id);
    else if (!guard || guard(ids.get(prev)!, ids.get(id)!)) union(prev, id);
  };
  // Same name + domain but a different IPEDS unitid or a different city = another campus, not a duplicate.
  const sameCampus = (a: Identity, b: Identity) =>
    !(a.unitid && b.unitid && a.unitid !== b.unitid) && !(a.city && b.city && normName(a.city) !== normName(b.city));
  for (const i of ids.values()) {
    if (i.unitid) link(`unitid:${i.unitid}`, i.id);
    if (i.ror) link(`ror:${i.ror}`, i.id);
    const name = normName(i.name);
    for (const d of new Set([...i.domains, hostOf(i.website)].filter((x): x is string => !!x))) link(`ncd:${i.country_code}|${name}|${d}`, i.id, sameCampus);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids.keys()) { const r = find(id); groups.set(r, [...(groups.get(r) ?? []), id]); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort());
}
