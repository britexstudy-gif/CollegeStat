// Segment data-coverage report: how complete is our data for the universities
// Central Asian bachelor's applicants (intake 2027) target?
//
//   node --import tsx scripts/segment/coverage.ts
//
// Inputs:  data/segment/targets.json (scripts/segment/select-targets.ts) and the
//          bundled catalogue (data/generated/catalogue, built by
//          scripts/build-catalogue.ts) with the same server overlays the profile
//          page uses (withReviewedMedia, reviewed enrichment).
// Outputs: outputs/segment-coverage.md and founder/segment-coverage.md (same text).
// Read-only: it never writes to data/, never fetches websites and never reads or
// writes the hosted Supabase database. It only measures gaps; nothing is filled.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { University } from "@/lib/domain";
import { universityBySlug } from "@/server/catalogue-store";
import { withReviewedMedia } from "@/server/university";
import { universityEnrichment } from "@/lib/university-enrichment";
import usStats from "@/data/published/ipeds-us-stats-2023.json";
import {
  FIELDS,
  FIELD_LABELS,
  REPORT_READY_PARTS,
  classifyProfile,
  lookupPage,
  missingForReport,
  reportReadyCurrent,
  type Context,
  type FieldKey,
  type ProfileInput,
  type Verdict,
} from "./coverage-rules";
import { DESTINATION_QUOTAS, HOME_CAMPUSES, type Target } from "./select-targets";

type Row = {
  target: Target;
  profile: ProfileInput | null;
  verdicts: Record<FieldKey, Verdict> | null;
  missing: ReturnType<typeof missingForReport>;
  readyCurrent: boolean;
  score: number;
};

const root = new URL("../../", import.meta.url);
const today = new Date().toISOString().slice(0, 10);
const ctx: Context = { today };

/** Country order = destination priority from the owner brief, then home countries. */
const COUNTRY_PRIORITY = [...DESTINATION_QUOTAS.map(([cc]) => cc), ...new Set(HOME_CAMPUSES.map(([cc]) => cc))];

/** The profile exactly as the page assembles it in bundled mode, plus enrichment. */
async function loadProfile(slug: string): Promise<ProfileInput | null> {
  const base = await universityBySlug(slug);
  if (!base) return null;
  const u: University = await withReviewedMedia(base);
  return {
    ...u,
    enrichment: universityEnrichment(u) ?? null,
    us_stats_source: u.us_stats ? { url: usStats.source.url, academic_year: "2023–24 academic year (IPEDS 2023 charges)" } : null,
  };
}

/** Completeness score for sorting: 2 per current field, 1 per sourced-only field. */
const scoreOf = (v: Record<FieldKey, Verdict>) => FIELDS.reduce((n, f) => n + (v[f].current ? 2 : v[f].sourced ? 1 : 0), 0);

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");
const cell = (v: Verdict) => (v.current ? "✔ current" : v.sourced ? "sourced" : v.present ? "unsourced" : "—");
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function fieldTable(rows: Row[]): string {
  const ok = rows.filter((r) => r.verdicts);
  const lines = ["| Field | Present | Sourced | Current | Current means |", "|---|---|---|---|---|"];
  for (const f of FIELDS) {
    const c = (k: "present" | "sourced" | "current") => ok.filter((r) => r.verdicts![f][k]).length;
    const rule =
      f === "deadline" || f === "application_fee" || f === "scholarships"
        ? "2027-entry round"
        : f.endsWith("link") || f === "website"
          ? "link checked within 365 days"
          : "academic year 2026–27 or 2027–28";
    lines.push(`| ${FIELD_LABELS[f]} | ${c("present")} (${pct(c("present"), ok.length)}) | ${c("sourced")} (${pct(c("sourced"), ok.length)}) | ${c("current")} (${pct(c("current"), ok.length)}) | ${rule} |`);
  }
  return lines.join("\n");
}

