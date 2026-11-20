// Shared helpers for the v2 ingest (scripts/ingest/build-v2.ts): deterministic ids,
// JSON/CSV/NDJSON IO and the source registry. No network, no database.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ROOT = new URL("../../", import.meta.url).pathname;
export const path = (...parts: string[]) => join(ROOT, ...parts);

export function readJson<T = unknown>(rel: string): T {
  return JSON.parse(readFileSync(path(rel), "utf8")) as T;
}
/** Optional inputs (e.g. files another worker is still producing). */
export function readJsonIfExists<T = unknown>(rel: string): T | null {
  return existsSync(path(rel)) ? readJson<T>(rel) : null;
}
/** Array files and `{records: [...]}` wrappers both come back as the array. */
export function recordsOf<T = Record<string, unknown>>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const key of ["records", "items", "rows", "universities", "programmes", "programs"]) {
      const v = (data as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

// ── Deterministic UUIDs (RFC 4122 v5) so re-runs give identical rows ──

const NAMESPACE = "6f1c2b8e-3d4a-5e6f-8a9b-0c1d2e3f4a5b"; // fixed namespace for CollegeStat v2
const nsBytes = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");

export function uuidV5(name: string): string {
  const hash = createHash("sha1").update(nsBytes).update(name, "utf8").digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const idFor = (table: string, ...key: unknown[]) => uuidV5(table + "|" + key.map((k) => String(k ?? "")).join("|"));

// ── Small value helpers ──

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
export const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
};
/** YYYY-MM-DD from an ISO date or timestamp; null otherwise. */
export const isoDay = (v: unknown): string | null => {
  const s = str(v);
  const m = s && /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m && !Number.isNaN(Date.parse(m[1] + "T00:00:00Z")) ? m[1] : null;
};
export const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

// ── Sources ──

export interface SourceInput {
  url: unknown;
  retrieved_at?: unknown;
  title?: unknown;
  publisher?: unknown;
  source_type?: string;
  licence?: unknown;
  method?: unknown;
}
export interface SourceRecord {
  id: string;
  url: string;
  title: string | null;
  publisher: string | null;
  source_type: string;
  licence: string | null;
  retrieved_at: string;
  method: string | null;
  created_at: null;
}

/** Collects one row per URL; keeps the latest retrieved_at seen. */
export class SourceRegistry {
  readonly rows = new Map<string, SourceRecord>();
  /** Returns the source id, or null when the URL is not http(s) or no retrieval date is known. */
  add(input: SourceInput): string | null {
    const url = str(input.url);
    const day = isoDay(input.retrieved_at);
    if (!url || !/^https?:\/\//.test(url) || !day) return null;
    const id = idFor("source", url);
    const prev = this.rows.get(id);
    if (!prev) {
      this.rows.set(id, {
        id, url, title: str(input.title), publisher: str(input.publisher), source_type: input.source_type ?? "official",
        licence: str(input.licence), retrieved_at: day, method: str(input.method), created_at: null,
      });
    } else {
      if (day > prev.retrieved_at) prev.retrieved_at = day;
      prev.title ??= str(input.title);
      prev.publisher ??= str(input.publisher);
      prev.licence ??= str(input.licence);
      prev.method ??= str(input.method);
    }
    return id;
  }
}

// ── Output ──

type Cell = string | number | boolean | null | undefined | readonly string[] | Record<string, unknown> | unknown[];

const pgArray = (items: readonly string[]) =>
  "{" + items.map((s) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";

/** One CSV field for `COPY ... with (format csv, header true)`: NULL is an empty unquoted field. */
export function csvCell(value: Cell, column?: string): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "boolean") text = value ? "true" : "false";
  else if (typeof value === "number") text = String(value);
  else if (typeof value === "string") text = value;
  else if (Array.isArray(value) && !JSON_ARRAY_COLUMNS.has(column ?? "")) text = pgArray(value as string[]);
  else text = JSON.stringify(value);
  return text === "" || /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
/** jsonb columns holding arrays (everything else that is an array is text[]). */
const JSON_ARRAY_COLUMNS = new Set(["grades_raw", "tests", "activities", "honours", "checklist"]);

export function writeTable(dir: string, table: string, columns: readonly string[], rows: Record<string, unknown>[]) {
  mkdirSync(dir, { recursive: true });
  const csv = [columns.join(",")]
    .concat(rows.map((row) => columns.map((c) => csvCell(row[c] as Cell, c)).join(",")))
    .join("\n");
  writeFileSync(join(dir, table + ".csv"), csv + "\n");
  writeFileSync(join(dir, table + ".ndjson"), rows.map((r) => JSON.stringify(pick(r, columns))).join("\n") + (rows.length ? "\n" : ""));
}
const pick = (row: Record<string, unknown>, columns: readonly string[]) =>
  Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));

export function writeText(rel: string, text: string) {
  mkdirSync(dirname(path(rel)), { recursive: true });
  writeFileSync(path(rel), text);
}
