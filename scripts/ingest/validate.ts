// Row validation for the v2 ingest. Mirrors the CHECK constraints in
// supabase/proposals/20261115_data_v2.sql so bad rows are caught before COPY.
import { COST_CATEGORIES, DEADLINE_ROUNDS, PLATFORMS, REQUIREMENT_KINDS, type CatalogueTable } from "../../server/data-v2/schema";
import { isUuid } from "./lib";

type Row = Record<string, unknown>;
type Rule = (row: Row) => string | null;

const oneOf = (col: string, values: readonly unknown[], nullable = true): Rule => (r) =>
  r[col] == null ? (nullable ? null : `${col} is required`) : values.includes(r[col]) ? null : `${col}=${String(r[col])} not allowed`;
const range = (col: string, lo: number, hi: number): Rule => (r) =>
  r[col] == null ? null : typeof r[col] === "number" && (r[col] as number) >= lo && (r[col] as number) <= hi ? null : `${col}=${String(r[col])} outside ${lo}–${hi}`;
const required = (...cols: string[]): Rule => (r) => {
  const missing = cols.filter((c) => r[c] == null || r[c] === "");
  return missing.length ? `missing ${missing.join(", ")}` : null;
};
const uuid = (col: string, nullable = false): Rule => (r) =>
  r[col] == null ? (nullable ? null : `${col} is required`) : isUuid(r[col]) ? null : `${col} is not a uuid`;
const pattern = (col: string, re: RegExp): Rule => (r) => (r[col] == null || re.test(String(r[col])) ? null : `${col}=${String(r[col])} malformed`);
const date = (col: string): Rule => pattern(col, /^\d{4}-\d{2}-\d{2}$/);
const ISO2 = /^[A-Z]{2}$/;
const ISO3 = /^[A-Z]{3}$/;
const URL_RE = /^https?:\/\//;
const STATUS = ["required", "optional", "not_required", "conditional", "unknown"];

const RULES: Record<CatalogueTable, Rule[]> = {
  sources: [uuid("id"), required("url", "retrieved_at"), pattern("url", URL_RE), date("retrieved_at"),
    oneOf("source_type", ["official", "government", "ranking", "registry", "media", "aggregator", "provider", "other"], false)],
  universities: [uuid("id"), required("slug", "name", "country_code"), pattern("country_code", ISO2),
    oneOf("university_type", ["Public", "Private", "Other"]), range("founded_year", 800, 2035),
    range("latitude", -90, 90), range("longitude", -180, 180), uuid("source_id", true)],
  programmes: [uuid("id"), uuid("university_id"), required("name"),
    oneOf("degree_level", ["Foundation", "Bachelor", "Master", "Doctorate", "Diploma", "Other"], false),
    range("duration_years", 0.5, 8), oneOf("verification_status", ["staged", "verified"], false), uuid("source_id", true)],
  university_media: [uuid("id"), uuid("university_id"), oneOf("kind", ["logo", "campus", "photo", "video"], false),
    required("url"), pattern("url", /^(https?:\/\/|\/)/), oneOf("surface", ["light", "dark"]), uuid("source_id", true)],
  rankings: [uuid("id"), uuid("university_id"), required("publisher", "edition_year", "rank_label"),
    pattern("publisher", /^[a-z0-9_-]+$/), range("edition_year", 2000, 2035), range("rank", 1, 100000), uuid("source_id", true)],
  admissions: [uuid("id"), uuid("university_id"), required("intake_year"), range("intake_year", 2000, 2035),
    range("acceptance_rate", 0, 100), oneOf("platform", PLATFORMS), range("application_fee", 0, 10_000_000),
    pattern("application_fee_currency", ISO3), range("sat_min", 400, 1600), range("sat_max", 400, 1600),
    range("act_min", 1, 36), range("act_max", 1, 36),
    oneOf("sat_act_policy", ["required", "optional", "not_considered", "recommended", "unknown"]), uuid("source_id", true),
    (r) => (r.source_id ? null : "admission row has no source")],
  deadlines: [uuid("id"), uuid("university_id"), uuid("source_id"), required("intake_year", "round_label"),
    oneOf("round", DEADLINE_ROUNDS, false), date("due_date"), range("intake_year", 2000, 2035),
    (r) => (r.due_date || r.due_text ? null : "deadline has neither date nor text")],
  costs: [uuid("id"), uuid("university_id"), uuid("programme_id", true), uuid("source_id"),
    required("academic_year", "category", "currency"), pattern("academic_year", /^\d{4}\/\d{2}$/),
    oneOf("category", COST_CATEGORIES, false), pattern("currency", ISO3),
    oneOf("student_category", ["international", "in_state", "out_of_state", "domestic", "all"], false),
    oneOf("period", ["year", "semester", "term", "credit", "month", "total"], false),
    range("amount", 0, 1e12), range("range_min", 0, 1e12), range("range_max", 0, 1e12), range("amount_usd", 0, 1e7),
    (r) => (r.amount != null || r.range_min != null ? null : "cost has no amount")],
  application_requirements: [uuid("id"), uuid("university_id"), uuid("source_id"), required("kind", "label"),
    oneOf("kind", REQUIREMENT_KINDS, false), oneOf("status", STATUS, false),
    (r) => (r.kind === "IELTS" ? range("minimum", 0, 9)(r) : null),
    (r) => (r.kind === "TOEFL" ? range("minimum", 0, 120)(r) : null),
    (r) => (r.kind === "DUOLINGO" ? range("minimum", 10, 160)(r) : null),
    (r) => (r.kind === "SAT" ? range("minimum", 400, 1600)(r) : null)],
  programme_requirements: [uuid("id"), uuid("programme_id"), uuid("source_id"), required("kind", "label"),
    oneOf("kind", REQUIREMENT_KINDS, false), oneOf("status", STATUS, false)],
  scholarships: [uuid("id"), uuid("source_id"), required("slug", "name"), pattern("country_code", ISO2), pattern("currency", ISO3),
    oneOf("funding_type", ["full", "partial", "tuition", "stipend", "other"]), date("deadline"), range("amount", 0, 1e9)],
  scholarship_universities: [uuid("scholarship_id"), uuid("university_id"), uuid("source_id", true)],
  essay_prompts: [uuid("id"), uuid("source_id"), required("prompt", "intake_year"), range("word_limit", 1, 5000)],
};

export interface Reject {
  table: string;
  id: unknown;
  reasons: string[];
  row: Row;
}

/** Splits rows into valid ones and rejects (with reasons). Also drops duplicate primary keys. */
export function validateRows(table: CatalogueTable, rows: Row[], key: (r: Row) => string = (r) => String(r.id)): { ok: Row[]; rejects: Reject[] } {
  const ok: Row[] = [];
  const rejects: Reject[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const reasons = RULES[table].map((rule) => rule(row)).filter((x): x is string => !!x);
    const k = key(row);
    if (seen.has(k)) reasons.push("duplicate key");
    if (reasons.length) rejects.push({ table, id: row.id ?? k, reasons, row });
    else {
      seen.add(k);
      ok.push(row);
    }
  }
  return { ok, rejects };
}

/** Drops rows whose foreign keys point at rows that were not emitted. */
export function enforceForeignKey(rows: Row[], column: string, parents: Set<string>, nullable: boolean, table: string, rejects: Reject[]): Row[] {
  return rows.filter((row) => {
    const v = row[column];
    if (v == null && nullable) return true;
    if (typeof v === "string" && parents.has(v)) return true;
    rejects.push({ table, id: row.id, reasons: [`${column} references a missing row`], row });
    return false;
  });
}
