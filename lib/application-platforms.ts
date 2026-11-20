/** Which application system a university uses, for the application practice
 * simulator. Order of evidence: a verified `application_route` from the
 * reviewed admissions pages, the Common App member list, a few institutions
 * known to run their own portal, then the country's usual route. Country rules
 * are a starting point, never a promise: the reason travels with the result so
 * the student can see why a platform was chosen. */

/** The four practice forms. Every platform renders one of them. */
export type SimKind = "common-app" | "ucas" | "europe" | "direct";

export type PlatformID =
  | "common-app"
  | "coalition"
  | "uc"
  | "ucas"
  | "uni-assist"
  | "hochschulstart"
  | "studielink"
  | "campus-france"
  | "parcoursup"
  | "universitaly"
  | "ouac"
  | "epbc"
  | "uac"
  | "vtac"
  | "direct";

/** Scholarship or exam routes shown beside the main platform; no form of their own. */
export type AlternativeID = "gks" | "mext" | "csc" | "yos" | "ytb" | "stipendium-hungaricum" | "parcoursup" | "hochschulstart" | "direct" | "ouac";

export type Platform = {
  id: PlatformID;
  name: string;
  kind: SimKind;
  /** One application covers every university on it (Common App, UCAS). */
  shared: boolean;
  url: string;
};

const PLATFORMS: Record<PlatformID, Platform> = {
  "common-app": { id: "common-app", name: "Common App", kind: "common-app", shared: true, url: "https://www.commonapp.org/" },
  coalition: { id: "coalition", name: "Coalition App", kind: "direct", shared: true, url: "https://www.coalitionforcollegeaccess.org/" },
  uc: { id: "uc", name: "UC Application", kind: "direct", shared: true, url: "https://admission.universityofcalifornia.edu/how-to-apply/" },
  ucas: { id: "ucas", name: "UCAS", kind: "ucas", shared: true, url: "https://www.ucas.com/" },
  "uni-assist": { id: "uni-assist", name: "uni-assist", kind: "europe", shared: true, url: "https://www.uni-assist.de/en/" },
  hochschulstart: { id: "hochschulstart", name: "hochschulstart", kind: "europe", shared: true, url: "https://www.hochschulstart.de/" },
  studielink: { id: "studielink", name: "Studielink", kind: "europe", shared: true, url: "https://www.studielink.nl/" },
  "campus-france": { id: "campus-france", name: "Campus France", kind: "europe", shared: true, url: "https://www.campusfrance.org/en/application-higher-education-france" },
  parcoursup: { id: "parcoursup", name: "Parcoursup", kind: "europe", shared: true, url: "https://www.parcoursup.gouv.fr/" },
  universitaly: { id: "universitaly", name: "Universitaly", kind: "europe", shared: true, url: "https://www.universitaly.it/" },
  ouac: { id: "ouac", name: "OUAC", kind: "direct", shared: true, url: "https://www.ouac.on.ca/" },
  epbc: { id: "epbc", name: "EducationPlannerBC", kind: "direct", shared: true, url: "https://www.educationplannerbc.ca/" },
  uac: { id: "uac", name: "UAC", kind: "direct", shared: true, url: "https://www.uac.edu.au/" },
  vtac: { id: "vtac", name: "VTAC", kind: "direct", shared: true, url: "https://www.vtac.edu.au/" },
  direct: { id: "direct", name: "Apply directly", kind: "direct", shared: false, url: "" },
};

export const ALTERNATIVES: Record<AlternativeID, { name: string; url: string }> = {
  gks: { name: "GKS", url: "https://www.studyinkorea.go.kr/" },
  mext: { name: "MEXT", url: "https://www.studyinjapan.go.jp/en/planning/scholarships/mext-scholarships/" },
  csc: { name: "CSC", url: "https://www.campuschina.org/" },
  yos: { name: "YÖS", url: "https://www.studyinturkiye.gov.tr/" },
  ytb: { name: "Türkiye Bursları", url: "https://www.turkiyeburslari.gov.tr/" },
  "stipendium-hungaricum": { name: "Stipendium Hungaricum", url: "https://stipendiumhungaricum.hu/" },
  parcoursup: { name: "Parcoursup", url: "https://www.parcoursup.gouv.fr/" },
  hochschulstart: { name: "hochschulstart", url: "https://www.hochschulstart.de/" },
  direct: { name: "Apply directly", url: "" },
  ouac: { name: "OUAC", url: "https://www.ouac.on.ca/" },
};

