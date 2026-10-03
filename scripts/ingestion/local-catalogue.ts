/** Offline, review-first normalization. Raw releases stay in data/raw; output is disposable. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { normalizeROR } from "./ror";

type Identity = { id: string; name: string; country_code: string; website: string | null; aliases: string[]; identifiers: Record<string,string>; source_url: string; source_record_id: string; retrieved_at: string; license_note: string; published: false };
type Candidate = { source: string; source_record_id: string; reason: string; proposed_name: string; possible_university_ids: string[] };
const sources = ["ror", "openalex", "wikidata", "scorecard", "ipeds", "carnegie", "leiden", "discover-uni"] as const;
type SourceName = typeof sources[number];
const args = process.argv.slice(2);
const arg = (key: string) => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1]; };
const source = arg("--source") as SourceName;
const inputPath = arg("--file");
const releaseUrl = arg("--release-url");
const licenseNote = arg("--license-note");
const retrievedAt = new Date().toISOString();
if (!sources.includes(source) || !inputPath || !releaseUrl?.startsWith("https://") || !licenseNote) throw new Error("Usage: npm run ingest:local -- --source ror|openalex|wikidata|scorecard|ipeds|carnegie|leiden|discover-uni --file data/raw/SOURCE/file.json --release-url https://... --license-note TEXT");
const file = resolve(inputPath);
if (!file.includes(`/data/raw/${source}/`)) throw new Error("Input must be inside data/raw/<source>/");
const raw: unknown = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(raw)) throw new Error("Expected an array of source records; convert CSV to JSON with the official dictionary first");
const uuid = (key: string) => { const h = createHash("sha256").update(`collegestat:${key}`).digest("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
const normalize = (value: unknown) => String(value ?? "").trim();
const domain = (url: string | null) => { try { return url ? new URL(url).hostname.replace(/^www\./, "").toLowerCase() : ""; } catch { return ""; } };
const rows: Identity[] = [];
const review: Candidate[] = [];
for (const item of raw) {
  if (!item || typeof item !== "object") { review.push({source,source_record_id:"",reason:"invalid_record",proposed_name:"",possible_university_ids:[]}); continue; }
  const r = item as Record<string,unknown>;
  if (source === "ror") {
    try {
      const n = normalizeROR(r);
      if (!n) continue;
      rows.push({id:uuid(n.external_id),name:n.name,country_code:n.country_code,website:n.proposed.website,aliases:n.proposed.aliases,identifiers:{ror:n.external_id},source_url:n.source_url,source_record_id:n.external_id,retrieved_at:retrievedAt,license_note:licenseNote,published:false});
    } catch { review.push({source,source_record_id:normalize(r.id),reason:"invalid_ror_record",proposed_name:"",possible_university_ids:[]}); }
    continue;
  }
  // Other feeds are staged as source records. They never create an institution by name.
  const ids = r.ids && typeof r.ids === "object" ? r.ids as Record<string,unknown> : {};
  const keys = [normalize(r.ror_id || ids.ror),normalize(r.openalex_id || ids.openalex),normalize(r.wikidata_id || ids.wikidata),normalize(r.unitid || r.UNITID),normalize(r.ukprn || r.UKPRN)].filter(Boolean);
  const name = normalize(r.name || r.display_name || r.INSTNM || r.provider_name || r.university);
  const country = normalize(r.country_code || r.country || r.STABBR);
  review.push({source,source_record_id:normalize(r.id || r.UNITID || r.UKPRN || r.institution_id),reason:keys.length ? "identifier_mapping_required" : "missing_stable_identifier",proposed_name:name,possible_university_ids:[]});
  if (!name || !country) review[review.length-1].reason = "missing_identity_fields";
}
const existingPath = resolve("supabase/reference-catalogue.json");
const existing = JSON.parse(await readFile(existingPath,"utf8")) as Array<{id:string;name:string;country_code:string;website:string|null}>;
const normalizedNames = (v:string) => v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();
for (const row of rows) {
  const possible = existing.filter(e => e.country_code === row.country_code && (normalizedNames(e.name) === normalizedNames(row.name) || (domain(e.website) && domain(e.website) === domain(row.website))));
  if (possible.length) review.push({source,source_record_id:row.source_record_id,reason:"possible_existing_institution_review_required",proposed_name:row.name,possible_university_ids:possible.map(p=>p.id)});
}
const output = resolve("data/processed"); await mkdir(output,{recursive:true});
const label = `${source}-${basename(file).replace(/[^a-z0-9.-]/gi,"-")}`;
await writeFile(resolve(output,`${label}.json`),JSON.stringify({source,release_url:releaseUrl,retrieved_at:retrievedAt,license_note:licenseNote,universities:rows,review_queue:review},null,2));
console.log(JSON.stringify({source,identities:rows.length,review:review.length,output:`data/processed/${label}.json`}));
