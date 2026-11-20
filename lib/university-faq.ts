import { profileKeyFacts, type KeyFact } from "./profile-key-facts";
import type { University } from "./domain";
import { translate, type MessageKey } from "./i18n/messages";
import { displayName } from "./university-display-name";

/** FAQ entries built only from the profile's key facts, so every answer is a
 * sourced figure. Rendered on the page (translated) and as FAQPage JSON-LD. */
export type FaqId = "admission" | "sat" | "english" | "tuition" | "deadline";
const ORDER: FaqId[] = ["admission", "sat", "english", "tuition", "deadline"];

export function faqFacts(u: University, today?: string): KeyFact[] {
  const facts = profileKeyFacts(u, today);
  return ORDER.flatMap((id) => facts.filter((f) => f.id === id));
}

/** Source and freshness line for the bottom of the profile. */
export function profileSources(u: University) {
  const links: { label: string; url: string }[] = [];
  const add = (label: string, url?: string | null) => {
    if (url && /^https?:\/\//.test(url) && !links.some((l) => l.url === url)) links.push({ label, url });
  };
  add("official", u.website);
  add("admissions", u.admissions_url);
  add("requirements", u.application_brief?.requirements_source);
  if (u.scorecard) add("scorecard", "https://collegescorecard.ed.gov/");
  if (u.us_stats) add("ipeds", "https://nces.ed.gov/ipeds/");
  const dates = [(u as { updated_at?: string }).updated_at, u.application_brief?.checked_at, u.reference_retrieved_at]
    .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    .map((d) => d.slice(0, 10))
    .sort();
  return { links: links.slice(0, 5), updated: dates[dates.length - 1] || null };
}

const EN_NOTES: Record<string, string> = { per_year: "per year", out_of_state: "out-of-state rate", minimum: "minimum", varies: "varies by course", mid50: "middle 50%", average: "average" };
/** The same questions in English, for FAQPage structured data. */
export function universityFaqEnglish(u: University) {
  const name = u.short_name || displayName(u.name);
  return faqFacts(u).map((f) => {
    const detail = f.detail.map((p) => (typeof p === "string" ? p : EN_NOTES[p.t])).join(", ") || "—";
    return {
      question: translate("en", ("oc.faq." + f.id + ".q") as MessageKey, { name }),
      answer: translate("en", ("oc.faq." + f.id + ".a") as MessageKey, { name, value: f.value, detail }),
    };
  });
}

/** Newest check date (YYYY-MM-DD) among the records behind one block. */
export function lastChecked(records: { verified_at?: string | null; evidence?: { retrieved_at?: string } | null }[], extra: (string | null | undefined)[] = []) {
  const dates = [...records.flatMap((r) => [r.verified_at, r.evidence?.retrieved_at]), ...extra]
    .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    .map((d) => d.slice(0, 10))
    .sort();
  return dates[dates.length - 1] || null;
}
