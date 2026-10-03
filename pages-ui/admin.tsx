"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Database,
  ShieldCheck,
  ArrowLeft,
  ArrowUpRight,
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  Trophy,
  Wallet,
  Link2,
  FileCheck2,
  CalendarDays,
  Images,
  Users,
  FlaskConical,
  Upload,
  ClipboardCheck,
  Radio,
  Activity,
  Fingerprint,
  UserPlus,
  Clock,
  ScrollText,
  Settings,
  RefreshCw,
  PlugZap,
  CircleDashed,
} from "lucide-react";
import { AdminWorkbench } from "@/components/college/admin-workbench";
import { StaffSecurity } from "@/components/college/staff-security";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { STAFF_PATH } from "@/lib/staff-route";
import { useCollege } from "@/components/college/provider";
import { EmptyState, Brand, Choice } from "@/components/college/primitives";
import { getSupabase } from "@/lib/supabase/client";
import {
  fieldDefinitions,
  Entity,
  entitySchemas,
} from "@/services/admin-schema";
type AdminRow = { id: string; [key: string]: unknown };
const navigation = [
  {
    label: "Workspace",
    items: [
      ["Overview", LayoutDashboard],
      ["Review", ClipboardCheck],
      ["Candidates", UserPlus],
      ["Stale", Clock],
    ],
  },
  {
    label: "Catalogue",
    items: [
      ["Universities", GraduationCap],
      ["Programs", BookOpen],
      ["Requirements", FileCheck2],
      ["Deadlines", CalendarDays],
      ["Rankings", Trophy],
      ["Scholarships", Wallet],
      ["Connections", Link2],
      ["Aid", Wallet],
      ["Media", Images],
      ["Departments", Users],
      ["Faculty", Users],
      ["Research", FlaskConical],
    ],
  },
  {
    label: "Data operations",
    items: [
      ["Sources", Database],
      ["Imports", Upload],
      ["Feeds", Radio],
      ["Jobs", Activity],
      ["Identifiers", Fingerprint],
      ["Users", Users],
      ["Reports", ScrollText],
      ["Settings", Settings],
    ],
  },
] as const;
const tableFor: Record<string, string> = {
  Universities: "universities",
  Programs: "programs",
  Rankings: "ranking_providers",
  Scholarships: "scholarships",
  Connections: "university_scholarships",
  Sources: "data_sources",
  Imports: "data_imports",
  Review: "source_records",
  Users: "profiles",
  Reports: "audit_logs",
  Departments: "departments",
  Faculty: "professors",
  Research: "research",
  Deadlines: "deadlines",
  Requirements: "requirements",
  Aid: "financial_aid",
  Media: "media",
  Feeds: "ingestion_feeds",
  Jobs: "ingestion_jobs",
  Identifiers: "external_identifiers",
  Candidates: "institution_candidates",
  Stale: "stale_evidence",
};
async function adminRequest(body: unknown) {
  const db = getSupabase(),
    session = await db?.auth.getSession();
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + session?.data.session?.access_token,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error || "Admin operation failed"));
  return data as Record<string, unknown>;
}
export default function Admin({ section = "Overview" }: { section?: string }) {
  const s = useCollege();
  const [rows, setRows] = useState<AdminRow[]>([]),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(false),
    [total, setTotal] = useState(0),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<AdminRow | null>(null),
    [entity, setEntity] = useState<Entity>(
      (tableFor[section] || "universities") as Entity,
    ),
    [sourceId, setSourceId] = useState(""),
    [importText, setImportText] = useState(""),
    [busy, setBusy] = useState(false),
    [importResult, setImportResult] = useState("");
  const table =
    section === "Rankings" || section === "Programs"
      ? entity
      : tableFor[section];
  const role = s.profile?.role;
  const revision = useRef(0);
  useEffect(() => {
    setEntity((tableFor[section] || "universities") as Entity);
    setPage(1);
    setSearch("");
    setEditing(null);
    const counter = revision;
    return () => {
      counter.current++;
    };
  }, [section, s.user?.id]);
  const load = useCallback(async () => {
    const db = getSupabase();
    const current = ++revision.current;
    if (!db || role !== "admin") {
      setRows([]);
      setCounts({});
      return;
    }
    setLoading(true);
    setError("");
    setRows([]);
    try {
      if (table) {
        const textColumns: Record<string, string> = {
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
        let request = db
          .from(table)
          .select("*", { count: "exact" })
          .order("id")
          .range((page - 1) * 25, page * 25 - 1);
        const value = search.trim();
        if (value) {
          if (
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              value,
            )
          )
            request = request.eq("id", value);
          else if (textColumns[table])
            request = request.ilike(
              textColumns[table],
              "%" + value.replace(/[\\%_]/g, (char) => "\\" + char) + "%",
            );
          else {
            setTotal(0);
            setError("Search this table with a complete record UUID.");
            return;
          }
        }
        const { data, error, count } = await request;
        if (current !== revision.current) return;
        if (error) throw error;
        setRows((data || []) as AdminRow[]);
        setTotal(count || 0);
      } else if (section === "Overview") {
        const names = [
          "universities",
          "scholarships",
          "data_sources",
          "source_records",
          "data_quality_checks",
          "data_imports",
        ];
        const results = await Promise.all(
          names.map((t) =>
            db.from(t).select("id", { head: true, count: "exact" }),
          ),
        );
        if (current !== revision.current) return;
        if (results.some((r) => r.error))
          throw new Error("Database unavailable");
        setCounts(
          Object.fromEntries(
            names.map((name, i) => [name, results[i].count || 0]),
          ),
        );
      }
    } catch {
      if (current === revision.current) {
        setRows([]);
        setCounts({});
        setTotal(0);
        setError(
          "Database records could not load. Check that the hosted schema is installed and your account has administrator access.",
        );
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [role, section, table, page, search]);
  useEffect(() => {
    const counter = revision;
    const timer = setTimeout(() => {
      void load();
    }, 180);
    return () => {
      clearTimeout(timer);
      counter.current++;
    };
  }, [load]);
  if (!s.authReady)
    return (
      <EmptyState
        title="Checking access…"
        description="Restoring your authenticated role."
      />
    );
  if (!s.user || role !== "admin")
    return (
      <div className="staff-gate">
        <Brand />
        <section>
          <div className="staff-lock">
            <ShieldCheck size={28} />
          </div>
          <span className="eyebrow">PRIVATE STAFF WORKSPACE</span>
          <h1>
            {s.user
              ? "This account has no staff access."
              : "CollegeStat console"}
          </h1>
          <p>
            Manage university records, review sources, and publish verified
            information. Access requires an administrator role.
          </p>
          <Link
            className="button button-primary"
            href={"/auth/sign-in?next=" + encodeURIComponent(STAFF_PATH)}
          >
            Admin sign-in <ArrowUpRight size={16} />
          </Link>
          <Link className="text-link" href="/">
            <ArrowLeft size={15} /> Return to CollegeStat
          </Link>
        </section>
      </div>
    );
  const runImport = async () => {
    setBusy(true);
    setImportResult("");
    try {
      const rows = parseImport(importText);
      const r = await adminRequest({
        action: "import",
        source_id: sourceId,
        rows,
      });
      setImportResult(
        `${r.accepted} observations staged; ${r.rejected} rejected. Review before publishing.\n${(r.warnings as string[]).join("\n")}`,
      );
      await load();
    } catch (e) {
      setImportResult(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };
  const review = async (id: string, approve: boolean) => {
    try {
      await adminRequest({ action: "review", id, approve });
      toast.success(approve ? "Observation approved" : "Observation rejected");
      await load();
    } catch {
      toast.error(
        "Review failed. Check for an existing observation or invalid source.",
      );
    }
  };
  return (
    <div className="admin-layout">
      <aside className="admin-rail">
        <Brand />
        <div className="staff-badge">
          <ShieldCheck size={13} /> Admin workspace
        </div>
        <nav aria-label="Database console">
          <div className="admin-nav-group admin-primary-nav">
            {(
              [
                ["Overview", LayoutDashboard],
                ["Coverage", CircleDashed],
                ["Universities", GraduationCap],
                ["Review", ClipboardCheck],
                ["Mcp", PlugZap],
                ["Security", ShieldCheck],
              ] as const
            ).map(([name, Icon]) => (
              <Link
                key={name}
                aria-current={section === name ? "page" : undefined}
                className={section === name ? "active" : ""}
                href={
                  name === "Overview"
                    ? STAFF_PATH
                    : STAFF_PATH + "/" + name.toLowerCase()
                }
              >
                <Icon size={16} />
                {name === "Mcp" ? "AI & MCP" : name}
              </Link>
            ))}
          </div>
          {navigation.slice(1).map((group) => (
            <details
              className="admin-nav-group admin-nav-more"
              key={group.label}
              open={group.items.some(([name]) => name === section)}
            >
              <summary>{group.label}</summary>
              <span>{group.label}</span>
              {group.items
                .filter(([name]) => name !== "Universities")
                .map(([name, Icon]) => (
                  <Link
                    key={name}
                    aria-current={section === name ? "page" : undefined}
                    className={section === name ? "active" : ""}
                    href={
                      name === "Overview"
                        ? STAFF_PATH
                        : STAFF_PATH + "/" + name.toLowerCase()
                    }
                  >
                    <Icon size={16} />
                    {name}
                  </Link>
                ))}
            </details>
          ))}
          <details
            className="admin-nav-group admin-nav-more"
            open={["Candidates", "Stale"].includes(section)}
          >
            <summary>Identity & freshness</summary>
            {navigation[0].items.slice(2).map(([name, Icon]) => (
              <Link
                key={name}
                href={STAFF_PATH + "/" + name.toLowerCase()}
                className={section === name ? "active" : ""}
              >
                <Icon size={16} />
                {name}
              </Link>
            ))}
          </details>
        </nav>
        <Link className="text-link" href="/">
          <ArrowLeft size={15} /> Public website
        </Link>
      </aside>
      <div className="admin-content">
        <div className="admin-topline">
          <span>
            <Database size={15} /> Supabase database
          </span>
          <Link href="/dashboard">
            My dashboard <ArrowUpRight size={14} />
          </Link>
        </div>
        <header className="page-intro">
          <div>
            <div className="eyebrow">CONSOLE / {section.toUpperCase()}</div>
            <h1>
              {section === "Overview"
                ? "Catalogue workspace"
                : section === "Mcp"
                  ? "AI & MCP"
                  : section}
            </h1>
            <p>
              {section === "Overview"
                ? "Check coverage, review sources, and maintain the published catalogue."
                : section === "Mcp"
                  ? "Inspect the catalogue and stage evidence with scoped tools."
                  : section === "Coverage"
                    ? "Find missing structured evidence and inspect original sources."
                    : section === "Security"
                      ? "Protect your account and verify this staff session."
                      : "Sourced records · Validated changes · Audit history"}
            </p>
          </div>
          <button
            className="button button-secondary"
            disabled={loading}
            onClick={load}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </header>
        {table && (
          <div className="admin-record-controls">
            <input
              aria-label="Search database records"
              placeholder="Search name or paste a record UUID"
              maxLength={120}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <span className="caption">
              {loading
                ? "Loading records…"
                : total.toLocaleString() + " records"}
            </span>
          </div>
        )}
        {section === "Connections" && (
          <p className="caption">
            Connect an existing scholarship to a university using their record
            IDs. Edit award details in Scholarships; each connection appears on
            the university’s funding page.
          </p>
        )}
        {loading && (
          <p role="status" className="caption">
            Loading the hosted database…
          </p>
        )}
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={load}>Retry</button>
          </div>
        )}
        {section === "Mcp" || section === "Coverage" ? (
          <AdminWorkbench
            key={s.user.id + section}
            coverageOnly={section === "Coverage"}
          />
        ) : section === "Security" ? (
          <StaffSecurity key={s.user.id} />
        ) : section === "Overview" ? (
          <>
            <StaffSecurity compact />
            <div className="admin-quicklinks">
              {[
                [
                  "Coverage",
                  "Find gaps in verified university evidence",
                  CircleDashed,
                ],
                [
                  "Mcp",
                  "Search, inspect and stage sourced observations",
                  PlugZap,
                ],
                [
                  "Scholarships",
                  "Publish awards and connect universities",
                  Wallet,
                ],
                ["Review", "Check evidence before publication", ClipboardCheck],
              ].map(([name, description, I]) => {
                const Icon = I as typeof Database;
                return (
                  <Link
                    key={String(name)}
                    href={STAFF_PATH + "/" + String(name).toLowerCase()}
                  >
                    <Icon size={22} />
                    <strong>{String(name)}</strong>
                    <span>{String(description)}</span>
                    <ArrowUpRight size={16} />
                  </Link>
                );
              })}
            </div>
            <div className="stats-row">
              {Object.entries(counts)
                .slice(0, 4)
                .map(([k, v]) => (
                  <div key={k}>
                    <span>{k.replaceAll("_", " ")}</span>
                    <strong>{v.toLocaleString()}</strong>
                    <small>Live database count</small>
                  </div>
                ))}
            </div>
            <div className="detail-grid">
              <section className="panel">
                <h2>Quality checks</h2>
                <strong className="number" style={{ fontSize: 36 }}>
                  {counts.data_quality_checks ?? "—"}
                </strong>
                <p className="caption">
                  Stored validation warnings. Review imported observations
                  before approving them.
                </p>
                <Link className="text-link" href={STAFF_PATH + "/review"}>
                  Open review queue →
                </Link>
              </section>
              <section className="panel">
                <h2>Import operations</h2>
                <strong className="number" style={{ fontSize: 36 }}>
                  {counts.data_imports ?? "—"}
                </strong>
                <p className="caption">
                  Import jobs retain accepted and rejected counts, warnings, and
                  completion status.
                </p>
                <Link className="text-link" href={STAFF_PATH + "/imports"}>
                  Inspect imports →
                </Link>
              </section>
            </div>
          </>
        ) : section === "Settings" ? (
          <section className="panel">
            <h2>Operational configuration</h2>
            <p className="caption">
              Authentication providers, redirect URLs, secret rotation, and
              service credentials are managed in Supabase and server environment
              settings. Profile roles cannot be changed through the public
              application.
            </p>
            <Link
              className="text-link"
              href="/methodology"
              style={{ marginTop: 20 }}
            >
              Review data publication rules →
            </Link>
          </section>
        ) : (
          <>
            {table && table in entitySchemas && (
              <div className="control-row" style={{ marginBottom: 20 }}>
                {section === "Rankings" && (
                  <Choice
                    label="Ranking entity"
                    value={entity}
                    onChange={(v) => setEntity(v as Entity)}
                    options={[
                      "ranking_providers",
                      "ranking_editions",
                      "ranking_entries",
                    ]}
                  />
                )}{" "}
                {section === "Programs" && (
                  <Choice
                    label="Program entity"
                    value={entity}
                    onChange={(v) => setEntity(v as Entity)}
                    options={["programs", "university_programs"]}
                  />
                )}
                <button
                  className="button button-primary"
                  onClick={() => {
                    setEntity(table as Entity);
                    setEditing({ id: "" });
                  }}
                >
                  Create {table?.replaceAll("_", " ")}
                </button>
              </div>
            )}
            {section === "Imports" && (
              <section className="panel" style={{ marginBottom: 24 }}>
                <h2>Stage sourced observations</h2>
                <p className="caption">
                  CSV or JSON. Fields: university_id, metric, year, value, unit,
                  source_url, notes. Canonical values remain untouched until
                  review.
                </p>
                <label className="form-field" style={{ marginTop: 20 }}>
                  Source ID
                  <input
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                  />
                </label>
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  aria-label="Import CSV or JSON"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 1000000) {
                        toast.error("Import must be under 1 MB");
                        return;
                      }
                      setImportText(await file.text());
                    }
                  }}
                />
                <textarea
                  className="code-input"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  aria-label="Import observations"
                  placeholder="Paste a JSON array or CSV with headers"
                />
                <button
                  className="button button-primary"
                  disabled={busy || !sourceId || !importText}
                  onClick={runImport}
                >
                  {busy ? "Validating…" : "Validate and stage import"}
                </button>
                {importResult && (
                  <pre
                    className="caption"
                    style={{ whiteSpace: "pre-wrap", marginTop: 15 }}
                  >
                    {importResult}
                  </pre>
                )}
              </section>
            )}
            <div className="control-row" style={{ marginBottom: 16 }}>
              <button
                className="button button-secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span className="caption">
                Page {page} of {Math.max(1, Math.ceil(total / 25))} · {total}{" "}
                records
              </span>
              <button
                className="button button-secondary"
                disabled={page * 25 >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
            <div className="table-wrap">
              <table className="research-table">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Details</th>
                    <th>State</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && !error && !rows.length && (
                    <tr>
                      <td colSpan={4}>
                        No records match. Clear your search or create a sourced
                        record.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {String(
                          r.name ||
                            r.title ||
                            r.label ||
                            r.display_name ||
                            r.metric ||
                            r.table_name ||
                            r.id,
                        )}
                        <p className="caption">{r.id}</p>
                      </td>
                      <td>
                        <details>
                          <summary className="text-link">
                            Inspect fields
                          </summary>
                          <pre
                            className="caption"
                            style={{ maxWidth: 500, whiteSpace: "pre-wrap" }}
                          >
                            {JSON.stringify(r, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td>
                        {String(
                          r.status ||
                            r.verification_status ||
                            r.role ||
                            (r.published === true ? "Published" : "—"),
                        )}
                      </td>
                      <td>
                        {r.verification_status === "needs_review" &&
                          table &&
                          table in entitySchemas && (
                            <button
                              className="text-link"
                              onClick={async () => {
                                try {
                                  await adminRequest({
                                    action: "verify",
                                    entity: table,
                                    id: r.id,
                                  });
                                  await load();
                                  toast.success("Source verified");
                                } catch {
                                  toast.error("Verification failed");
                                }
                              }}
                            >
                              Verify source ·{" "}
                            </button>
                          )}
                        {section === "Jobs" && r.status === "failed" && (
                          <button
                            onClick={async () => {
                              try {
                                await adminRequest({
                                  action: "retry",
                                  id: r.id,
                                });
                                await load();
                              } catch {
                                toast.error("Retry failed");
                              }
                            }}
                          >
                            Retry job
                          </button>
                        )}
                        {section === "Candidates" && r.status === "pending" ? (
                          <CandidateReview id={r.id} onReviewed={load} />
                        ) : table && table in entitySchemas ? (
                          <button
                            className="text-link"
                            onClick={() => {
                              setEntity(table as Entity);
                              setEditing(r);
                            }}
                          >
                            Edit →
                          </button>
                        ) : section === "Review" &&
                          ["pending", "conflicting"].includes(
                            String(r.status),
                          ) ? (
                          <div className="control-row">
                            <button
                              className="text-link"
                              onClick={() => review(r.id, true)}
                            >
                              Approve
                            </button>
                            <button onClick={() => review(r.id, false)}>
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="caption">Read-only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && !error && !rows.length && (
              <EmptyState
                title="No records yet"
                description="Create a source, then add canonical identities or stage an import for review."
              />
            )}
            <p className="reference-note">
              Showing 25 records per page. Raw observations and audit entries
              retain their history.
            </p>
          </>
        )}
        <EntityEditor
          key={editing?.id || "new" + entity}
          entity={entity}
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            void s.refresh();
          }}
        />
      </div>
    </div>
  );
}
function EntityEditor({
  entity,
  record,
  onClose,
  onSaved,
}: {
  entity: Entity;
  record: AdminRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(record || {}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setValues(record || {});
    setError("");
  }, [record]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adminRequest({
        action: "save",
        entity,
        record: { ...values, id: record?.id || undefined },
      });
      onSaved();
      toast.success("Record saved with audit history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!record} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        style={{ maxWidth: 740, maxHeight: "90vh", overflow: "auto" }}
      >
        <DialogTitle>
          {record?.id ? "Edit" : "Create"} {entity.replaceAll("_", " ")}
        </DialogTitle>
        <DialogDescription>
          Validation runs on the server. Content changes are recorded in the
          audit log.
        </DialogDescription>
        <form onSubmit={save}>
          <div className="form-grid">
            {(fieldDefinitions[entity] || []).map((f) =>
              f.type === "requirement" ? (
                <label className="form-field" key={f.key}>
                  {f.label}
                  <select
                    value={
                      values[f.key] == null
                        ? "unspecified"
                        : String(values[f.key])
                    }
                    onChange={(e) =>
                      setValues((old) => ({
                        ...old,
                        [f.key]:
                          e.target.value === "unspecified"
                            ? null
                            : e.target.value === "true",
                      }))
                    }
                  >
                    <option value="unspecified">
                      Unspecified / conditional
                    </option>
                    <option value="true">
                      Required for this applicant category
                    </option>
                    <option value="false">
                      Optional for this applicant category
                    </option>
                  </select>
                </label>
              ) : f.type === "boolean" ? (
                <label className="filter-checkbox" key={f.key}>
                  <Checkbox
                    checked={values[f.key] === true}
                    onCheckedChange={(v) =>
                      setValues((old) => ({ ...old, [f.key]: !!v }))
                    }
                  />
                  {f.label}
                </label>
              ) : (
                <label className="form-field" key={f.key}>
                  {f.label}
                  {f.type === "textarea" ? (
                    <textarea
                      value={String(values[f.key] ?? "")}
                      onChange={(e) =>
                        setValues((old) => ({
                          ...old,
                          [f.key]: e.target.value || null,
                        }))
                      }
                    />
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      value={String(values[f.key] ?? "")}
                      onChange={(e) =>
                        setValues((old) => ({
                          ...old,
                          [f.key]: e.target.value
                            ? f.type === "number"
                              ? Number(e.target.value)
                              : e.target.value
                            : null,
                        }))
                      }
                    />
                  )}
                </label>
              ),
            )}
          </div>
          {entity === "universities" && (
            <label className="form-field">
              Institution logo (PNG, JPEG, WebP; max 5 MB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0],
                    db = getSupabase();
                  if (!file || !db) return;
                  if (
                    file.size > 5242880 ||
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    )
                  ) {
                    setError("Choose a PNG, JPEG, or WebP under 5 MB.");
                    return;
                  }
                  setBusy(true);
                  const path =
                    crypto.randomUUID() +
                    "." +
                    {
                      "image/png": "png",
                      "image/jpeg": "jpg",
                      "image/webp": "webp",
                    }[file.type];
                  const { error } = await db.storage
                    .from("university-logos")
                    .upload(path, file, { contentType: file.type });
                  if (error) setError("Logo upload failed");
                  else
                    setValues((old) => ({
                      ...old,
                      logo_url: db.storage
                        .from("university-logos")
                        .getPublicUrl(path).data.publicUrl,
                    }));
                  setBusy(false);
                }}
              />
            </label>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save record"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function parseImport(text: string): unknown[] {
  if (text.trim().startsWith("[")) return JSON.parse(text);
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
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
  if (quoted) throw new Error("Unclosed CSV quotation");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) =>
      Object.fromEntries(headers.map((h, i) => [h.trim(), r[i] || ""])),
    );
}

function CandidateReview({
  id,
  onReviewed,
}: {
  id: string;
  onReviewed: () => Promise<void>;
}) {
  const [existing, setExisting] = useState("");
  const [pending, setPending] = useState(false);
  const review = async (approve: boolean) => {
    setPending(true);
    try {
      await adminRequest({
        action: "review_identity",
        id,
        approve,
        existing_id: existing.trim() || null,
      });
      toast.success(
        approve
          ? "Identity reviewed. New records remain unpublished until you publish them in Universities."
          : "Candidate rejected",
      );
      await onReviewed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="candidate-review">
      <label className="form-field">
        Existing university UUID (optional)
        <input
          value={existing}
          onChange={(e) => setExisting(e.target.value)}
          placeholder="Link instead of creating a draft"
        />
      </label>
      <div className="control-row">
        <button
          className="text-link"
          disabled={pending}
          onClick={() => review(true)}
        >
          {existing ? "Link identity" : "Create unpublished draft"}
        </button>
        <button disabled={pending} onClick={() => review(false)}>
          Reject
        </button>
      </div>
    </div>
  );
}
