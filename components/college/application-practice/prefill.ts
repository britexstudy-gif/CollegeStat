/** Fills a practice form from the student's profile. Only fields the student
 * has never touched are filled, so their own edits always win. No React. */
import { itemKey, valueKey, type SectionDef, type Values } from "./forms";

export type PracticeProfile = {
  name?: string;
  email?: string;
  /** Country name, already localised by the caller. */
  country?: string;
  city?: string;
  school?: string;
  /** Onboarding certificate id: attestat, ib, alevel, ap, other. */
  certificate?: string;
  grade?: string;
  gradeMax?: number;
  sat?: string;
  act?: string;
  english?: { test: string; score: string };
  activities?: { type: string; role: string; org: string; hours: string; weeks: string; grades: string[]; description: string }[];
  honours?: { title: string; level: string; grade: string }[];
};

const CURRICULUM: Record<string, string> = { attestat: "national", ib: "ib", alevel: "alevel", ap: "ap", other: "other" };
/** Onboarding activity types onto the practice form's categories. */
const ACTIVITY: Record<string, string> = {
  academic: "academic",
  research: "research",
  coding: "stem",
  volunteering: "community",
  debate: "academic",
  leadership: "other",
  sport: "athletics",
  arts: "art",
  work: "work",
  startup: "career",
  family: "family",
  other: "other",
};
const LEVEL: Record<string, string> = { school: "school", region: "regional", national: "national", international: "international" };
const ENGLISH = new Set(["ielts", "toefl", "duolingo"]);

function fieldValues(p: PracticeProfile): Record<string, string> {
  const [first, ...rest] = (p.name || "").trim().split(/\s+/);
  const english = p.english && ENGLISH.has(p.english.test) ? p.english : null;
  const out: Record<string, string | undefined> = {
    first_name: first,
    last_name: rest.join(" "),
    email: p.email,
    nationality: p.country,
    residence: p.country,
    address: p.city,
    city: p.city,
    school: p.school,
    school_country: p.country,
    curriculum: p.certificate ? CURRICULUM[p.certificate] : undefined,
    qualification: p.certificate ? CURRICULUM[p.certificate] : undefined,
    gpa: p.grade,
    gpa_scale: p.grade && p.gradeMax ? String(p.gradeMax) : undefined,
    grades: p.grade && p.gradeMax ? `${p.grade} / ${p.gradeMax}` : p.grade,
    sat_total: p.sat,
    act: p.act,
    report_scores: p.sat || p.act ? "yes" : undefined,
    english_test: english?.test,
    english_score: english?.score,
  };
  return Object.fromEntries(Object.entries(out).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== ""));
}

/** Values to add: profile answers for every untouched field of these sections. */
export function prefillValues(sections: SectionDef[], profile: PracticeProfile, current: Values): Values {
  const plain = fieldValues(profile);
  const add: Values = {};
  const put = (key: string, value: string | undefined) => {
    if (value === undefined || value === "" || key in current) return;
    add[key] = value;
  };
  for (const s of sections) {
    for (const f of s.fields || []) {
      // University-specific fields (col.<id>.plan) are the student's own choices.
      if (f.id.includes(".")) continue;
      const v = plain[f.id];
      if (v === undefined) continue;
      if ((f.type === "select" || f.type === "radio") && !f.options?.some((o) => o.value === v)) continue;
      if (f.max && v.length > f.max) continue;
      put(valueKey(s.id, f.id), v);
    }
    if (s.id === "activities" && s.repeat?.fields.some((x) => x.id === "position"))
      (profile.activities || []).slice(0, s.repeat.count).forEach((a, i) => {
        put(itemKey(s.id, i, "type"), ACTIVITY[a.type] || "other");
        put(itemKey(s.id, i, "position"), a.role.slice(0, 50) || undefined);
        put(itemKey(s.id, i, "org"), a.org.slice(0, 100) || undefined);
        put(itemKey(s.id, i, "description"), a.description.slice(0, 150) || undefined);
        put(itemKey(s.id, i, "grades"), a.grades.join(", ").slice(0, 20) || undefined);
        put(itemKey(s.id, i, "hours"), a.hours || undefined);
        put(itemKey(s.id, i, "weeks"), a.weeks || undefined);
      });
    if (s.id === "honors" && s.repeat)
      (profile.honours || []).slice(0, s.repeat.count).forEach((h, i) => {
        put(itemKey(s.id, i, "title"), h.title.slice(0, 100) || undefined);
        put(itemKey(s.id, i, "level"), LEVEL[h.level]);
        put(itemKey(s.id, i, "grades"), h.grade || undefined);
      });
  }
  return add;
}
