import { currency, type University } from "./domain";
import { deadlineDate } from "./application-dates";
import { latestReportedCosts } from "./profile-navigation";
import { rankLabel, rankingPublishers, universityRanks } from "./ranking-highlights";
import { valueOf } from "./research";
import { scoreBands } from "./my-colleges";

/** The handful of figures a student weighs first, each only when the profile
 * holds a sourced value for it. Labels are translated by the caller. */
export type KeyFactId = "rank" | "tuition" | "admission" | "sat" | "english" | "deadline";
/** Detail parts: plain strings are data (years, titles, publisher names);
 * `{ t }` parts are interface words the caller translates. */
export type KeyFactNote = "per_year" | "out_of_state" | "minimum" | "varies" | "mid50" | "average";
export type KeyFact = {
  id: KeyFactId;
  value: string;
  detail: (string | { t: KeyFactNote })[];
  href?: string;
};

const verified = (r: { verification_status?: string | null; canonical?: boolean | null }) =>
  r.verification_status === "verified" && r.canonical !== false;

function rankFact(u: University): KeyFact | null {
  const rank = universityRanks(u)[0];
  if (!rank) return null;
  const publisher = rankingPublishers[rank.provider];
  return {
    id: "rank",
    value: rankLabel(rank),
    detail: [(publisher?.name || rank.provider.toUpperCase()) + " " + rank.year],
    href: rank.url,
  };
}

// For tuition, international applicants pay the international or (in the US)
// out-of-state rate; an in-state or domestic figure would understate it.
const internationalCategory = /international|out[_ -]?of[_ -]?state|overseas|foreign|non[_ -]?eu|all students/i;

const SCORECARD_DATA = "https://collegescorecard.ed.gov/data/";
function tuitionFact(u: University): KeyFact | null {
  // Latest federal tuition and fees, labelled with its academic year.
  const cur = u.us_current;
  if (cur?.tuition_fees_out_of_state)
    return { id: "tuition", value: currency(cur.tuition_fees_out_of_state, "USD"), detail: [{ t: "per_year" }, cur.academic_year], href: SCORECARD_DATA };
  const rows = latestReportedCosts(u.costs).filter(
    (c) =>
      c.category === "tuition" &&
      !c.program_id &&
      verified(c) &&
      Number.isFinite(c.amount) &&
      c.amount > 0 &&
      internationalCategory.test(c.student_category),
  );
  const row = rows.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
  if (row)
    return {
      id: "tuition",
      value: currency(row.amount, row.currency),
      detail: [
        ...(row.period === "year" ? [{ t: "per_year" as const }] : []),
        ...(row.year != null ? [String(row.year)] : []),
      ],
    };
  const us = u.us_stats?.tuition_out_state;
  if (us && us > 0) return { id: "tuition", value: currency(us, "USD"), detail: [{ t: "per_year" }, { t: "out_of_state" }] };
  return null;
}

function admissionFact(u: University): KeyFact | null {
  const cur = u.us_current;
  if (cur?.acceptance_rate && cur.acceptance_rate > 0 && cur.acceptance_rate <= 100)
    return { id: "admission", value: cur.acceptance_rate.toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%", detail: [cur.academic_year], href: SCORECARD_DATA };
  const reported = valueOf(u, "admission");
  const record = reported.record;
  if (
    record &&
    verified(record) &&
    reported.value != null &&
    reported.value > 0 &&
    reported.value <= 100
  )
    return {
      id: "admission",
      value: reported.value.toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%",
      detail: record.year != null ? [String(record.year)] : [],
    };
  const scorecard = u.scorecard?.admission_rate_pct;
  if (scorecard && scorecard > 0 && scorecard <= 100)
    return {
      id: "admission",
      value: scorecard.toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%",
      detail: ["College Scorecard"],
    };
  return null;
}

/** Admitted SAT (else ACT): the middle 50% when published, else the average. */
function testFact(u: University): KeyFact | null {
  const b = scoreBands(u, {}).find((x) => x.test === "SAT" || x.test === "ACT");
  if (!b) return null;
  return {
    id: "sat",
    value: (b.test === "ACT" ? "ACT " : "") + (b.kind === "range" ? `${b.low}–${b.high}` : String(b.low)),
    detail: [{ t: b.kind === "range" ? "mid50" : "average" }, ...(b.year ? [b.year] : [])],
    href: b.source_url || undefined,
  };
}

function englishFact(u: University): KeyFact | null {
  for (const test of ["IELTS", "TOEFL"]) {
    const minima = u.requirements
      .filter(
        (r) =>
          r.kind.toUpperCase() === test &&
          verified(r) &&
          r.minimum != null &&
          !/foundation/i.test(r.label + " " + r.student_category),
      )
      .map((r) => r.minimum as number);
    if (minima.length) {
      const low = Math.min(...minima);
      return {
        id: "english",
        value: test + " " + low,
        detail:
          minima.length > 1 && Math.max(...minima) !== low
            ? [{ t: "minimum" }, { t: "varies" }]
            : [{ t: "minimum" }],
      };
    }
  }
  const reported = u.admissions.find((a) => a.ielts_min != null && verified(a));
  if (reported) return { id: "english", value: "IELTS " + reported.ielts_min, detail: [{ t: "minimum" }] };
  return null;
}

function deadlineFact(u: University, today: string): KeyFact | null {
  const next = u.deadlines
    .map((d) => ({ d, date: deadlineDate(d) }))
    .filter(({ date }) => date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const value = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(next.date + "T00:00:00Z"),
  );
  return {
    id: "deadline",
    value,
    detail: [next.d.title],
    href: next.d.source_url || next.d.application_url || undefined,
  };
}

export function profileKeyFacts(u: University, today = new Date().toISOString().slice(0, 10)): KeyFact[] {
  return [rankFact(u), tuitionFact(u), admissionFact(u), testFact(u), englishFact(u), deadlineFact(u, today)].filter(
    (f): f is KeyFact => !!f,
  );
}
