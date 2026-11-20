import { countryName, type University } from "@/lib/domain";
import { establishedYear, institutionType } from "@/lib/institution-facts";
import { absoluteUrl } from "./site";
import { universityFactLines } from "./metadata";

/** Concise, sourced facts for answer engines. Only values the profile holds are included. */
export function universityFactsView(u: University) {
  const sources = new Map<string, string>();
  const addSource = (url: string | null | undefined, label: string) => {
    if (url && /^https?:\/\//.test(url) && !sources.has(url)) sources.set(url, label);
  };
  const facts = universityFactLines(u);
  facts.forEach((f) => addSource(f.href, f.id));
  addSource(u.website, "Official website");
  addSource(u.admissions_url, "Admissions");
  addSource(u.financial_aid_url, "Financial aid");
  addSource(u.reference_url, "Reference");
  u.history?.sources?.forEach((s) => addSource(s.url, s.label));
  return {
    name: u.name,
    slug: u.slug,
    url: absoluteUrl("/university/" + u.slug),
    country: countryName(u.country_code),
    country_code: u.country_code,
    city: u.city,
    type: institutionType(u),
    founded: establishedYear(u),
    website: u.website,
    summary: u.history?.history || u.description || null,
    key_facts: facts.map(({ id, value, detail, href }) => ({ id, value, detail: detail || undefined, source: href })),
    sources: [...sources].map(([url, label]) => ({ label, url })),
    note: "Figures are as reported by the linked sources; confirm requirements with the university before applying.",
  };
}
export type UniversityFactsView = ReturnType<typeof universityFactsView>;

export function universityFactsMarkdown(v: UniversityFactsView) {
  const line = (label: string, value: unknown) => (value ? `- ${label}: ${value}` : "");
  return [
    `# ${v.name}`,
    "",
    [line("Location", [v.city, v.country].filter(Boolean).join(", ")), line("Type", v.type), line("Founded", v.founded), line("Official website", v.website), line("CollegeStat profile", v.url)]
      .filter(Boolean)
      .join("\n"),
    ...(v.summary ? ["", "## Summary", "", v.summary] : []),
    ...(v.key_facts.length
      ? ["", "## Key facts", "", ...v.key_facts.map((f) => `- ${f.id}: ${f.value}${f.detail ? " (" + f.detail + ")" : ""}${f.source ? " — " + f.source : ""}`)]
      : []),
    ...(v.sources.length ? ["", "## Sources", "", ...v.sources.map((s) => `- [${s.label}](${s.url})`)] : []),
    "",
    `> ${v.note}`,
    "",
  ].join("\n");
}
