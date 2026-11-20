"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Database,
  KeyRound,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import NextLink from "next/link";
import { useCollege } from "@/components/college/provider";
import { useStaffAccount } from "@/components/college/use-staff-account";
import { StaffAccountChangedError } from "@/services/admin-client";
import {
  parseDatabaseStructure,
  type DatabaseStructure,
  type StructureTable,
} from "@/lib/admin-structure";
import { STAFF_PATH } from "@/lib/staff-route";

const views = [
  { id: "columns", label: "Columns", icon: Database },
  { id: "relationships", label: "Relationships", icon: Link2 },
  { id: "policies", label: "Access policies", icon: ShieldCheck },
] as const;
type StructureView = (typeof views)[number]["id"];

export function AdminDatabaseStructure() {
  const { accountScope } = useCollege();
  const [, setRevision] = useState(0);
  useEffect(
    () => accountScope.subscribe(() => setRevision((n) => n + 1)),
    [accountScope],
  );
  const owner = accountScope.capture();
  return <OwnedDatabaseStructure key={`${owner.owner}:${owner.generation}`} />;
}

function OwnedDatabaseStructure() {
  const { scope, staffFetch } = useStaffAccount();
  const [ownedAccount] = useState(() => scope.capture());
  const [snapshot, setSnapshot] = useState<DatabaseStructure | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("universities");
  const [view, setView] = useState<StructureView>("columns");
  const mounted = useRef(true);
  const busy = useRef(false);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const searchId = useId();
  const mobileId = useId();
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const refresh = useCallback(async () => {
    if (busy.current || !scope.isCurrent(ownedAccount)) return;
    busy.current = true;
    const operationRevision = ++revision.current;
    const current = () =>
      mounted.current &&
      revision.current === operationRevision &&
      scope.isCurrent(ownedAccount);
    const operation = new AbortController();
    controller.current = operation;
    setLoading(true);
    setError("");
    try {
      const data = parseDatabaseStructure(
        await staffFetch("/api/staff/structure", {}, operation.signal),
      );
      if (current()) setSnapshot(data);
    } catch (failure) {
      if (current() && !(failure instanceof StaffAccountChangedError))
        setError(
          failure instanceof Error
            ? failure.message
            : "Structure could not load. Please retry.",
        );
    } finally {
      if (current()) {
        setLoading(false);
        busy.current = false;
      }
    }
  }, [scope, staffFetch, ownedAccount]);

  useEffect(() => {
    const lifetimeRevision = revision;
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      lifetimeRevision.current++;
      controller.current?.abort();
      busy.current = false;
    };
  }, [refresh]);

  const tables = snapshot?.tables || [];
  const currentTable =
    tables.find((table) => table.name === selected) || tables[0];
  const filtered = tables.filter((table) =>
    [table.name, ...table.columns.map((column) => column.name)]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selectTable = (name: string) => {
    setSelected(name);
    setView("columns");
  };
  const selectView = (index: number) => {
    setView(views[index].id);
    tabRefs.current[index]?.focus();
  };
  const tableSelected = currentTable?.name || "";
  const isView =
    currentTable?.kind === "view" || currentTable?.kind === "materialized_view";

  return (
    <section className="sb-structure" aria-label="Read-only database structure">
      <div className="sb-structure-summary">
        <div>
          <strong>Read-only structure</strong>
          <p>
            Inspect application tables, relationships and access-policy
            metadata. Student records and source values are excluded.
          </p>
          {snapshot && (
            <span className="sb-structure-time">
              Checked{" "}
              {new Date(snapshot.checked_at).toLocaleString("en-GB", {
                timeZone: "UTC",
              })}{" "}
              UTC · {tables.length} application tables and views
            </span>
          )}
        </div>
        <button
          type="button"
          className="sb-btn"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={14} aria-hidden="true" />{" "}
          {loading ? "Loading…" : "Refresh structure"}
        </button>
      </div>
      {error && (
        <div className="sb-structure-error" role="alert">
          <p>
            {error}
            {snapshot
              ? " The previously checked metadata remains visible."
              : " No schema has been assumed."}
          </p>
          <NextLink href={STAFF_PATH + "/security"}>
            Check staff verification
          </NextLink>
        </div>
      )}
      {!snapshot && loading && (
        <p className="sb-structure-loading" role="status">
          Verifying your staff session and loading structure…
        </p>
      )}
      {snapshot && !tables.length && (
        <p className="sb-structure-loading" role="status">
          No allowlisted application tables were returned by this database.
        </p>
      )}
      {!!tables.length && (
        <div className="sb-structure-layout">
          <aside className="sb-structure-sidebar">
            <label className="sb-structure-search" htmlFor={searchId}>
              <Search size={15} aria-hidden="true" />
              <input
                id={searchId}
                type="search"
                value={query}
                maxLength={100}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a table or column"
                aria-label="Find a schema table or column"
              />
            </label>
            <p className="sb-structure-result" role="status" aria-live="polite">
              {filtered.length} of {tables.length} tables and views
            </p>
            {!filtered.length && (
              <div className="sb-structure-no-match">
                <p>No table or column matches.</p>
                <button
                  type="button"
                  className="sb-btn"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              </div>
            )}
            <div className="sb-structure-mobile">
              <label htmlFor={mobileId}>Table</label>
              <select
                id={mobileId}
                value={tableSelected}
                onChange={(event) => selectTable(event.target.value)}
              >
                {currentTable &&
                  !filtered.some((table) => table.name === tableSelected) && (
                    <option value={tableSelected}>
                      Current: {tableSelected}
                    </option>
                  )}
                {filtered.map((table) => (
                  <option key={table.name} value={table.name}>
                    {table.name}
                  </option>
                ))}
              </select>
            </div>
            <nav className="sb-structure-table-list" aria-label="Schema tables">
              {filtered.map((table) => (
                <button
                  key={table.name}
                  type="button"
                  aria-pressed={tableSelected === table.name}
                  onClick={() => selectTable(table.name)}
                >
                  <Database size={14} aria-hidden="true" />
                  <span>{table.name}</span>
                  <small>{table.columns.length}</small>
                </button>
              ))}
            </nav>
          </aside>
          {currentTable && (
            <div className="sb-structure-inspector">
              <header className="sb-structure-table-head">
                <div>
                  <p>public · {currentTable.kind.replaceAll("_", " ")}</p>
                  <h2>{currentTable.name}</h2>
                </div>
                <span className="sb-structure-badge">
                  {isView
                    ? "View metadata"
                    : currentTable.rls_enabled
                      ? "RLS enabled"
                      : "RLS not enabled"}
                </span>
              </header>
              <div
                className="sb-structure-tabs"
                role="tablist"
                aria-label="Table structure views"
              >
                {views.map(({ id, label, icon: Icon }, index) => (
                  <button
                    type="button"
                    key={id}
                    role="tab"
                    id={`${tabsId}-${id}`}
                    aria-controls={`${tabsId}-panel`}
                    aria-selected={view === id}
                    tabIndex={view === id ? 0 : -1}
                    ref={(node) => {
                      tabRefs.current[index] = node;
                    }}
                    onClick={() => setView(id)}
                    onKeyDown={(event) => {
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % views.length
                          : event.key === "ArrowLeft"
                            ? (index - 1 + views.length) % views.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? views.length - 1
                                : null;
                      if (next !== null) {
                        event.preventDefault();
                        selectView(next);
                      }
                    }}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`${tabsId}-panel`}
                aria-labelledby={`${tabsId}-${view}`}
                className="sb-structure-panel"
              >
                {view === "columns" && (
                  <div
                    className="sb-structure-scroll"
                    tabIndex={0}
                    aria-label="Column definitions, horizontally scrollable"
                  >
                    <table>
                      <caption className="sr-only">
                        Columns in public.{currentTable.name}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Column</th>
                          <th scope="col">Type</th>
                          <th scope="col">Rules</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentTable.columns.map((column) => (
                          <tr key={column.name}>
                            <th scope="row">{column.name}</th>
                            <td>{column.type}</td>
                            <td className="sb-structure-rules">
                              {column.primary_key && (
                                <span>
                                  <KeyRound size={11} aria-hidden="true" />
                                  Primary key
                                </span>
                              )}
                              <span>
                                {column.nullable ? "Nullable" : "Not null"}
                              </span>
                              {column.has_default && (
                                <span>Default present</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {view === "relationships" && (
                  <Relationships
                    table={currentTable}
                    tables={tables}
                    select={selectTable}
                  />
                )}
                {view === "policies" && (
                  <div className="sb-structure-policy-view">
                    <p>
                      {isView
                        ? currentTable.kind === "view"
                          ? `This view uses ${currentTable.security_invoker ? "caller" : "owner"} privileges. Views do not have their own row-level policies.`
                          : "Materialized views do not have their own row-level policies. Inspect the underlying tables and grants."
                        : `Row-level security is ${currentTable.rls_enabled ? "enabled" : "not enabled"}${currentTable.rls_forced ? " and forced for the table owner" : ""}.`}
                    </p>
                    {currentTable.policies.length ? (
                      <div
                        className="sb-structure-scroll"
                        tabIndex={0}
                        aria-label="Access policy metadata, horizontally scrollable"
                      >
                        <table>
                          <caption className="sr-only">
                            Policy metadata in public.{currentTable.name}
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Policy</th>
                              <th scope="col">Operation</th>
                              <th scope="col">Roles</th>
                              <th scope="col">Mode</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentTable.policies.map((policy) => (
                              <tr key={policy.name}>
                                <th scope="row">{policy.name}</th>
                                <td>{policy.command}</td>
                                <td>{policy.roles.join(", ")}</td>
                                <td>
                                  {policy.permissive
                                    ? "Permissive"
                                    : "Restrictive"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="sb-structure-empty">
                        No row-level policies are attached to this relation.
                      </p>
                    )}
                    <p className="sb-structure-footnote">
                      Policy names and operations are a summary, not an access
                      audit. Policy expressions, SQL definitions, grant changes
                      and private records are not exposed here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Relationships({
  table,
  tables,
  select,
}: {
  table: StructureTable;
  tables: StructureTable[];
  select: (name: string) => void;
}) {
  return table.foreign_keys.length ? (
    <div className="sb-structure-relations">
      {table.foreign_keys.map((key) => (
        <article key={key.name}>
          <Link2 size={17} aria-hidden="true" />
          <div>
            <h3>{key.columns.join(" + ")}</h3>
            <p>
              References{" "}
              {key.target_schema === "public" &&
              tables.some((target) => target.name === key.target_table) ? (
                <button type="button" onClick={() => select(key.target_table)}>
                  {key.target_schema}.{key.target_table}
                </button>
              ) : (
                <span>
                  {key.target_schema}.{key.target_table}
                </span>
              )}{" "}
              ({key.target_columns.join(" + ")})
            </p>
            <small>{key.name}</small>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <p className="sb-structure-empty">
      No foreign-key relationships to the allowlisted application tables are
      defined.
    </p>
  );
}
