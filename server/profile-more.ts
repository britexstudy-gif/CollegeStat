import links from "@/data/review/scholarship-university-links-nov14.json";
import { allScholarships } from "@/lib/scholarships-load";
import { allArticles } from "@/lib/articles-load";
import { assetJson } from "./asset-data";
import type { ProfileFacts, ProfileGuide, ProfileMore, ProfileScholarship } from "./profile-extras";

/** Per-university additions to the profile: open facts, linked scholarships and
 * country guides. Everything is resolved here so the browser gets one small prop. */

// ── Wikidata facts: 64 small shards, only the one holding this id is loaded ──
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const shardOf = (id: string) => String(parseInt(id.slice(0, 2), 16) % 64).padStart(2, "0");
const shardFile = (id: string) => assetJson<Record<string, Row>>("published/wikidata-facts-nov14-shards/" + shardOf(id) + ".json");

const generic = /^(university|universities|college|higher education institution|educational institution|institution|school|academic institution|educational organization|organization|business|public body)$/i;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function typeLabel(types: string[]): string | null {
  const useful = types.filter((x) => !generic.test(x.trim()));
  if (!useful.length) return null;
  const pick = useful.find((x) => /^(public|private)\b/i.test(x)) || useful[0];
  return pick.length <= 48 ? cap(pick) : null;
}

async function factsFor(id: string): Promise<ProfileFacts | undefined> {
  const r = (await shardFile(id))[id];
  if (!r) return undefined;
  const out: ProfileFacts = {};
  const dated = (f: Row) => ({ date: (f.date as string | null) ?? null, source_url: f.source_url as string });
  if (r.students) out.students = { value: r.students.value, ...dated(r.students) };
  if (r.academic_staff) out.academic_staff = { value: r.academic_staff.value, ...dated(r.academic_staff) };
  if (r.employees) out.employees = { value: r.employees.value, ...dated(r.employees) };
  if (r.founded) out.founded = { year: r.founded.year, source_url: r.founded.source_url };
  const type = r.types && typeLabel(r.types.value);
  if (type) out.type = { value: type, source_url: r.types.source_url };
  if (r.affiliations?.value?.[0]) out.affiliation = { value: r.affiliations.value[0], source_url: r.affiliations.source_url };
  if (r.motto) out.motto = { value: r.motto.value, source_url: r.motto.source_url };
  if (r.campus_area) out.campus_area_km2 = { value: r.campus_area.value_km2, source_url: r.campus_area.source_url };
  if (r.coordinates) out.coordinates = { lat: r.coordinates.lat, lon: r.coordinates.lon, source_url: r.coordinates.source_url };
  if (r.endowment) out.endowment = { amount: r.endowment.amount, currency: r.endowment.currency, ...dated(r.endowment) };
  return Object.keys(out).length ? out : undefined;
}

// ── Scholarships linked to this university (verified records only) ──
const linkedSlugs = new Map<string, Set<string>>();
for (const l of links as { scholarship_slug: string; university_ids: string[] }[])
  for (const id of l.university_ids) linkedSlugs.set(id, new Set([...(linkedSlugs.get(id) || []), l.scholarship_slug]));

function scholarshipsFor(id: string, slug: string): ProfileScholarship[] {
  const via = linkedSlugs.get(id);
  return allScholarships
    .filter((s) => via?.has(s.slug) || s.universities.some((u) => u.slug === slug))
    .sort((a, b) => Number(b.openToAll || b.eligibleCodes.length > 0) - Number(a.openToAll || a.eligibleCodes.length > 0) || Number(b.funding === "full") - Number(a.funding === "full"))
    .slice(0, 4)
    .map((s) => ({ slug: s.slug, name: s.name, provider: s.provider, covers: s.covers, funding: s.funding, deadline: s.deadline }));
}

// ── Guides for applying to the university's country ──
function guidesFor(country: string): ProfileGuide[] {
  return allArticles
    .filter((a) => a.countryCode === country)
    .sort((a, b) => Number(b.centralAsia) - Number(a.centralAsia) || Number(b.featured) - Number(a.featured) || (b.publishedAt || "").localeCompare(a.publishedAt || ""))
    .slice(0, 4)
    .map((a) => ({ slug: a.slug, title: a.title, publisher: a.publisher, minutes: a.readingMinutes, url: a.kind === "external" ? a.url : null }));
}

/** Start reading the facts shard for a profile that is about to render, so it
 * loads alongside the profile's other per-record datasets. */
export function warmProfileMore(id: string) {
  void shardFile(id).catch(() => {});
}

export async function profileMore(u: { id: string; slug: string; country_code: string }): Promise<ProfileMore> {
  const facts = await factsFor(u.id).catch(() => undefined);
  const scholarships = scholarshipsFor(u.id, u.slug);
  const guides = guidesFor(u.country_code);
  return { facts, scholarships: scholarships.length ? scholarships : undefined, guides: guides.length ? guides : undefined };
}
