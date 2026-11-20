"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpRight,
  Check,
  CircleDashed,
  PlugZap,
  ClipboardCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useStaffAccount } from "./use-staff-account";
import { STAFF_PATH } from "@/lib/staff-route";
import { adminTools, MCP_VERSION, type AdminTool } from "@/lib/admin-mcp";
import { StaffSecurity } from "./staff-security";
type Row = {
  id: string;
  name?: string;
  slug?: string;
  website?: string;
  url?: string;
  organization?: string;
  metric?: string;
  normalized_value?: number;
  status?: string;
  year?: number;
  unit?: string;
  source_url?: string;
};
type Coverage = {
  university: Row;
  categories: { key: string; label: string; count: number }[];
  requirement_evidence: {
    id: string;
    label: string;
    student_category: string;
    source_url: string | null;
    year: number | null;
    minimum: number | null;
    required: boolean | null;
  }[];
  requirement_evidence_total: number;
  requirement_evidence_truncated: boolean;
  pending: number;
  conflicts: number;
  last_requirement_check: string | null;
};
export function AdminWorkbench({
  coverageOnly = false,
}: {
  coverageOnly?: boolean;
}) {
  const { callStaffTool, staffFetch } = useStaffAccount();
  const [query, setQuery] = useState(""),
    [mode, setMode] = useState<"universities" | "sources" | "queue">(
      "universities",
    ),
    [rows, setRows] = useState<Row[]>([]),
    [hasSearched, setHasSearched] = useState(false),
    [coverage, setCoverage] = useState<Coverage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [assistantMode, setAssistantMode] = useState(""),
    [showStage, setShowStage] = useState(false),
    [sourceId, setSourceId] = useState(""),
    [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState({
    metric: "",
    year: String(new Date().getFullYear()),
    value: "",
    unit: "",
    source_url: "",
    notes: "",
  });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (coverageOnly) return;
    const connection = new AbortController();
    void (async () => {
      try {
        const initialized = await staffFetch<{
          result?: { protocolVersion: string };
        }>(
          "/api/staff/mcp",
          {
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "initialize",
            params: {
              protocolVersion: MCP_VERSION,
              capabilities: {},
              clientInfo: { name: "collegestat-workbench", version: "1.0.0" },
            },
          },
          connection.signal,
        );
        if (initialized.result?.protocolVersion !== MCP_VERSION)
          throw new Error("MCP protocol negotiation failed");
        await staffFetch(
          "/api/staff/mcp",
          { jsonrpc: "2.0", method: "notifications/initialized" },
          connection.signal,
        );
        if (!connection.signal.aborted) setConnected(true);
      } catch (e) {
        if (!connection.signal.aborted)
          setError(e instanceof Error ? e.message : "MCP connection failed");
      }
    })();
    return () => connection.abort();
  }, [coverageOnly, staffFetch]);
  const run = async (fn: (signal: AbortSignal) => Promise<void>) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn(c.signal);
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  const search = (event?: React.FormEvent) => {
    event?.preventDefault();
    setAssistantMode("");
    const tool: AdminTool =
      mode === "sources"
        ? "list_sources"
        : mode === "queue"
          ? "review_queue"
          : "search_universities";
    void run(async (signal) => {
      const data = await callStaffTool<Row[]>(
        tool,
        mode === "queue"
          ? {
              status: query.toLowerCase().includes("conflict")
                ? "conflicting"
                : "pending",
              limit: 25,
            }
          : { query, limit: 25 },
        signal,
      );
      if (!signal.aborted) {
        setRows(data);
        setHasSearched(true);
      }
    });
  };
  const inspect = (id: string) =>
    void run(async (signal) => {
      setShowStage(false);
      setCoverage(null);
      setSourceId("");
      setDraft({
        metric: "",
        year: String(new Date().getFullYear()),
        value: "",
        unit: "",
        source_url: "",
        notes: "",
      });
      const data = await callStaffTool<Coverage>(
        "university_coverage",
        { university_id: id },
        signal,
      );
      if (!signal.aborted) setCoverage(data);
    });
  const ask = () =>
    void run(async (signal) => {
      const r = await staffFetch<{
        mode: string;
        tool: AdminTool;
        data: Coverage | Row[];
      }>(
        "/api/staff/assistant",
        {
          question: query,
          ...(coverage ? { university_id: coverage.university.id } : {}),
        },
        signal,
      );
      if (signal.aborted) return;
      setAssistantMode(
        r.mode === "ai"
          ? "AI selected a read tool. Results below come from the database."
          : "Catalogue tools · AI provider is not configured.",
      );
      if (r.tool === "university_coverage") setCoverage(r.data as Coverage);
      else {
        setCoverage(null);
        setShowStage(false);
        setRows(r.data as Row[]);
        setMode(
          r.tool === "list_sources"
            ? "sources"
            : r.tool === "review_queue"
              ? "queue"
              : "universities",
        );
      }
    });
  const stage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!coverage) return;
    void run(async (signal) => {
      const result = await callStaffTool<{
        accepted: number;
        duplicates: number;
      }>(
        "stage_observations",
        {
          source_id: sourceId,
          rows: [
            {
              ...draft,
              year: Number(draft.year),
              value: Number(draft.value),
              university_id: coverage.university.id,
            },
          ],
        },
        signal,
      );
      if (signal.aborted) return;
      setMessage(
        `${result.accepted} observation staged; ${result.duplicates} duplicates skipped. Open Review to inspect it before publication.`,
      );
      setShowStage(false);
    });
  };
  return (
    <>
      {!coverageOnly && (
        <div className="sb-conn">
          <PlugZap size={14} aria-hidden="true" />
          <span>
            Catalogue tool connection
            <small>
              Connection status describes the staff tools. AI availability is
              checked separately when you ask.
            </small>
          </span>
          <span
            className={
              "sb-chip " +
              (connected
                ? "sb-chip-ok"
                : error
                  ? "sb-chip-failed"
                  : "sb-chip-pending")
            }
          >
            <span className="sb-dot" aria-hidden="true" />
            {connected ? "Connected" : error ? "Unavailable" : "Connecting"}
          </span>
        </div>
      )}
      {(busy || assistantMode || error || message) && (
        <div className="sb-notices">
          {busy && (
            <p role="status" className="sb-status-line">
              Checking the database…
            </p>
          )}
          {assistantMode && (
            <p className="sb-status-line" role="status">
              {assistantMode}
            </p>
          )}
          {error && (
            <div className="sb-errorbar" role="alert">
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div className="sb-notice" role="status">
              <ClipboardCheck size={15} aria-hidden="true" />
              <span>{message}</span>
            </div>
          )}
        </div>
      )}
      <div className="sb-wb">
        <section className="sb-wb-list" aria-label="Catalogue search">
          {!coverageOnly && (
            <nav className="sb-wb-tabs" aria-label="MCP data tools">
              {(["universities", "sources", "queue"] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => {
                    controller.current?.abort();
                    setBusy(false);
                    setMode(m);
                    setRows([]);
                    setHasSearched(false);
                    setCoverage(null);
                    setShowStage(false);
                    setAssistantMode("");
                    setMessage("");
                    setQuery("");
                    setError("");
                  }}
                >
                  {m === "queue"
                    ? "Review queue"
                    : m === "sources"
                      ? "Sources"
                      : "Universities"}
                </button>
              ))}
            </nav>
          )}
          <form className="sb-wb-search" onSubmit={search}>
            <div className="sb-search-row" style={{ flex: 1 }}>
              <Search size={14} aria-hidden="true" />
              <input
                aria-label="Search staff catalogue"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={160}
                placeholder={
                  mode === "universities"
                    ? "Find a university…"
                    : mode === "sources"
                      ? "Find an official source…"
                      : "Pending or conflicting observations"
                }
              />
            </div>
            <button
              className="sb-btn"
              disabled={busy}
              aria-label="Run catalogue search"
            >
              {busy ? "Searching…" : "Search"}
            </button>
          </form>
          {!coverageOnly && (
            <div style={{ padding: "0 10px 8px" }}>
              <button
                className="sb-btn"
                onClick={ask}
                disabled={busy || !query.trim()}
              >
                <Sparkles size={13} aria-hidden="true" /> Ask catalogue
              </button>
            </div>
          )}
          <div
            className="sb-wb-results"
            role="list"
            aria-label="Catalogue results"
          >
            {rows.map((row) => (
              <div className="sb-wb-row" role="listitem" key={row.id}>
                <div style={{ minWidth: 0 }}>
                  <strong>{row.name || row.metric}</strong>
                  <small>
                    {row.organization ||
                      row.website ||
                      [row.normalized_value, row.unit, row.year, row.status]
                        .filter((v) => v != null)
                        .join(" · ")}
                  </small>
                </div>
                {mode === "universities" ? (
                  <button
                    type="button"
                    className="sb-text-btn"
                    onClick={() => inspect(row.id)}
                    disabled={busy}
                  >
                    Inspect <ArrowUpRight size={12} aria-hidden="true" />
                  </button>
                ) : mode === "sources" ? (
                  <button
                    type="button"
                    className="sb-text-btn"
                    onClick={() => {
                      setSourceId(row.id);
                      setMessage("Source selected for staging.");
                    }}
                  >
                    Use source <Check size={12} aria-hidden="true" />
                  </button>
                ) : (
                  <Link className="sb-link" href={STAFF_PATH + "/review"}>
                    Review <ArrowUpRight size={12} aria-hidden="true" />
                  </Link>
                )}
              </div>
            ))}
            {!rows.length && !busy && (
              <div className="sb-wb-empty">
                <Search size={20} aria-hidden="true" />
                <p>
                  <strong>
                    {hasSearched
                      ? "No matching records"
                      : mode === "universities"
                        ? "Start with an institution"
                        : mode === "sources"
                          ? "Find its evidence source"
                          : "Inspect the review queue"}
                  </strong>
                </p>
                <p>
                  {hasSearched
                    ? "Try a shorter name or clear the search to browse records."
                    : mode === "universities"
                      ? "Search by name, or browse institutions to inspect verified evidence and missing categories."
                      : mode === "sources"
                        ? "Registered sources retain the original URL and organization."
                        : "Search with an empty field for pending evidence, or type conflicting."}
                </p>
                {!hasSearched && (
                  <button
                    type="button"
                    className="sb-btn"
                    onClick={() => search()}
                  >
                    {mode === "universities"
                      ? "Browse institutions"
                      : mode === "sources"
                        ? "Browse sources"
                        : "Load pending evidence"}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
        <section
          className={
            "sb-wb-inspector" + (!coverage ? " sb-wb-inspector-empty" : "")
          }
          aria-label="Evidence inspector"
        >
          {coverage ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <div>
                  <div className="sb-section-title">Evidence coverage</div>
                  <h2>{coverage.university.name}</h2>
                </div>
                <button
                  type="button"
                  className="sb-drawer-close"
                  aria-label="Close university inspector"
                  onClick={() => setCoverage(null)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
              <p className="sb-uuid-hint">
                Verified structured records. A present category may still be
                incomplete.
              </p>
              <div className="sb-coverage-grid">
                {coverage.categories.map((c) => (
                  <div
                    key={c.key}
                    className={
                      "sb-coverage-cell" + (c.count ? "" : " sb-missing")
                    }
                  >
                    {c.count ? (
                      <Check
                        size={13}
                        className="sb-check"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleDashed size={13} aria-hidden="true" />
                    )}
                    <span>{c.label}</span>
                    <strong>{c.count || "Missing"}</strong>
                  </div>
                ))}
              </div>
              <div className="sb-flags">
                <span className="sb-chip sb-chip-pending">
                  <span className="sb-dot" aria-hidden="true" />
                  {coverage.pending} pending
                </span>
                <span className="sb-chip sb-chip-conflict">
                  <span className="sb-dot" aria-hidden="true" />
                  {coverage.conflicts} conflicting
                </span>
              </div>
              {coverage.last_requirement_check && (
                <p className="sb-uuid-hint">
                  Latest requirement check:{" "}
                  {new Date(
                    coverage.last_requirement_check,
                  ).toLocaleDateString()}
                </p>
              )}
              {coverage.requirement_evidence.length > 0 && (
                <details className="sb-details">
                  <summary>
                    Inspect requirement sources (
                    {coverage.requirement_evidence.length}
                    {coverage.requirement_evidence_truncated
                      ? ` of ${coverage.requirement_evidence_total}`
                      : ""}
                    )
                  </summary>
                  {coverage.requirement_evidence_truncated && (
                    <p className="sb-uuid-hint">
                      This is a bounded evidence preview. Open Requirements in
                      the catalogue to inspect the remaining records.
                    </p>
                  )}
                  {coverage.requirement_evidence.map((r) => (
                    <div className="sb-evidence-row" key={r.id}>
                      <strong>
                        {r.label}
                        {r.minimum !== null ? ` · ${r.minimum}` : ""}
                      </strong>
                      <p>
                        {r.student_category} ·{" "}
                        {r.required === true
                          ? "Required"
                          : r.required === false
                            ? "Optional"
                            : "Status to confirm"}
                      </p>
                      {r.source_url ? (
                        <a
                          className="sb-link"
                          href={r.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Official source{" "}
                          <ArrowUpRight size={11} aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="sb-uuid-hint">
                          Record source URL is missing; inspect the registered
                          source.
                        </span>
                      )}
                    </div>
                  ))}
                </details>
              )}
              <div className="sb-row-actions" style={{ marginTop: 8 }}>
                <Link
                  className="sb-btn"
                  href={"/university/" + coverage.university.slug}
                >
                  Open profile <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
                {!coverageOnly && (
                  <button
                    className="sb-btn sb-btn-primary"
                    onClick={() => setShowStage(!showStage)}
                  >
                    Stage evidence
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="sb-wb-empty">
              <CircleDashed size={22} aria-hidden="true" />
              <p>
                <strong>See what needs attention</strong>
              </p>
              <p>
                Select an institution from the results to inspect its evidence.
              </p>
              <ol className="sb-coverage-steps">
                <li>Check which categories have verified records.</li>
                <li>Open original sources and confirm the reporting year.</li>
                <li>Resolve pending evidence in Review.</li>
              </ol>
              <Link className="sb-link" href={STAFF_PATH + "/review"}>
                Go to review queue <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>
      </div>
      {showStage && coverage && (
        <section
          className="sb-panel-block"
          aria-label="Stage a sourced observation"
        >
          <h2>Stage a sourced observation</h2>
          <p>
            Numeric evidence goes to the existing review queue. Use Requirements
            or Programs to edit their structured records.
          </p>
          <StaffSecurity compact />
          <form onSubmit={stage}>
            <div className="sb-form-grid">
              <label className="sb-field">
                Registered source ID
                <input
                  required
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  placeholder="Select a source in the Sources tab"
                />
              </label>
              {(
                [
                  ["metric", "Metric key"],
                  ["year", "Reporting year"],
                  ["value", "Reported value"],
                  ["unit", "Unit"],
                  ["source_url", "Original HTTPS source URL"],
                  ["notes", "Scope and population notes"],
                ] as const
              ).map(([key, label]) => (
                <label className="sb-field" key={key}>
                  {label}
                  <input
                    required={key !== "notes"}
                    type={
                      key === "source_url"
                        ? "url"
                        : key === "value" || key === "year"
                          ? "number"
                          : "text"
                    }
                    step={key === "value" ? "any" : undefined}
                    min={
                      key === "year" ? 1900 : key === "value" ? 0 : undefined
                    }
                    max={key === "year" ? 2100 : undefined}
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <button className="sb-btn sb-btn-primary" disabled={busy}>
              Stage for review <ClipboardCheck size={13} aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
      {!coverageOnly && (
        <details className="sb-details" style={{ margin: "12px 14px" }}>
          <summary>Connect an MCP client</summary>
          <p className="sb-uuid-hint">
            Endpoint: <code>/api/staff/mcp</code> · Streamable HTTP ·{" "}
            {MCP_VERSION}. External clients need a current Supabase staff access
            token in the Authorization header. Tokens expire; this is not a
            public OAuth connector. Never use a service-role key.
          </p>
          <button
            className="sb-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  window.location.origin + "/api/staff/mcp",
                );
                setMessage("MCP endpoint copied.");
              } catch {
                setError("Could not copy. Use the endpoint above.");
              }
            }}
          >
            Copy endpoint
          </button>
          <ul>
            {adminTools.map((t) => (
              <li key={t.name}>
                <code>{t.name}</code> <span>{t.description}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
