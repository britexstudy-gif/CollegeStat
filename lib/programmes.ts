/**
 * Bachelor's programmes for the onboarding picker, grouped. Pure (tests import it).
 *
 * Stored values stay ENGLISH labels (preferences.intake.details.subjects and
 * preferences.field), because the explorer's subject filter matches English
 * programme names by substring. `term` is the word sent to that filter when the
 * label is longer than what catalogues usually write.
 *
 * Older profiles stored one of 15 labels; LEGACY_SUBJECTS maps the one that
 * changed ("Business"), the rest are still labels here.
 */

export const PROGRAMME_GROUPS = [
  "computing",
  "engineering",
  "business",
  "economics",
  "health",
  "sciences",
  "law",
  "social",
  "arts",
  "architecture",
  "education",
  "languages",
] as const;
export type ProgrammeGroup = (typeof PROGRAMME_GROUPS)[number];

export type Programme = { id: string; group: ProgrammeGroup; label: string; term?: string };

const p = (group: ProgrammeGroup, id: string, label: string, term?: string): Programme => ({ id, group, label, ...(term ? { term } : {}) });

export const PROGRAMMES: readonly Programme[] = [
  p("computing", "cs", "Computer Science"),
  p("computing", "se", "Software Engineering"),
  p("computing", "ai", "Artificial Intelligence"),
  p("computing", "data", "Data Science"),
  p("computing", "cyber", "Cybersecurity"),
  p("computing", "is", "Information Systems"),
  p("computing", "gamedev", "Game Development", "Game"),

  p("engineering", "eng", "Engineering"),
  p("engineering", "mech", "Mechanical Engineering"),
  p("engineering", "ee", "Electrical Engineering"),
  p("engineering", "civil", "Civil Engineering"),
  p("engineering", "chemeng", "Chemical Engineering"),
  p("engineering", "aero", "Aerospace Engineering", "Aerospace"),
  p("engineering", "biomedeng", "Biomedical Engineering"),
  p("engineering", "petro", "Petroleum Engineering", "Petroleum"),
  p("engineering", "mechatronics", "Mechatronics"),
  p("engineering", "industrial", "Industrial Engineering"),
  p("engineering", "materials", "Materials Science", "Materials"),
  p("engineering", "energy", "Energy Engineering", "Energy"),
  p("engineering", "enveng", "Environmental Engineering"),

  p("business", "business", "Business Administration", "Business"),
  p("business", "finance", "Finance"),
  p("business", "accounting", "Accounting"),
  p("business", "marketing", "Marketing"),
  p("business", "management", "Management"),
  p("business", "intbusiness", "International Business"),
  p("business", "logistics", "Logistics and Supply Chain", "Logistics"),
  p("business", "hospitality", "Hospitality and Tourism", "Hospitality"),
  p("business", "entrepreneurship", "Entrepreneurship"),

  p("economics", "econ", "Economics"),
  p("economics", "econometrics", "Econometrics"),
  p("economics", "econfin", "Economics and Finance", "Economics"),

  p("health", "medicine", "Medicine"),
  p("health", "dentistry", "Dentistry"),
  p("health", "pharmacy", "Pharmacy"),
  p("health", "nursing", "Nursing"),
  p("health", "publichealth", "Public Health"),
  p("health", "physio", "Physiotherapy"),
  p("health", "biomedsci", "Biomedical Science", "Biomedical"),
  p("health", "vet", "Veterinary Medicine", "Veterinary"),
  p("health", "nutrition", "Nutrition"),

  p("sciences", "math", "Mathematics"),
  p("sciences", "stats", "Statistics"),
  p("sciences", "physics", "Physics"),
  p("sciences", "chemistry", "Chemistry"),
  p("sciences", "biology", "Biology"),
  p("sciences", "biotech", "Biotechnology"),
  p("sciences", "neuro", "Neuroscience"),
  p("sciences", "envsci", "Environmental Science"),
  p("sciences", "geology", "Geology and Earth Sciences", "Geology"),
  p("sciences", "agri", "Agriculture"),

  p("law", "law", "Law"),
  p("law", "ir", "International Relations"),
  p("law", "politics", "Political Science", "Politic"),
  p("law", "policy", "Public Policy"),

  p("social", "psych", "Psychology"),
  p("social", "sociology", "Sociology"),
  p("social", "anthropology", "Anthropology"),
  p("social", "history", "History"),
  p("social", "philosophy", "Philosophy"),
  p("social", "geography", "Geography"),

  p("arts", "design", "Design"),
  p("arts", "graphic", "Graphic Design"),
  p("arts", "ux", "UX and Interaction Design", "Interaction Design"),
  p("arts", "fashion", "Fashion Design", "Fashion"),
  p("arts", "film", "Film and Media Production", "Film"),
  p("arts", "animation", "Animation"),
  p("arts", "music", "Music"),
  p("arts", "finearts", "Fine Arts"),

  p("architecture", "arch", "Architecture"),
  p("architecture", "interior", "Interior Design"),
  p("architecture", "urban", "Urban Planning", "Planning"),
  p("architecture", "landscape", "Landscape Architecture"),

  p("education", "education", "Education"),
  p("education", "earlyed", "Early Childhood Education", "Early Childhood"),
  p("education", "tesol", "Teaching English (TESOL)", "TESOL"),
  p("education", "sport", "Sport Science", "Sport"),

  p("languages", "linguistics", "Linguistics"),
  p("languages", "translation", "Translation and Interpreting", "Translation"),
  p("languages", "journalism", "Journalism"),
  p("languages", "comms", "Communication and Media", "Communication"),
  p("languages", "pr", "Public Relations"),
  p("languages", "englit", "English Literature", "Literature"),
  p("languages", "asian", "Asian Studies", "Asian"),
];

