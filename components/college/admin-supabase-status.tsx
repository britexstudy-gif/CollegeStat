"use client";

export type AdminRow = { id: string; [key: string]: unknown };

export const ADMIN_PAGE_SIZE = 25;

/** Removing a final-page record must return the viewer to an existing page. */
export function adminPageForTotal(page: number, total: number): number {
  return Math.max(
    1,
    Math.min(page, Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))),
  );
}

export function adminRecordRange(page: number, total: number): string {
  if (!total) return "0 records";
  const current = adminPageForTotal(page, total);
  const first = (current - 1) * ADMIN_PAGE_SIZE + 1;
  const last = Math.min(current * ADMIN_PAGE_SIZE, total);
  return `${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()} records`;
}

/** Reject malformed files before staging; server validation remains authoritative. */
export function parseAdminImport(text: string): unknown[] {
  const value = text.replace(/^\uFEFF/, "").trim();
  if (!value) throw new Error("Add at least one sourced observation.");
  if (new TextEncoder().encode(value).length > 1000000)
    throw new Error("Import must be under 1 MB.");
  if (value.startsWith("[") || value.startsWith("{")) {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.length)
      throw new Error(
        "JSON imports must be a non-empty array of observations.",
      );
    if (
      parsed.some(
        (row) => !row || typeof row !== "object" || Array.isArray(row),
      )
    )
      throw new Error("Each JSON observation must be an object.");
    return parsed;
  }
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '"') {
      if (quoted && value[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quotation.");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = (rows.shift() || []).map((header) => header.trim());
  if (
    headers.some((header) => !header) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("CSV headers must be present and unique.");
  const observations = rows.filter((r) => r.some(Boolean));
  if (!observations.length)
    throw new Error("Add at least one sourced observation.");
  if (observations.some((r) => r.length !== headers.length))
    throw new Error(
      "Every CSV row must have the same number of fields as the header.",
    );
  return observations.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i]])),
  );
}

/** Tables that support free-text search; every other table needs a full UUID. */
export const TEXT_SEARCH_COLUMNS: Record<string, string> = {
  universities: "name",
  programs: "name",
  scholarships: "name",
  data_sources: "name",
  departments: "name",
  professors: "name",
  research: "title",
  deadlines: "title",
  requirements: "label",
  financial_aid: "name",
  profiles: "display_name",
  ingestion_feeds: "name",
  ranking_providers: "name",
};

export function recordTitle(row: AdminRow): string {
  const value =
    row.name ??
    row.title ??
    row.label ??
    row.display_name ??
    row.metric ??
    row.table_name ??
    row.id;
  return String(value ?? row.id);
}

type ChipTone =
  | "published"
  | "verified"
  | "ok"
  | "pending"
  | "review"
  | "conflict"
  | "failed"
  | "neutral";

/** Operation + source/publication state shown in every table row. */
export function recordState(row: AdminRow): { label: string; tone: ChipTone } {
  const status = String(row.status ?? "");
  const verification = String(row.verification_status ?? "");
  if (status === "failed") return { label: "Failed", tone: "failed" };
  if (status === "conflicting")
    return { label: "Conflicting", tone: "conflict" };
  if (status === "pending") return { label: "Pending review", tone: "pending" };
  if (status === "approved" || status === "completed" || status === "resolved")
    return { label: status[0].toUpperCase() + status.slice(1), tone: "ok" };
  if (verification === "needs_review")
    return { label: "Needs review", tone: "review" };
  if (verification === "verified")
    return { label: "Verified", tone: "verified" };
  if (row.published === true) return { label: "Published", tone: "published" };
  if (row.published === false) return { label: "Unpublished", tone: "pending" };
  if (row.permitted === true) return { label: "Permitted", tone: "verified" };
  if (row.permitted === false)
    return { label: "Not permitted", tone: "review" };
  if (typeof row.role === "string" && row.role)
    return { label: String(row.role), tone: "neutral" };
  if (status) return { label: status, tone: "neutral" };
  if (verification) return { label: verification, tone: "neutral" };
  return { label: "—", tone: "neutral" };
}

export function StatusChip({ row }: { row: AdminRow }) {
  const state = recordState(row);
  return (
    <span className={"sb-chip sb-chip-" + state.tone}>
      <span className="sb-dot" aria-hidden="true" />
      {state.label}
    </span>
  );
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.length ? `${value.length} items` : "—";
  if (typeof value === "object") return "{…}";
  return String(value);
}

export function isCellPrimitive(value: unknown): boolean {
  return isPrimitive(value);
}