/** Why a platform was chosen. The UI turns this into "United Kingdom → UCAS". */
export type PlatformReason =
  | { kind: "verified"; text: string; source: string | null }
  | { kind: "member"; source: string | null }
  | { kind: "institution"; portal: string; source: string }
  | { kind: "region"; region: string }
  | { kind: "country" }
  | { kind: "fallback" };

export type PlatformMatch = {
  platform: Platform;
  reason: PlatformReason;
  alternatives: AlternativeID[];
  /** uni-assist only: preliminary review (VPD), then the university's own portal. */
  vpd?: boolean;
  /** The university's own portal name, when known (TUMonline, MIT application). */
  portal?: string;
};

/** The few fields of a catalogue row that routing reads. */
export type PlatformUniversity = {
  id: string;
  name: string;
  country_code: string;
  city?: string | null;
  website?: string | null;
};

export type CommonAppFlags = { essay: boolean; recs: boolean; fee: boolean; test_flexible: boolean; url: string };
export type DeadlineRow = { title: string; date: string; timezone: string; source: string; category: string };
export type PlatformData = {
  generated_from: string[];
  common_app: Record<string, CommonAppFlags>;
  routes: Record<string, { text: string; source: string | null }>;
  dates: Record<string, DeadlineRow[]>;
};

const EMPTY_DATA: PlatformData = { generated_from: [], common_app: {}, routes: {}, dates: {} };

/** Institutions with a portal of their own, from lib/application-routes.ts and
 * their official admissions pages. Keyed by website host. */
const INSTITUTIONS: Record<string, { platform: PlatformID; portal: string; source: string; vpd?: boolean }> = {
  "mit.edu": { platform: "direct", portal: "MIT application", source: "https://mitadmissions.org/apply/firstyear/deadlines-requirements/" },
  "georgetown.edu": { platform: "direct", portal: "Georgetown application", source: "https://uadmissions.georgetown.edu/applying/" },
  "tum.de": { platform: "uni-assist", vpd: true, portal: "TUMonline", source: "https://www.tum.de/en/studies/application/application-info-portal/online-application" },
  "wiut.uz": { platform: "direct", portal: "WIUT Admission System", source: "https://admission.wiut.uz/Manual/OverView" },
};

const ONTARIO = /\b(ontario|toronto|ottawa|hamilton|kingston|waterloo|guelph|windsor|sudbury|thunder bay|oshawa|st\.? catharines|peterborough|north bay|sault ste\.? marie|kitchener|mississauga|barrie|brampton|timmins|london)\b/i;
const NSW_ACT = /\b(new south wales|nsw|sydney|newcastle|wollongong|canberra|armidale|bathurst|wagga wagga|lismore|australian capital territory)\b/i;
const VICTORIA = /\b(victoria|melbourne|geelong|ballarat|bendigo|burwood|clayton|hawthorn|bundoora)\b/i;