/** The 15 labels older profiles stored, mapped to today's labels when they changed. */
export const LEGACY_SUBJECTS: Record<string, string> = {
  Business: "Business Administration",
};

const BY_LABEL = new Map(PROGRAMMES.map((x) => [x.label.toLowerCase(), x]));
const BY_ID = new Map(PROGRAMMES.map((x) => [x.id, x]));

export const MAX_PROGRAMMES = 3;

/** A programme from a stored label (current or legacy, any case) or an id. */
export function programme(value: string | undefined | null): Programme | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return BY_LABEL.get((LEGACY_SUBJECTS[v] ?? v).toLowerCase()) ?? BY_ID.get(v);
}

/** Known labels in their stored form, legacy names mapped, duplicates dropped, first 3 kept. */
export function normalizeSubjects(value: unknown, max = MAX_PROGRAMMES): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const x = typeof v === "string" ? programme(v) : undefined;
    if (x && !out.includes(x.label)) out.push(x.label);
    if (out.length >= max) break;
  }
  return out;
}

/** What the explorer's subject filter should search for (`preferences.field`). */
export const programmeTerm = (label: string) => {
  const x = programme(label);
  return x ? (x.term ?? x.label) : label;
};

export const programmeKey = (x: Programme) => `prog.${x.id}`;
export const groupKey = (g: ProgrammeGroup) => `progg.${g}`;

/** Case- and accent-insensitive search over the English label and any translated label. */
export function searchProgrammes(query: string, translated: (x: Programme) => string, group?: ProgrammeGroup): Programme[] {
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’ʻʼ'`]/g, "");
  const q = fold(query.trim());
  return PROGRAMMES.filter(
    (x) => (!group || x.group === group) && (!q || fold(x.label).includes(q) || fold(translated(x)).includes(q) || fold(x.term ?? "").includes(q)),
  );
}

/* ── "Not sure yet? Help me choose": three quick questions that suggest groups ── */

export const INTEREST_QUESTIONS = {
  enjoy: ["build", "numbers", "people", "society", "create", "nature", "persuade"],
  subject: ["maths", "physics", "biochem", "it", "social", "languages", "art"],
  day: ["code", "lab", "team", "studio", "site", "classroom", "court"],
} as const;
export type InterestQuestion = keyof typeof INTEREST_QUESTIONS;
export type Interests = { [K in InterestQuestion]?: (typeof INTEREST_QUESTIONS)[K][number] };

const INTEREST_GROUPS: { [K in InterestQuestion]: Record<(typeof INTEREST_QUESTIONS)[K][number], ProgrammeGroup[]> } = {
  enjoy: {
    build: ["engineering", "computing", "architecture"],
    numbers: ["economics", "computing", "sciences"],
    people: ["health", "education", "social"],
    society: ["law", "social", "economics"],
    create: ["arts", "architecture", "languages"],
    nature: ["sciences", "health"],
    persuade: ["business", "law", "languages"],
  },
  subject: {
    maths: ["sciences", "economics", "computing"],
    physics: ["engineering", "sciences"],
    biochem: ["health", "sciences"],
    it: ["computing", "engineering"],
    social: ["law", "social", "economics"],
    languages: ["languages", "education", "law"],
    art: ["arts", "architecture"],
  },
  day: {
    code: ["computing"],
    lab: ["sciences", "health"],
    team: ["business", "economics"],
    studio: ["arts", "architecture"],
    site: ["engineering", "architecture"],
    classroom: ["education", "social"],
    court: ["law", "languages"],
  },
};

/** Up to 3 groups that fit the answers, best first (empty until one is answered). */
export function suggestGroups(answers: Interests, max = 3): ProgrammeGroup[] {
  const score = new Map<ProgrammeGroup, number>();
  for (const q of Object.keys(INTEREST_QUESTIONS) as InterestQuestion[]) {
    const pick = answers[q];
    if (!pick) continue;
    const groups = (INTEREST_GROUPS[q] as Record<string, ProgrammeGroup[]>)[pick] || [];
    // First group of an answer counts most.
    groups.forEach((g, i) => score.set(g, (score.get(g) ?? 0) + (3 - Math.min(i, 2))));
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || PROGRAMME_GROUPS.indexOf(a[0]) - PROGRAMME_GROUPS.indexOf(b[0]))
    .slice(0, max)
    .map(([g]) => g);
}
