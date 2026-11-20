"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Copy,
  Inbox,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import "./admin-activity.css";

type Person = {
  id: string;
  display_name: string | null;
  role: "student" | "admin";
  created_at: string;
  updated_at: string | null;
};
type Change = { created_at: string; table_name: string; operation: string };
type Data = {
  people: Person[];
  changes: Change[];
  openSupport: number | null;
  loadedAt: Date;
};

const DAYS = 30;
const dayKey = (iso: string) => iso.slice(0, 10);
const shortDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

function series(rows: { created_at: string }[], now: number) {
  const counts = new Map<string, number>();
  for (const r of rows)
    counts.set(
      dayKey(r.created_at),
      (counts.get(dayKey(r.created_at)) || 0) + 1,
    );
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now - (DAYS - 1 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { key, label: shortDate.format(d), value: counts.get(key) || 0 };
  });
}

function ChartTip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { payload: { label: string; value: number } }[];
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="aa-tip">
      <strong>{p.value.toLocaleString("en")}</strong> {unit}
      <span>{p.label}</span>
    </div>
  );
}

/** Staff activity: account growth, recorded database changes and the people
 * directory. Everything comes from RLS-protected staff reads; there is no
 * visit tracking, so "active users" is deliberately not claimed. */
export function AdminActivity() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"all" | "student" | "admin">("all");
  const [limit, setLimit] = useState(25);

  const load = useCallback(async () => {
    const db = getSupabase();
    if (!db) return setError("The database is not connected.");
    setBusy(true);
    setError("");
    const since = new Date(Date.now() - DAYS * 86400000).toISOString();
    const [people, changes, support] = await Promise.allSettled([
      db
        .from("profiles")
        .select("id,display_name,role,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      db
        .from("audit_logs")
        .select("created_at,table_name,operation")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      db
        .from("support_requests")
        .select("id", { head: true, count: "exact" })
        .neq("status", "resolved"),
    ]);
    const ok = <T,>(
      r: PromiseSettledResult<{ data: T | null; error: unknown }>,
    ) => (r.status === "fulfilled" && !r.value.error ? r.value.data : null);
    const peopleRows = ok<Person[]>(people as never);
    if (!peopleRows) {
      setError(
        "Accounts couldn’t be loaded. Check your staff session and retry.",
      );
      setBusy(false);
      return;
    }
    setData({
      people: peopleRows,
      changes: ok<Change[]>(changes as never) || [],
      openSupport:
        support.status === "fulfilled" && !support.value.error
          ? (support.value.count ?? null)
          : null,
      loadedAt: new Date(),
    });
    setBusy(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const now = data.loadedAt.getTime();
    const week = now - 7 * 86400000;
    const month = now - DAYS * 86400000;
    const tables = new Map<string, number>();
    for (const c of data.changes)
      tables.set(c.table_name, (tables.get(c.table_name) || 0) + 1);
    return {
      total: data.people.length,
      week: data.people.filter((p) => Date.parse(p.created_at) >= week).length,
      month: data.people.filter((p) => Date.parse(p.created_at) >= month)
        .length,
      staff: data.people.filter((p) => p.role === "admin").length,
      signups: series(
        data.people.filter((p) => Date.parse(p.created_at) >= month),
        now,
      ),
      changes: series(data.changes, now),
      topTables: [...tables.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value]) => ({ name, value })),
    };
  }, [data]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.people || []).filter(
      (p) =>
        (role === "all" || p.role === role) &&
        (!q ||
          (p.display_name || "").toLowerCase().includes(q) ||
          p.id.startsWith(q)),
    );
  }, [data, query, role]);

  if (error)
    return (
      <div className="aa-error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={load} disabled={busy}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    );

  const tiles = [
    { label: "Registered accounts", value: stats?.total, icon: Users },
    { label: "New · 7 days", value: stats?.week, icon: UserPlus },
    { label: "New · 30 days", value: stats?.month, icon: UserPlus },
    { label: "Staff accounts", value: stats?.staff, icon: ShieldCheck },
    {
      label: "Open support requests",
      value: data?.openSupport ?? undefined,
      icon: Inbox,
    },
    {
      label: "Database changes · 30 days",
      value: data?.changes.length,
      icon: Activity,
    },
  ];
  const maxTable = stats?.topTables[0]?.value || 1;

  return (
    <div className="aa">
      <div className="aa-toolbar">
        <span />
        <button type="button" onClick={load} disabled={busy}>
          <RefreshCw
            size={14}
            aria-hidden="true"
            className={busy ? "aa-spin" : ""}
          />
          {data
            ? `Updated ${data.loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Loading…"}
        </button>
      </div>

      <div className="aa-tiles">
        {tiles.map(({ label, value, icon: Icon }) => (
          <div key={label} className="aa-tile">
            <span className="aa-tile-icon" aria-hidden="true">
              <Icon size={16} />
            </span>
            {value === undefined ? (
              data ? (
                <strong title="Unavailable">—</strong>
              ) : (
                <Skeleton className="h-7 w-14" />
              )
            ) : (
              <strong>{value.toLocaleString("en")}</strong>
            )}
            <small>{label}</small>
          </div>
        ))}
      </div>

      <div className="aa-charts">
        <section className="aa-panel">
          <h2>New accounts per day</h2>
          <p>Last {DAYS} days</p>
          {stats ? (
            <div
              className="aa-chart"
              role="img"
              aria-label={`${stats.month} new accounts in the last ${DAYS} days`}
            >
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={stats.signups}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="aa-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--aa-accent)"
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--aa-accent)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--aa-grid)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval={6}
                    tick={{ fontSize: 11, fill: "var(--aa-muted)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tick={{ fontSize: 11, fill: "var(--aa-muted)" }}
                  />
                  <Tooltip
                    content={<ChartTip unit="new accounts" />}
                    cursor={{
                      stroke: "var(--aa-muted)",
                      strokeDasharray: "3 3",
                    }}
                  />
                  <Area
                    type="linear"
                    dataKey="value"
                    stroke="var(--aa-accent)"
                    strokeWidth={2}
                    fill="url(#aa-fill)"
                    activeDot={{
                      r: 5,
                      strokeWidth: 2,
                      stroke: "var(--aa-surface)",
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Skeleton className="h-[200px] w-full" />
          )}
        </section>
        <section className="aa-panel">
          <h2>Database changes per day</h2>
          <p>Audited inserts, updates and deletes</p>
          {stats ? (
            <div
              className="aa-chart"
              role="img"
              aria-label={`${data?.changes.length} recorded changes in the last ${DAYS} days`}
            >
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={stats.changes}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                  barCategoryGap={2}
                >
                  <CartesianGrid vertical={false} stroke="var(--aa-grid)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval={6}
                    tick={{ fontSize: 11, fill: "var(--aa-muted)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tick={{ fontSize: 11, fill: "var(--aa-muted)" }}
                  />
                  <Tooltip
                    content={<ChartTip unit="changes" />}
                    cursor={{ fill: "var(--aa-grid)" }}
                  />
                  <Bar
                    dataKey="value"
                    fill="var(--aa-accent)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Skeleton className="h-[200px] w-full" />
          )}
        </section>
        <section className="aa-panel aa-tables">
          <h2>Most changed tables</h2>
          <p>Last {DAYS} days</p>
          {stats?.topTables.length ? (
            <ul>
              {stats.topTables.map((t) => (
                <li key={t.name}>
                  <span>{t.name.replaceAll("_", " ")}</span>
                  <i
                    style={{ width: `${(t.value / maxTable) * 100}%` }}
                    aria-hidden="true"
                  />
                  <strong>{t.value.toLocaleString("en")}</strong>
                </li>
              ))}
            </ul>
          ) : stats ? (
            <p className="aa-empty">No recorded changes in this period.</p>
          ) : (
            <Skeleton className="h-[160px] w-full" />
          )}
        </section>
      </div>

      <section className="aa-panel aa-people" aria-labelledby="aa-people-title">
        <header>
          <div>
            <h2 id="aa-people-title">People</h2>
            <p>{people.length.toLocaleString("en")} shown</p>
          </div>
          <div className="aa-people-controls">
            <label className="aa-search">
              <Search size={14} aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(25);
                }}
                placeholder="Search name or ID"
                aria-label="Search people"
                maxLength={80}
              />
            </label>
            <div
              className="aa-segment"
              role="group"
              aria-label="Filter by role"
            >
              {(["all", "student", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                >
                  {r === "all" ? "All" : r === "admin" ? "Staff" : "Students"}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className="aa-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
                <th scope="col">Profile updated</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!data
                ? [0, 1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={5}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : people.slice(0, limit).map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="aa-person">
                          <span className="aa-avatar" aria-hidden="true">
                            {(p.display_name || "?").slice(0, 1).toUpperCase()}
                          </span>
                          <span>
                            <strong>
                              {p.display_name || "Unnamed account"}
                            </strong>
                            <small>{p.id.slice(0, 8)}…</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <Badge
                          variant={p.role === "admin" ? "default" : "secondary"}
                        >
                          {p.role === "admin" ? "Staff" : "Student"}
                        </Badge>
                      </td>
                      <td>
                        {shortDate.format(new Date(p.created_at))},{" "}
                        {new Date(p.created_at).getFullYear()}
                      </td>
                      <td>
                        {p.updated_at
                          ? shortDate.format(new Date(p.updated_at))
                          : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="aa-icon-btn"
                          aria-label={`Copy ID for ${p.display_name || "account"}`}
                          title="Copy account ID"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(p.id)
                              .then(() => toast.success("Account ID copied"))
                              .catch(() => toast.error("Couldn’t copy the ID"))
                          }
                        >
                          <Copy size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
              {data && !people.length && (
                <tr>
                  <td colSpan={5} className="aa-empty">
                    No accounts match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {people.length > limit && (
          <button
            type="button"
            className="aa-show-more"
            onClick={() => setLimit((n) => n + 25)}
          >
            Show {Math.min(25, people.length - limit)} more
          </button>
        )}
        <p className="aa-more">
          Roles are assigned in the database by an owner; this view never edits
          accounts or shows private study preferences.
        </p>
      </section>
    </div>
  );
}
