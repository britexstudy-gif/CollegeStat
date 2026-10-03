"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpRight,
  Check,
  CircleDashed,
  PlugZap,
  Send,
  ClipboardCheck,
  Sparkles,
  X,
} from "lucide-react";
import { callStaffTool, staffFetch } from "@/services/admin-client";
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
    source_url: string;
    year: number;
    minimum: number | null;
    required: boolean | null;
  }[];
  pending: number;
  conflicts: number;
  last_requirement_check: string | null;
};
export function AdminWorkbench({
  coverageOnly = false,
}: {
  coverageOnly?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [mode, setMode] = useState<"universities" | "sources" | "queue">(
      "universities",
    ),
    [rows, setRows] = useState<Row[]>([]),
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
  }, [coverageOnly]);
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
      if (!signal.aborted) setRows(data);
    });
  };
  const inspect = (id: string) =>
    void run(async (signal) => {
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
    <div className="staff-workbench">
      {!coverageOnly && (
        <div className="mcp-connected">
          <PlugZap size={18} />
          <div>
            <strong>CollegeStat MCP</strong>
            <span>
              5 scoped tools · Supabase session · Review before publication
            </span>
          </div>
          <span className="staff-status">
            <span />
            {connected ? "Connected" : error ? "Unavailable" : "Connecting"}
          </span>
        </div>
      )}
      <div className="mcp-workspace">
        <section className="mcp-browser">
          {!coverageOnly && (
            <nav className="mcp-tabs" aria-label="MCP data tools">
              {(["universities", "sources", "queue"] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => {
                    controller.current?.abort();
                    setBusy(false);
                    setMode(m);
                    setRows([]);
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
          <form className="mcp-search" onSubmit={search}>
            <Search size={17} />
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
            <button disabled={busy} aria-label="Run catalogue search">
              <Send size={16} />
            </button>
          </form>
          {!coverageOnly && (
            <button
              className="mcp-ask"
              onClick={ask}
              disabled={busy || !query.trim()}
            >
              <Sparkles size={14} /> Ask catalogue
            </button>
          )}
          {busy && (
            <p role="status" className="caption">
              Checking the database…
            </p>
          )}
          {assistantMode && (
            <p className="caption" role="status">
              {assistantMode}
            </p>
          )}
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="mcp-success" role="status">
              <ClipboardCheck size={16} />
              {message}
            </p>
          )}
          <div className="mcp-results">
            {rows.map((row) => (
              <div key={row.id}>
                <div>
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
                  <button onClick={() => inspect(row.id)} disabled={busy}>
                    Inspect <ArrowUpRight size={14} />
                  </button>
                ) : mode === "sources" ? (
                  <button
                    onClick={() => {
                      setSourceId(row.id);
                      setMessage("Source selected for staging.");
                    }}
                  >
                    Use source <Check size={14} />
                  </button>
                ) : (
                  <Link href={STAFF_PATH + "/review"}>
                    Review <ArrowUpRight size={14} />
                  </Link>
                )}
              </div>
            ))}
          </div>
          {!rows.length && !busy && (
            <div className="mcp-empty">
              <Search size={23} />
              <h3>
                {mode === "universities"
                  ? "Start with a university"
                  : mode === "sources"
                    ? "Find its evidence source"
                    : "Inspect the review queue"}
              </h3>
              <p>
                {mode === "universities"
                  ? "Search its name, then inspect verified evidence and gaps."
                  : mode === "sources"
                    ? "Registered sources retain the original URL and organization."
                    : "Search with an empty field for pending evidence, or type conflicting."}
              </p>
            </div>
          )}
        </section>
        <section className="mcp-inspector">
          {coverage ? (
            <>
              <div className="mcp-inspector-title">
                <div>
                  <span className="eyebrow">EVIDENCE COVERAGE</span>
                  <h2>{coverage.university.name}</h2>
                </div>
                <button
                  aria-label="Close university inspector"
                  onClick={() => setCoverage(null)}
                >
                  <X size={17} />
                </button>
              </div>
              <p className="caption">
                Verified structured records. A present category may still be
                incomplete.
              </p>
              <div className="coverage-categories">
                {coverage.categories.map((c) => (
                  <div key={c.key} className={c.count ? "present" : "missing"}>
                    {c.count ? <Check size={15} /> : <CircleDashed size={15} />}
                    <span>{c.label}</span>
                    <strong>{c.count || "Missing"}</strong>
                  </div>
                ))}
              </div>
              <div className="coverage-flags">
                <span>{coverage.pending} pending</span>
                <span>{coverage.conflicts} conflicting</span>
              </div>
              {coverage.last_requirement_check && (
                <p className="caption">
                  Latest requirement check:{" "}
                  {new Date(
                    coverage.last_requirement_check,
                  ).toLocaleDateString()}
                </p>
              )}
              {coverage.requirement_evidence.length > 0 && (
                <details className="coverage-evidence">
                  <summary>
                    Inspect requirement sources (
                    {coverage.requirement_evidence.length})
                  </summary>
                  {coverage.requirement_evidence.map((r) => (
                    <div key={r.id}>
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
                      <a href={r.source_url} target="_blank" rel="noreferrer">
                        Official source <ArrowUpRight size={12} />
                      </a>
                    </div>
                  ))}
                </details>
              )}
              <div className="mcp-inspector-actions">
                <Link
                  className="button button-secondary"
                  href={"/university/" + coverage.university.slug}
                >
                  Open profile <ArrowUpRight size={14} />
                </Link>
                {!coverageOnly && (
                  <button
                    className="button button-primary"
                    onClick={() => setShowStage(!showStage)}
                  >
                    Stage evidence
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="mcp-empty">
              <CircleDashed size={25} />
              <h3>See what needs attention</h3>
              <p>
                Select a university to see source-backed coverage, conflicts,
                and missing categories.
              </p>
            </div>
          )}
        </section>
      </div>
      {showStage && coverage && (
        <section className="mcp-stage">
          <h2>Stage a sourced observation</h2>
          <p>
            Numeric evidence goes to the existing review queue. Use Requirements
            or Programs to edit their structured records.
          </p>
          <StaffSecurity compact />
          <form onSubmit={stage}>
            <label>
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
              <label key={key}>
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
                  min={key === "year" ? 1900 : key === "value" ? 0 : undefined}
                  max={key === "year" ? 2100 : undefined}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <button className="button button-primary" disabled={busy}>
              Stage for review <ClipboardCheck size={14} />
            </button>
          </form>
        </section>
      )}
      {!coverageOnly && (
        <details className="mcp-connection">
          <summary>Connect an MCP client</summary>
          <p>
            Endpoint: <code>/api/staff/mcp</code> · Streamable HTTP ·{" "}
            {MCP_VERSION}. External clients need a current Supabase staff access
            token in the Authorization header. Tokens expire; this is not a
            public OAuth connector. Never use a service-role key.
          </p>
          <button
            className="button button-secondary"
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
                <code>{t.name}</code>
                <span>{t.description}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
