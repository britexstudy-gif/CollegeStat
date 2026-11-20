import { countryName, type Cost, type Deadline, type Requirement, type University } from "./domain";
import { deadlineDate } from "./application-dates";
import { latestReportedCosts } from "./profile-navigation";
import { profileCampusGallery } from "./campus-gallery";
import { universityEnrichment } from "./university-enrichment";
import { establishedYear, institutionType } from "./institution-facts";
import type { ProfileRankingPosition } from "./profile-ranking-positions";
import type { ProfileExtras } from "@/server/profile-extras";

/** Pure view-models for the university profile: each takes the catalogue record
 * (plus the reviewed extras) and returns only what exists, so the page can hide
 * whatever is empty. No sections are decided here beyond `profileSectionIds`. */

const verified = (r: { verification_status?: string | null; canonical?: boolean | null }) =>
  r.verification_status === "verified" && r.canonical !== false;
const href = (u?: string | null) => (u && /^https?:\/\//.test(u) ? u : null);

/** One position per publisher edition: the newest edition of each publisher wins,
 * older editions of the same publisher are dropped. */
export function latestEditionPositions(rows: ProfileRankingPosition[]): ProfileRankingPosition[] {
  const newest = new Map<string, number>();
  for (const r of rows) newest.set(r.provider, Math.max(newest.get(r.provider) ?? 0, r.year));
  return rows.filter((r) => r.year === newest.get(r.provider));
}

/* ── Admissions & how to apply ─────────────────────────────────────────── */
export type EnglishTest = { test: string; minimum: number; scope: string | null; source_url: string | null };
export type ApplyDeadline = { id: string; title: string; date: string; cycle: string | null; source_url: string | null; past: boolean };
export type ApplyModel = {
  route: { text: string; source_url: string | null } | null;
  applyUrl: string | null;
  admissionsUrl: string | null;
  deadlines: ApplyDeadline[];
  deadlineText: { text: string; source_url: string | null } | null;
  fees: { amount: number; currency: string; scope: string | null; source_url: string | null }[];
  english: EnglishTest[];
  waivers: { text: string; source_url: string | null } | null;
  foundationYear: { text: string; source_url: string | null } | null;
  aid: { international: boolean | null; type: string | null; note: string | null; source_url: string | null } | null;
  /** Plain steps, each built only from data the profile holds. */
  steps: ("requirements" | "english" | "route" | "fee" | "deadline")[];
};

const englishKinds = ["IELTS", "TOEFL", "DUOLINGO", "PTE"];
function englishTests(u: University, extras?: ProfileExtras): EnglishTest[] {
  const out: EnglishTest[] = [];
  const seen = new Set<string>();
  const add = (e: EnglishTest) => {
    const key = e.test + e.minimum;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  };
  for (const r of u.requirements as Requirement[]) {
    // Duolingo and PTE minimums are stored as kind "other" with the test in the label.
    const test = r.kind === "other" ? (/duolingo/i.test(r.label) ? "DUOLINGO" : /pte academic/i.test(r.label) ? "PTE" : "") : r.kind.toUpperCase();
    if (!englishKinds.includes(test) || !verified(r) || r.minimum == null || r.minimum <= 0) continue;
    add({ test: test === "DUOLINGO" ? "Duolingo" : test, minimum: r.minimum, scope: foundation(r) ? "Foundation" : null, source_url: href(r.source_url) });
  }
  const adm = u.admissions.find((a) => verified(a) && (a.ielts_min != null || a.toefl_min != null));
  if (adm?.ielts_min) add({ test: "IELTS", minimum: adm.ielts_min, scope: null, source_url: href(adm.source_url) });
  if (adm?.toefl_min) add({ test: "TOEFL", minimum: adm.toefl_min, scope: null, source_url: href(adm.source_url) });
  const duo = extras?.apply?.duolingo;
  if (duo) add({ test: "Duolingo", minimum: duo.value, scope: null, source_url: duo.source_url });
  return out.sort((a, b) => englishKinds.indexOf(a.test.toUpperCase()) - englishKinds.indexOf(b.test.toUpperCase()) || a.minimum - b.minimum);
}
const foundation = (r: Requirement) => /foundation/i.test(r.label + " " + r.student_category);

export function applyModel(u: University, extras: ProfileExtras | undefined, today = new Date().toISOString().slice(0, 10)): ApplyModel {
  const apply = extras?.apply;
  const dated = (u.deadlines as Deadline[])
    .filter((d) => verified(d))
    .map((d) => ({ d, date: deadlineDate(d) }))
    .filter(({ date }) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const upcoming = dated.filter(({ date }) => date >= today);
  // With nothing upcoming, show the latest cycle the university published.
  const pick = (upcoming.length ? upcoming : dated.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)).sort((a, b) => a.date.localeCompare(b.date));
  const deadlines = pick.map(({ d, date }) => ({
    id: d.id,
    title: d.title.replace(/^Undergraduate application:\s*/i, "").replace(/^./, (c) => c.toUpperCase()),
    date,
    cycle: d.cycle || null,
    source_url: href(d.source_url) || href(d.application_url),
    past: date < today,
  }));
  const fees: ApplyModel["fees"] = [];
  const feeKeys = new Set<string>();
  for (const c of u.costs as Cost[]) {
    if (c.category !== "application_fee" || !verified(c) || !(c.amount > 0)) continue;
    const key = c.amount + c.currency;
    if (feeKeys.has(key)) continue;
    feeKeys.add(key);
    fees.push({ amount: c.amount, currency: c.currency, scope: /international|first-year/i.test(c.student_category) ? c.student_category : null, source_url: href(c.source_url) });
  }
  if (!fees.length && u.us_stats?.app_fee_ug)
    fees.push({ amount: u.us_stats.app_fee_ug, currency: "USD", scope: null, source_url: "https://nces.ed.gov/ipeds/" });
  const english = englishTests(u, extras);
  const route = apply?.route ? { text: apply.route.value, source_url: apply.route.source_url } : null;
  const applyUrl = href(u.application_url) || deadlines.map((d) => href(d.source_url)).find(Boolean) || null;
  const model: ApplyModel = {
    route,
    applyUrl: href(u.application_url),
    admissionsUrl: href(u.admissions_url) || href(u.official_web?.links.admissions?.url),
    deadlines,
    deadlineText: apply?.deadline_text ? { text: apply.deadline_text.value, source_url: apply.deadline_text.source_url } : null,
    fees,
    english,
    waivers: apply?.waivers ? { text: apply.waivers.value, source_url: apply.waivers.source_url } : null,
    foundationYear: apply?.foundation_year ? { text: apply.foundation_year.value, source_url: apply.foundation_year.source_url } : null,
    aid: apply?.aid ? { ...apply.aid.value, source_url: apply.aid.source_url } : null,
    steps: [],
  };
  void applyUrl;
  const hasData = !!(route || deadlines.length || fees.length || english.length || model.waivers || model.deadlineText);
  model.steps = hasData
    ? ([
        "requirements",
        english.length || model.waivers ? "english" : null,
        route || model.applyUrl ? "route" : null,
        fees.length ? "fee" : null,
        deadlines.length || model.deadlineText ? "deadline" : null,
      ].filter(Boolean) as ApplyModel["steps"])
    : [];
  return model;
}
export const hasApplyContent = (m: ApplyModel) =>
  !!(m.steps.length || m.admissionsUrl || m.applyUrl || m.foundationYear);

/* ── Costs & aid ───────────────────────────────────────────────────────── */
export type CostLine = { key: string; amount: number; currency: string; note: string | null; source_url: string | null };
export type CostModel = {
  tuition: (CostLine & { basis: string | null; varies: boolean; withFees?: boolean }) | null;
  fees: CostLine | null;
  living: CostLine[];
  total: CostLine | null;
  netPrice: { average: number | null; byIncome: [string, number][]; url: string | null } | null;
  aidLinks: { name: string; url: string }[];
};
const intl = /international|out[_ -]?of[_ -]?state|overseas|foreign|non[_ -]?eu|all[_ ]students/i;
const livingCategories: Record<string, string> = { housing: "housing", food: "food", books: "books", personal: "personal", room_board: "room_board", transport: "personal", living: "living" };
const yearNote = (c: Cost) => (c.year != null ? String(c.year) : null);

export function costModel(u: University, extras: ProfileExtras | undefined): CostModel {
  const rows = latestReportedCosts(u.costs).filter((c) => verified(c) && c.amount > 0 && !c.program_id);
  const line = (c: Cost, key: string): CostLine => ({ key, amount: c.amount, currency: c.currency, note: yearNote(c), source_url: href(c.source_url) });
  const tuitionRow = rows.filter((c) => c.category === "tuition" && intl.test(c.student_category)).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
  const ex = extras?.costs;
  let tuition: CostModel["tuition"] = null;
  const cur = u.us_current;
  const federal = "https://collegescorecard.ed.gov/data/";
  // Latest federal year first (tuition and fees, out-of-state = what international students pay).
  if (cur?.tuition_fees_out_of_state)
    tuition = { key: "tuition", amount: cur.tuition_fees_out_of_state, currency: "USD", note: cur.academic_year, source_url: federal, basis: null, varies: false, withFees: true };
  else if (tuitionRow) tuition = { ...line(tuitionRow, "tuition"), basis: null, varies: false };
  else if (ex?.indexed)
    tuition = { key: "tuition", amount: ex.indexed.amount, currency: ex.indexed.currency, note: ex.indexed.year ? String(ex.indexed.year) : null, source_url: href(ex.indexed.source_url), basis: null, varies: false };
  else if (ex?.tuition)
    tuition = { key: "tuition", amount: ex.tuition.amount, currency: ex.tuition.currency, note: ex.tuition.year, source_url: ex.tuition.source_url, basis: ex.tuition.basis, varies: ex.tuition.varies };
  const feeRow = rows.find((c) => ["fees", "mandatory_fees"].includes(c.category) && (intl.test(c.student_category) || c.student_category === "international"));
  const living: CostLine[] = [];
  for (const [cat, key] of Object.entries(livingCategories)) {
    const row = rows.find((c) => c.category === cat);
    if (row && !living.some((l) => l.key === key)) living.push(line(row, key));
  }
  const totalRow = rows.find((c) => c.category === "total");
  const total: CostLine | null = cur?.cost_of_attendance
    ? { key: "total", amount: cur.cost_of_attendance, currency: "USD", note: cur.academic_year, source_url: federal }
    : totalRow ? line(totalRow, "total") : null;
  const sc = u.scorecard;
  const incomeLabels: [string, string][] = [["0-30000", "<$30k"], ["30001-48000", "$30–48k"], ["48001-75000", "$48–75k"], ["75001-110000", "$75–110k"], ["110001+", ">$110k"]];
  const byIncome = incomeLabels.filter(([k]) => sc?.net_price_by_income?.[k] != null).map(([k, l]) => [l, sc!.net_price_by_income![k]] as [string, number]);
  const netPrice = sc && (sc.net_price || byIncome.length) ? { average: sc.net_price ?? null, byIncome, url: href(sc.net_price_calculator) || href(u.net_price_url) } : null;
  return {
    tuition,
    fees: feeRow && !tuition?.withFees ? line(feeRow, "fees") : null,
    living,
    total,
    netPrice,
    aidLinks: u.financial_aid.filter((a) => verified(a) && href(a.application_url)).slice(0, 4).map((a) => ({ name: a.name, url: a.application_url })),
  };
}
export const hasCostContent = (m: CostModel, u: University, extras?: ProfileExtras) =>
  !!(m.tuition || m.fees || m.living.length || m.total || m.netPrice || m.aidLinks.length || extras?.costs?.living || extras?.apply?.aid || u.financial_aid_url || u.net_price_url);

/* ── Sections ──────────────────────────────────────────────────────────── */
export type SectionId = "overview" | "rankings" | "apply" | "costs" | "scholarships" | "programmes" | "media" | "outcomes" | "faq";
export const legacyTabSection: Record<string, SectionId> = {
  Overview: "overview", Admissions: "apply", Apply: "apply", Costs: "costs", Academics: "programmes", Study: "programmes",
  Rankings: "rankings", Campus: "media", Gallery: "media", People: "overview", Sources: "overview", Students: "outcomes", Outcomes: "outcomes",
};

export function campusPhotos(u: University) {
  return profileCampusGallery(u, universityEnrichment(u));
}

/* ── At a glance ───────────────────────────────────────────────────────── */
export type GlanceTile = {
  id: "students" | "intl" | "staff" | "ratio" | "founded" | "type" | "campus" | "endowment" | "motto";
  /** Plain text value; `valueKey` takes over when the value is a translated word. */
  value: string;
  valueKey?: "up.setting.urban" | "up.setting.suburban" | "up.setting.rural" | "up.setting.multiple";
  note?: string;
  url?: string | null;
};
export type GlanceModel = {
  tiles: GlanceTile[];
  location: { place: string; lat: number; lon: number; source_url: string | null } | null;
};
const SCORECARD = "https://collegescorecard.ed.gov/";
const nf = (n: number) => Math.round(n).toLocaleString("en-US");
/** One value per fact. Verified catalogue data wins; the open-data value fills a gap and
 * is never shown beside a different number for the same thing. */
export function glanceModel(u: University, extras?: ProfileExtras): GlanceModel {
  const f = extras?.facts;
  const h = u.history;
  const tiles: GlanceTile[] = [];
  const have = {
    students: h?.students_total ?? u.us_stats?.enrollment?.all?.total ?? u.publisher_students?.students ?? null,
    ratio: u.scorecard?.student_faculty_ratio ?? u.us_stats?.student_faculty_ratio ?? u.publisher_students?.student_staff_ratio ?? null,
    // The Scorecard field is not in a fixed unit for every record; only a dollar-sized value is used.
    endowment: u.scorecard?.endowment && u.scorecard.endowment >= 1e6 ? u.scorecard.endowment : null,
  };
  let students = have.students;
  if (students) {
    const fromScorecard = !h?.students_total && !u.us_stats?.enrollment?.all?.total && !u.publisher_students?.students;
    tiles.push({ id: "students", value: nf(students), url: h?.students_total ? h.sources?.[0]?.url ?? null : fromScorecard ? SCORECARD : null });
  } else if (f?.students) {
    students = f.students.value;
    tiles.push({ id: "students", value: nf(students), note: f.students.date?.slice(0, 4), url: f.students.source_url });
  }
  const intl = h?.international_students_pct ?? u.scorecard?.international_pct ?? u.publisher_students?.international_percent ?? null;
  if (intl != null) tiles.push({ id: "intl", value: Math.round(intl * 10) / 10 + "%", url: !h?.international_students_pct && u.scorecard?.international_pct != null ? SCORECARD : null });
  if (have.ratio) {
    tiles.push({ id: "ratio", value: Math.round(have.ratio) + ":1", url: u.scorecard?.student_faculty_ratio ? SCORECARD : null });
  } else {
    const staff = f?.academic_staff ?? f?.employees;
    if (staff) tiles.push({ id: "staff", value: nf(staff.value), note: staff.date?.slice(0, 4), url: staff.source_url });
    if (f?.academic_staff && students && students / f.academic_staff.value >= 1 && students / f.academic_staff.value < 100)
      tiles.push({ id: "ratio", value: Math.round(students / f.academic_staff.value) + ":1", url: f.academic_staff.source_url });
  }
  const founded = establishedYear(u);
  if (founded) tiles.push({ id: "founded", value: String(founded) });
  else if (f?.founded) tiles.push({ id: "founded", value: String(f.founded.year), url: f.founded.source_url });
  const kind = institutionType(u);
  if (kind) tiles.push({ id: "type", value: kind });
  else if (f?.type) tiles.push({ id: "type", value: f.type.value, url: f.type.source_url });
  if (h?.campus_setting) tiles.push({ id: "campus", value: "", valueKey: ("up.setting." + h.campus_setting) as GlanceTile["valueKey"] });
  else if (u.campuses.length > 1) tiles.push({ id: "campus", value: "", valueKey: "up.setting.multiple" });
  else if (f?.campus_area_km2) {
    const km = f.campus_area_km2.value;
    tiles.push({ id: "campus", value: km >= 1 ? `${km.toFixed(km >= 10 ? 0 : 1)} km²` : `${Math.round(km * 100)} ha`, url: f.campus_area_km2.source_url });
  }
  const endow = have.endowment
    ? { amount: have.endowment, currency: "USD", note: undefined as string | undefined, url: SCORECARD }
    : f?.endowment ? { amount: f.endowment.amount, currency: f.endowment.currency, note: f.endowment.date?.slice(0, 4), url: f.endowment.source_url } : null;
  if (endow)
    tiles.push({
      id: "endowment",
      value: new Intl.NumberFormat("en", { style: "currency", currency: endow.currency, notation: "compact", maximumFractionDigits: 1 }).format(endow.amount),
      note: endow.note,
      url: endow.url,
    });
  if (h?.motto) tiles.push({ id: "motto", value: h.motto, url: h.sources?.[0]?.url ?? null });
  else if (f?.motto) tiles.push({ id: "motto", value: f.motto.value, url: f.motto.source_url });
  const lat = u.latitude ?? f?.coordinates?.lat ?? null;
  const lon = u.longitude ?? f?.coordinates?.lon ?? null;
  const place = [u.city, countryName(u.country_code)].filter(Boolean).join(", ");
  return { tiles, location: lat != null && lon != null ? { place, lat, lon, source_url: u.latitude != null ? null : f?.coordinates?.source_url ?? null } : null };
}