function host(website?: string | null) {
  try {
    return new URL(website || "").hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** The usual route for a country, before any university-specific evidence. */
function countryRoute(u: PlatformUniversity): Omit<PlatformMatch, "reason"> & { reason: PlatformReason } {
  const p = (id: PlatformID) => PLATFORMS[id];
  const city = u.city || "";
  switch (u.country_code) {
    case "US":
      return { platform: p("common-app"), reason: { kind: "country" }, alternatives: ["direct"] };
    case "GB":
      return { platform: p("ucas"), reason: { kind: "country" }, alternatives: [] };
    case "DE":
      return { platform: p("uni-assist"), reason: { kind: "country" }, alternatives: ["hochschulstart", "direct"] };
    case "NL":
      return { platform: p("studielink"), reason: { kind: "country" }, alternatives: [] };
    case "FR":
      return { platform: p("campus-france"), reason: { kind: "country" }, alternatives: ["parcoursup"] };
    case "IT":
      return { platform: p("universitaly"), reason: { kind: "country" }, alternatives: ["direct"] };
    case "KR":
      return { platform: p("direct"), reason: { kind: "country" }, alternatives: ["gks"] };
    case "JP":
      return { platform: p("direct"), reason: { kind: "country" }, alternatives: ["mext"] };
    case "CN":
      return { platform: p("direct"), reason: { kind: "country" }, alternatives: ["csc"] };
    case "TR":
      return { platform: p("direct"), reason: { kind: "country" }, alternatives: ["yos", "ytb"] };
    case "HU":
      return { platform: p("direct"), reason: { kind: "country" }, alternatives: ["stipendium-hungaricum"] };
    case "CA":
      return ONTARIO.test(city)
        ? { platform: p("ouac"), reason: { kind: "region", region: "Ontario" }, alternatives: ["direct"] }
        : { platform: p("direct"), reason: { kind: "country" }, alternatives: [] };
    case "AU":
      if (NSW_ACT.test(city)) return { platform: p("uac"), reason: { kind: "region", region: "NSW / ACT" }, alternatives: ["direct"] };
      if (VICTORIA.test(city)) return { platform: p("vtac"), reason: { kind: "region", region: "Victoria" }, alternatives: ["direct"] };
      return { platform: p("direct"), reason: { kind: "country" }, alternatives: [] };
    default:
      return { platform: p("direct"), reason: { kind: "fallback" }, alternatives: [] };
  }
}

/** Platform names in a verified route sentence, by where they first appear. */
const KEYWORDS: [RegExp, PlatformID][] = [
  [/common app(lication)?/i, "common-app"],
  [/coalition/i, "coalition"],
  [/\bUC Application\b|University of California undergraduate application|shared University of California/i, "uc"],
  [/\bUCAS\b/, "ucas"],
  [/uni-assist|\bVPD\b/i, "uni-assist"],
  [/hochschulstart|\bDoSV\b/i, "hochschulstart"],
  [/studielink/i, "studielink"],
  [/universitaly/i, "universitaly"],
  [/campus france|[ée]tudes en france/i, "campus-france"],
  [/parcoursup/i, "parcoursup"],
  [/\bOUAC\b/, "ouac"],
  [/EducationPlannerBC|\bEPBC\b/, "epbc"],
  [/\bVTAC\b/, "vtac"],
  [/\bUAC\b/, "uac"],
  [/\bdirect\b|portal|online application|application system|apply online|own application/i, "direct"],
];

/** Reads a verified route sentence ("OUAC; York direct application…"). */
export function parseRouteText(text: string): { primary: PlatformID | null; mentioned: PlatformID[] } {
  const hits = KEYWORDS.map(([re, id]) => ({ id, at: text.search(re) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const mentioned = [...new Set(hits.map((h) => h.id))];
  if (!mentioned.length) return { primary: null, mentioned };
  // A uni-assist VPD before the university's own portal is still a uni-assist
  // route for practice: the documents are checked there first.
  if (mentioned.includes("uni-assist") && /\bVPD\b|uni-assist/i.test(text)) return { primary: "uni-assist", mentioned };
  return { primary: mentioned[0], mentioned };
}

const toAlternative = (id: PlatformID): AlternativeID | null =>
  id === "direct" || id === "ouac" || id === "parcoursup" || id === "hochschulstart" ? id : null;

/** Detects the application system for one university. */
export function detectPlatform(u: PlatformUniversity, data: PlatformData = EMPTY_DATA): PlatformMatch {
  const base = countryRoute(u);
  const verified = data.routes[u.id];
  if (verified?.text) {
    const { primary, mentioned } = parseRouteText(verified.text);
    if (primary) {
      // Italy: non-EU applicants pre-enrol on Universitaly even when the
      // university runs its own portal, so practice follows that flow.
      const id: PlatformID = primary === "direct" && u.country_code === "IT" ? "universitaly" : primary;
      const others = mentioned.filter((m) => m !== id).map(toAlternative).filter((a): a is AlternativeID => !!a);
      const alternatives = [...new Set([...others, ...base.alternatives.filter((a) => a !== "direct" || id !== "direct")])].filter(
        (a) => a !== id,
      );
      return {
        platform: PLATFORMS[id],
        reason: { kind: "verified", text: verified.text, source: verified.source },
        alternatives,
        vpd: id === "uni-assist" ? /\bVPD\b/i.test(verified.text) || mentioned.includes("direct") : undefined,
      };
    }
  }
  const inst = INSTITUTIONS[Object.keys(INSTITUTIONS).find((d) => host(u.website) === d || host(u.website).endsWith("." + d)) || ""];
  if (inst) {
    return {
      platform: PLATFORMS[inst.platform],
      reason: { kind: "institution", portal: inst.portal, source: inst.source },
      alternatives: base.alternatives.filter((a) => a !== "direct"),
      vpd: inst.vpd,
      portal: inst.portal,
    };
  }
  if (u.country_code === "US") {
    if (/^University of California\b/i.test(u.name))
      return { platform: PLATFORMS.uc, reason: { kind: "institution", portal: "UC Application", source: PLATFORMS.uc.url }, alternatives: [] };
    const member = data.common_app[u.id];
    if (member) return { platform: PLATFORMS["common-app"], reason: { kind: "member", source: member.url || null }, alternatives: [] };
  }
  return { ...base, vpd: base.platform.id === "uni-assist" ? false : undefined };
}

/** One application per shared platform, one per university otherwise. */
export function applicationKey(match: Pick<PlatformMatch, "platform">, universityId: string) {
  return match.platform.shared ? match.platform.id : "direct:" + universityId;
}

export type ApplicationGroup<U extends PlatformUniversity> = {
  key: string;
  platform: Platform;
  universities: U[];
};

/** Groups universities into applications, keeping the order they were added. */
export function groupApplications<U extends PlatformUniversity>(
  universities: U[],
  data: PlatformData = EMPTY_DATA,
): ApplicationGroup<U>[] {
  const groups = new Map<string, ApplicationGroup<U>>();
  for (const u of universities) {
    const match = detectPlatform(u, data);
    const key = applicationKey(match, u.id);
    const group = groups.get(key) || { key, platform: match.platform, universities: [] };
    group.universities.push(u);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Upcoming deadlines first; past ones only when nothing is upcoming. */
export function nextDeadline(rows: DeadlineRow[], today: string): { row: DeadlineRow; past: boolean } | null {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.find((r) => r.date.slice(0, 10) >= today);
  if (upcoming) return { row: upcoming, past: false };
  const last = sorted.at(-1);
  return last ? { row: last, past: true } : null;
}

type CommonAppSource = {
  records: Record<string, { url?: string; essay_required?: boolean; recs_required?: boolean; charges_fee?: boolean; test_flexible?: boolean }>;
};
type MergedSource = { university_id: string; fields: { application_route?: { value: unknown; source_url: string | null; status: string } } }[];
type DatesSource = {
  university_id: string;
  title: string;
  student_category?: string;
  due_at: string;
  due_date?: string;
  timezone: string;
  source_url: string;
  verification_status: string;
}[];

/** Builds the compact data file the browser loads
 * (components/college/application-practice/platform-data.json). A test keeps
 * it in step with the published sources it is made from. */
export function buildPlatformData(commonApp: CommonAppSource, merged: MergedSource, dates: DatesSource[]): PlatformData {
  const common_app: PlatformData["common_app"] = {};
  for (const [id, r] of Object.entries(commonApp.records).sort(([a], [b]) => a.localeCompare(b)))
    common_app[id] = { essay: !!r.essay_required, recs: !!r.recs_required, fee: !!r.charges_fee, test_flexible: !!r.test_flexible, url: r.url || "" };
  const routes: PlatformData["routes"] = {};
  for (const r of [...merged].sort((a, b) => a.university_id.localeCompare(b.university_id))) {
    const f = r.fields.application_route;
    if (f?.status === "verified" && typeof f.value === "string" && f.value.trim()) routes[r.university_id] = { text: f.value.trim(), source: f.source_url };
  }
  const out: PlatformData["dates"] = {};
  const seen = new Set<string>();
  for (const row of dates.flat()) {
    if (row.verification_status !== "verified") continue;
    const date = row.due_date || row.due_at;
    const key = row.university_id + "|" + row.title + "|" + date;
    if (seen.has(key)) continue;
    seen.add(key);
    (out[row.university_id] ||= []).push({ title: row.title, date, timezone: row.timezone, source: row.source_url, category: row.student_category || "" });
  }
  const sortedDates: PlatformData["dates"] = {};
  for (const id of Object.keys(out).sort()) sortedDates[id] = out[id].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return {
    generated_from: [
      "data/published/common-app-members.json",
      "data/review/segment-admissions-nov14-merged.json",
      "data/published/application-dates-current.json",
      "data/published/application-dates-segment-nov14.json",
    ],
    common_app,
    routes,
    dates: sortedDates,
  };
}