function universityTable(rows: Row[]): string {
  const head = ["#", "University", "CC", "Score", "Report-ready", ...FIELDS.map((f) => FIELD_LABELS[f]), "Years on record"];
  const lines = ["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|"];
  rows.forEach((r, i) => {
    if (!r.verdicts) {
      lines.push(`| ${i + 1} | ${esc(r.target.name)} | ${r.target.country_code} | — | not in catalogue | ${FIELDS.map(() => "—").join(" | ")} | |`);
      return;
    }
    const v = r.verdicts;
    const ready = r.missing.length ? `no (${r.missing.map((m) => m.part).join(", ")})` : r.readyCurrent ? "yes, current" : "yes (not all current)";
    const years = FIELDS.filter((f) => v[f].present && !f.endsWith("link") && f !== "website")
      .map((f) => `${f}: ${v[f].year}`)
      .join("; ");
    lines.push(`| ${i + 1} | [${esc(r.target.name)}](/university/${r.target.slug}) | ${r.target.country_code} | ${r.score} | ${ready} | ${FIELDS.map((f) => cell(v[f])).join(" | ")} | ${esc(years)} |`);
  });
  return lines.join("\n");
}

/** Gaps ordered by how close a university is to report-ready (fewest missing
 * parts first), then round-robin across destinations in brief order (each
 * country's best-ranked university first), so the top of the list unlocks
 * reports fastest while covering the most-applied-to destinations. */
function impactfulGaps(rows: Row[], limit: number) {
  const perCountryIndex = new Map<string, number>();
  const rankInCountry = new Map<string, number>();
  for (const r of rows) {
    const n = perCountryIndex.get(r.target.country_code) ?? 0;
    rankInCountry.set(r.target.id, n);
    perCountryIndex.set(r.target.country_code, n + 1);
  }
  const candidates = rows
    .filter((r) => r.verdicts && r.missing.length)
    .sort(
      (a, b) =>
        a.missing.length - b.missing.length ||
        rankInCountry.get(a.target.id)! - rankInCountry.get(b.target.id)! ||
        COUNTRY_PRIORITY.indexOf(a.target.country_code) - COUNTRY_PRIORITY.indexOf(b.target.country_code),
    );
  return candidates
    .flatMap((r) => r.missing.map((m) => ({ r, ...m, page: lookupPage(r.profile!, m.part) })))
    .slice(0, limit);
}

function render(rows: Row[], targetsDoc: { status: string; segment: string; selection_rule: string }): string {
  const ok = rows.filter((r) => r.verdicts);
  const ready = ok.filter((r) => !r.missing.length);
  const readyCurrent = ok.filter((r) => r.readyCurrent);
  const missingIds = rows.filter((r) => !r.verdicts).map((r) => r.target.name);
  const partCounts = REPORT_READY_PARTS.map((p) => `${p} ${ok.filter((r) => !r.missing.some((m) => m.part === p)).length}/${ok.length}`).join(", ");
  const gaps = impactfulGaps(rows, 30);
  const perCountry = COUNTRY_PRIORITY.map((cc) => {
    const g = ok.filter((r) => r.target.country_code === cc);
    return `${cc} ${g.filter((r) => !r.missing.length).length}/${g.length}`;
  }).join(" · ");
  return `# Segment data coverage — Central Asia bachelor's, intake 2027

Generated ${today} by \`node --import tsx scripts/segment/coverage.ts\`. Target list: \`data/segment/targets.json\` (${targetsDoc.status}).

**Summary: ${ready.length} of ${ok.length} target universities are report-ready; ${readyCurrent.length} are report-ready with all four parts current.**

Report-ready means all four of: (1) tuition with a stated currency and a stated year, (2) an English test minimum (IELTS/TOEFL/Duolingo score, or an explicit "no test required"), (3) an application deadline, (4) an official admissions page link — each with a source URL. "Report-ready, current" additionally needs tuition and the English minimum for academic year 2026–27 or 2027–28, a 2027-entry deadline and an admissions link checked in the last 365 days.

Targets meeting each part: ${partCounts}.
Report-ready by country: ${perCountry}.

Source of truth: the bundled catalogue (\`data/generated/catalogue\`, built from \`data/published\`) plus the server overlays the profile page adds in bundled mode (IPEDS US stats, Common App, Scorecard, reviewed enrichment). The hosted Supabase database was **not** read.${missingIds.length ? `\nTargets not found in the catalogue: ${missingIds.join(", ")}.` : ""}

## Per-field coverage (${ok.length} universities)

"Present" = at least one stored value (a missing amount is never counted as zero; a stated zero is a value). "Sourced" = that value has an http(s) source or provenance URL. "Current" = a sourced value refers to the period in the last column; a year is only read from stored period/cycle/scope fields or the record's own year, never from a retrieval date.

${fieldTable(rows)}

## The 30 most impactful missing fields

Ordered by how few parts the university is missing from report-ready (fixing a 1-gap university unlocks a report), then alternating across destinations in brief order (US, GB, DE, KR, TR, MY, CN, JP, IT, HU, PL, CZ, CA, RU, AE, SG, HK, then UZ, KZ, KG, TJ), best-ranked first. "Where to look" is an official page we already store; "none stored" means we have no link for it.

| # | University | CC | Missing field | Why | Gaps to report-ready | Where to look (stored link) |
|---|---|---|---|---|---|---|
${gaps.map((g, i) => `| ${i + 1} | ${esc(g.r.target.name)} | ${g.r.target.country_code} | ${FIELD_LABELS[g.part]} | ${g.why} | ${g.r.missing.length} | ${g.page ?? "none stored"} |`).join("\n")}

## Per-university coverage, most complete first

Cell legend: "✔ current" sourced and current · "sourced" has a source URL but the period is older or not stated · "unsourced" stored without a source URL · "—" not stored. Score = 2 per current field + 1 per sourced-only field (max ${FIELDS.length * 2}).

${universityTable(rows)}

## Spot check against the profile page

SPOT_CHECK_PLACEHOLDER

## Limits of this measurement

- "Current" depends on stored period labels. Most requirement rows, English minimums, briefs and linked aid carry no stated year, so they count as sourced but not current even when the official page may still be valid.
- A lone year in a scope text (for example "2026 instructions") is read as that intake year; range and "YYYY entry" forms take precedence.
- US tuition comes mostly from IPEDS 2023–24 out-of-state rates. They count as tuition with currency and year, but are not verified international prices and are never current.
- English minimums include programme-specific values (e.g. one WIUT course); the profile headline only shows university-wide ones.
- "International students page" is detected only by "international/overseas/non-local/foreign" in stored official link URLs or labels; there is no dedicated field, so the count is a floor.
- The target list ranks by world rankings as a proxy for where this segment applies; it is a draft for owner review.
`;
}

