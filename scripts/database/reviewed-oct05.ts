/** Build a bounded, additive import receipt. Never connects or executes SQL.
 * Existing university IDs, evidence, user work and publisher positions survive.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { globalCatalogue } from "../../server/global-catalogue";
import { universityRanks } from "../../lib/ranking-highlights";
import { rankingSystems } from "../../lib/ranking-systems";
import identities from "../../data/published/reviewed-identity-expansion.json";
import aliases from "../../data/published/reviewed-ranking-aliases.json";
import regional from "../../data/published/regional-rankings.json";
import profiles from "../../data/published/profile-enrichment.json";
import requirements from "../../data/published/requirements-current.json";
import columnsJSON from "./catalogue-columns.json";

type Row = Record<string, unknown>;
const columns = columnsJSON as Record<string, string[]>;
const literal = (v: unknown): string => v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : "'" + (typeof v === "object" ? JSON.stringify(v) : String(v)).replaceAll("'", "''") + "'";
const id = (table: string, value: string) => {
  if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) return value;
  const h = createHash("sha256").update("collegestat:" + table + ":" + value).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
};
const sql = ["-- Oct 5 reviewed additions. No deletions, schema replacement or user-data writes.", "begin;"];
const counts: Record<string, number> = {};
const inserted = new Map<string, string>();
function insert(table: string, input: Row) {
  const allowed = columns[table] || Object.keys(input);
  const keys = Object.keys(input).filter(k => allowed.includes(k));
  const signature = JSON.stringify(Object.fromEntries(keys.map(k => [k, input[k]])));
  const identity = table + ":" + input.id;
  if (inserted.has(identity)) {
    if (inserted.get(identity) !== signature) throw new Error("Conflicting receipt identity: " + identity);
    return;
  }
  inserted.set(identity, signature);
  sql.push(`insert into public.${table} (${keys.join(",")}) values (${keys.map(k => literal(input[k])).join(",")}) on conflict do nothing;`);
  counts[table] = (counts[table] || 0) + 1;
}
function source(url: string, name: string, kind = "official") {
  const sid = id("data_sources", "oct05:" + url);
  insert("data_sources", { id: sid, url, name, organization: name, source_type: kind, trust_level: kind === "secondary" ? "medium" : "high", retrieved_at: "2026-10-05", license_notes: "Attributed factual selection; no licence to reproduce a publisher's complete dataset or site imagery is implied." });
  return sid;
}
const reviewedRORs = new Set(identities.records.map(r => r.ror));
const added = globalCatalogue.filter(u => reviewedRORs.has(u.identifiers?.ror || ""));
if (added.length !== 15) throw new Error("Unexpected reviewed identity scope");
const resourceKeys = ["social_links", "contact_email", "contact_source_url", "social_source_url", "official_web", "application_brief", "reported_programs", "research_identity", "publisher_students", "admission_summary"];
for (const u of added) {
  const resources = Object.fromEntries(resourceKeys.map(k => [k, u[k as keyof typeof u] ?? null]));
  insert("universities", {...u, published: true, profile_resources: {...resources, rankings: universityRanks(u), country_name: new Intl.DisplayNames(["en"], {type:"region"}).of(u.country_code)}});
}
// Only repair the two proven null classifications; retain any editor's choice.
for (const [slug, unitid] of [["mit", "166683"], ["stanford", "243744"]]) {
  const u = globalCatalogue.find(u => u.slug === slug)!;
  if (u.university_type !== "Private" || u.identifiers?.ipeds !== unitid) throw new Error("IPEDS type guard failed");
  sql.push(`update public.universities set university_type='Private' where id=${literal(u.id)} and university_type is null and identifiers->>'ipeds'=${literal(unitid)};`);
}
for (const a of aliases.aliases) {
  const u = globalCatalogue.find(u => u.identifiers?.ror === a.ror && u.country_code === a.country)!;
  if (!u) throw new Error("Reviewed alias lacks identity");
  for (const name of a.names) sql.push(`update public.universities set aliases=coalesce(aliases,'[]'::jsonb)||${literal([name])}::jsonb where id=${literal(u.id)} and not coalesce(aliases,'[]'::jsonb) @> ${literal([name])}::jsonb;`);
}
for (const restored of aliases.restored) {
  const u = globalCatalogue.find(u => u.id === restored.university_id)!;
  const rank = u.rankings?.find(r => r.provider === restored.provider && r.year === restored.year);
  // The profile highlight retains latest editions; retrieve historical raw rows separately.
  const all = (await import("../../data/published/ranking-all.json")).default;
  const entry = rank || all.find(r => r.university_id === u.id && r.provider === restored.provider && r.year === restored.year);
  if (!entry) throw new Error("Restored record missing");
  sql.push(`update public.universities set profile_resources=jsonb_set(coalesce(profile_resources,'{}'::jsonb),'{rankings}',coalesce(profile_resources->'rankings','[]'::jsonb)||${literal([entry])}::jsonb) where id=${literal(u.id)} and not exists(select 1 from jsonb_array_elements(coalesce(profile_resources->'rankings','[]'::jsonb)) r where r->>'provider'=${literal(restored.provider)} and r->>'year'=${literal(String(restored.year))});`);
}
for (const p of rankingSystems) insert("ranking_providers", {id:id("ranking_providers",p.slug), slug:p.slug, name:p.name, website:p.url, license_status:["leiden","qs"].includes(p.slug) ? "permitted" : "restricted", methodology:p.slug === "qs" ? p.category + "; attributed regional factual selections only. Complete dataset reuse is not licensed; each edition requires separate publication permission." : p.category});
const byHost = new Map(globalCatalogue.flatMap(u => {
  try { const host = new URL(u.website || "").hostname.replace(/^www\./, ""); return [[host === "nus.edu" ? "nus.edu.sg" : host, u] as const]; } catch { return []; }
}));
for (const r of regional) {
  const u = byHost.get(r.domain);
  if (!u) throw new Error("Regional identity missing: " + r.domain);
  const eid = id("ranking_editions", `qs:${r.scope}:${r.year}`);
  insert("ranking_editions", {id:eid, provider_id:id("ranking_providers","qs"), year:r.year, subject:"Overall", region:r.scope, permitted:true});
  const sid = source(r.source_url, `QS ${r.scope} ${r.year} · sourced position selection`, "ranking");
  insert("ranking_entries", {id:id("ranking_entries",eid+":"+u.id), university_id:u.id, edition_id:eid, source_id:sid, year:r.year, rank:Number(r.rank_label.match(/^=?([0-9]+)/)?.[1]), rank_label:r.rank_label, verification_status:"verified", verified_at:r.checked_at, confidence:"high", notes:"Partial cited selection of published positions. Ties are retained. Region methodology differs from the world ranking."});
}
const enriched = new Set([...added.map(u => u.id), "819bd7c2-cc38-5dc4-854d-2d59a8a9f4e5"]);
for (const uid of enriched) {
  const p = (profiles as Record<string, {socials?: Row[]; media?: Row[]; retrieved_at:string}>)[uid];
  if (!p) continue;
  const u = globalCatalogue.find(u => u.id === uid)!;
  for (const m of p.media || []) {
    const sid = source(String(m.source_url), u.name + " · attributed Commons media", "secondary");
    insert("media", {...m, id:id("media","oct05:"+uid+":"+m.source_url), university_id:uid, source_id:sid, verification_status:"verified", verified_at:p.retrieved_at, reuse_permitted:true, license_url:String(m.license_url).replace(/^http:\/\//,"https://"), notes:"Institutional media identified via Wikidata and licence-checked Commons. Capture date is distinct from retrieval."});
    if (m.kind === "logo") sql.push(`update public.universities set logo_url=${literal(m.url)},logo_source_url=${literal(m.source_url)},logo_usage_notes=${literal(m.license + "; institutional trademarks retained")} where id=${literal(uid)} and logo_url is null;`);
  }
  for (const social of u.social_links || []) sql.push(`update public.universities set profile_resources=jsonb_set(coalesce(profile_resources,'{}'::jsonb),'{social_links}',coalesce(profile_resources->'social_links','[]'::jsonb)||${literal([social])}::jsonb) where id=${literal(uid)} and not exists(select 1 from jsonb_array_elements(coalesce(profile_resources->'social_links','[]'::jsonb)) s where s->>'url'=${literal(social.url)});`);
}
const inha = added.find(u => u.website?.includes("inha.uz"))!;
for (const r of requirements.filter(r => r.university_id === inha.id)) {
  insert("data_sources", {...r.data_sources, trust_level:"high"});
  insert("requirements", r);
}
for (const p of inha.university_programs) {
  const pid = id("programs",p.programs.id);
  insert("programs", {...p.programs, id:pid});
  const sid = source(p.source_url!, "Inha University in Tashkent · Korean-track undergraduate programs");
  insert("university_programs", {id:id("university_programs",inha.id+":"+pid), university_id:inha.id, program_id:pid, source_id:sid, source_url:p.source_url, verification_status:"verified", verified_at:p.verified_at});
}
sql.push("commit;");
await mkdir("outputs", {recursive:true});
await writeFile("outputs/reviewed-oct05.sql", sql.join("\n") + "\n");
await writeFile("outputs/reviewed-oct05-plan.json", JSON.stringify({counts, identityCount:added.length, regionalPositions:regional.length, preserved:"all pre-existing rows and user work", sqlSHA256:createHash("sha256").update(sql.join("\n")+"\n").digest("hex")},null,2)+"\n");
console.log(JSON.stringify({identities:added.length,regionalPositions:regional.length,counts}));