async function main() {
  const targetsDoc = JSON.parse(readFileSync(new URL("data/segment/targets.json", root), "utf8")) as {
    status: string;
    segment: string;
    selection_rule: string;
    universities: Target[];
  };
  const rows: Row[] = [];
  for (const target of targetsDoc.universities) {
    const profile = await loadProfile(target.slug);
    const verdicts = profile ? classifyProfile(profile, ctx) : null;
    rows.push({
      target,
      profile,
      verdicts,
      missing: verdicts ? missingForReport(verdicts) : [],
      readyCurrent: verdicts ? reportReadyCurrent(verdicts, ctx) : false,
      score: verdicts ? scoreOf(verdicts) : -1,
    });
  }
  // Stable order: completeness, then original target order.
  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.score - a.r.score || a.r.missing.length - b.r.missing.length || a.i - b.i)
    .map(({ r }) => r);
  let md = render(sorted, targetsDoc);
  // The spot check is done by a person against the running page; keep its
  // recorded result (scripts/segment/spot-check.md) in every regeneration.
  let spot = "Not recorded yet.";
  try {
    spot = readFileSync(new URL("scripts/segment/spot-check.md", root), "utf8").trim();
  } catch {}
  md = md.replace("SPOT_CHECK_PLACEHOLDER", spot);
  for (const dir of ["outputs/", "founder/"]) {
    mkdirSync(new URL(dir, root), { recursive: true });
    writeFileSync(new URL(dir + "segment-coverage.md", root), md);
  }
  const ok = rows.filter((r) => r.verdicts);
  console.log(`targets ${rows.length}, found ${ok.length}, report-ready ${ok.filter((r) => !r.missing.length).length}, report-ready current ${ok.filter((r) => r.readyCurrent).length}`);
  for (const f of FIELDS)
    console.log(`  ${f.padEnd(20)} present ${pct(ok.filter((r) => r.verdicts![f].present).length, ok.length).padStart(4)}  sourced ${pct(ok.filter((r) => r.verdicts![f].sourced).length, ok.length).padStart(4)}  current ${pct(ok.filter((r) => r.verdicts![f].current).length, ok.length).padStart(4)}`);
  console.log("wrote outputs/segment-coverage.md and founder/segment-coverage.md");
}

await main();
