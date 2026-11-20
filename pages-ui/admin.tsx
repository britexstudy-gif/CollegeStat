"use client";
import "@/app/admin-workspace-oct13.css";
import "@/components/college/workspace-studio.css";
import "@/app/admin-console-oct16.css";
import { AdminOverview } from "@/components/college/admin-overview";
import { AdminActivity } from "@/components/college/admin-activity";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Database,
  ShieldCheck,
  ArrowLeft,
  ArrowUpRight,
  LayoutDashboard,
  Upload,
  ClipboardCheck,
  RefreshCw,
  AlertTriangle,
  Search,
  X,
  Plus,
} from "lucide-react";
import { AdminWorkbench } from "@/components/college/admin-workbench";
import { StaffSecurity } from "@/components/college/staff-security";
import { StaffSupportInbox } from "@/components/college/staff-support-inbox";
import {
  StaffSessionProvider,
  useStaffSession,
} from "@/components/college/staff-session-provider";
import { AdminDatabaseStructure } from "@/components/college/admin-database-structure";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { STAFF_PATH, STAFF_SIGN_IN } from "@/lib/staff-route";
import { useCollege } from "@/components/college/provider";
import { EmptyState, Brand, Choice } from "@/components/college/primitives";
import { getSupabase } from "@/lib/supabase/client";
import { useStaffAccount } from "@/components/college/use-staff-account";
import { StaffAccountChangedError } from "@/services/admin-client";
import {
  AdminLogoChangedError,
  uploadAdminLogo,
} from "@/lib/admin-logo-upload";
import { AppearanceButton } from "@/components/college/appearance-button";
import {
  fieldDefinitions,
  Entity,
  entitySchemas,
} from "@/services/admin-schema";
import { SupabaseDataTable } from "@/components/college/admin-supabase-table";
import {
  TEXT_SEARCH_COLUMNS,
  ADMIN_PAGE_SIZE,
  adminPageForTotal,
  adminRecordRange,
  parseAdminImport,
  recordTitle,
  StatusChip,
  type AdminRow,
} from "@/components/college/admin-supabase-status";
import {
  STAFF_AREAS,
  STAFF_SECTIONS,
  staffSection,
  staffSectionArea,
  staffSectionHref,
  staffSectionIcon,
  staffSectionLabel,
  staffSectionTable,
} from "@/lib/staff-sections";
export default function Admin({ section = "Overview" }: { section?: string }) {
  const s = useCollege();
  return (
    <StaffSessionProvider
      key={(s.user?.id || "anonymous") + ":" + (s.profile?.role || "loading")}
    >
      <AdminPage
        key={(s.user?.id || "anonymous") + ":" + (s.profile?.role || "loading")}
        section={section}
      />
    </StaffSessionProvider>
  );
}
function AdminPage({ section }: { section: string }) {
  const s = useCollege();
  const staffSession = useStaffSession();
  const { request: adminRequest } = useStaffAccount();
  // "/" jumps to the section filter, as in most consoles; typing elsewhere is untouched.
  useEffect(() => {
    const focusFilter = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']") ||
        document.querySelector("[role='dialog']")
      )
        return;
      const filter = document.getElementById("sb-nav-filter");
      if (!(filter instanceof HTMLInputElement) || !filter.offsetParent) return;
      event.preventDefault();
      filter.focus();
      filter.select();
    };
    document.addEventListener("keydown", focusFilter);
    return () => document.removeEventListener("keydown", focusFilter);
  }, []);
  const [rows, setRows] = useState<AdminRow[]>([]),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(false),
    [total, setTotal] = useState(0),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [countErrors, setCountErrors] = useState<string[]>([]),
    [countsUpdatedAt, setCountsUpdatedAt] = useState<Date | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<AdminRow | null>(null),
    [entity, setEntity] = useState<Entity>(
      (staffSectionTable(section) || "universities") as Entity,
    ),
    [sourceId, setSourceId] = useState(""),
    [importText, setImportText] = useState(""),
    [busy, setBusy] = useState(false),
    [importResult, setImportResult] = useState(""),
    [navQuery, setNavQuery] = useState(""),
    [decision, setDecision] = useState<{
      row: AdminRow;
      approve: boolean;
    } | null>(null),
    [reviewing, setReviewing] = useState(false),
    [reviewError, setReviewError] = useState("");
  const table =
    section === "Rankings" || section === "Programs"
      ? entity
      : staffSectionTable(section);
  const role = s.profile?.role;
  const userId = s.user?.id;
  const revision = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const loadedQuery = useRef("");
  const reviewLock = useRef(false);
  const fileRevision = useRef(0);
  useEffect(() => {
    setEntity((staffSectionTable(section) || "universities") as Entity);
    setPage(1);
    setSearch("");
    setEditing(null);
    setSourceId("");
    setImportText("");
    setImportResult("");
    setBusy(false);
    setDecision(null);
    setReviewError("");
    loadedQuery.current = "";
    fileRevision.current++;
    const counter = revision;
    const files = fileRevision;
    return () => {
      counter.current++;
      readController.current?.abort();
      files.current++;
    };
  }, [section, userId]);
  const load = useCallback(async () => {
    const db = getSupabase();
    const current = ++revision.current;
    readController.current?.abort();
    if (
      !db ||
      !userId ||
      role !== "admin" ||
      !staffSession.active ||
      !staffSession.boundary.active()
    ) {
      setRows([]);
      setCounts({});
      setCountErrors([]);
      setCountsUpdatedAt(null);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setCountErrors([]);
    const queryKey = JSON.stringify([section, table, page, search.trim()]);
    if (loadedQuery.current !== queryKey) {
      setRows([]);
      setTotal(0);
    }
    const controller = new AbortController();
    readController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      if (table) {
        const textColumns: Record<string, string> = TEXT_SEARCH_COLUMNS;
        let request = db
          .from(table)
          .select("*", { count: "exact" })
          .order("id")
          .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1)
          .abortSignal(controller.signal);
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
        const validPage = adminPageForTotal(page, count || 0);
        if (page !== validPage) {
          setPage(validPage);
          return;
        }
        loadedQuery.current = queryKey;
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
          "pending_reviews",
          "profiles",
          "recent_signups",
          "recent_changes",
        ];
        const results = await Promise.allSettled(
          names.map((t) => {
            const request = db
              .from(
                t === "pending_reviews"
                  ? "source_records"
                  : t === "recent_signups"
                    ? "profiles"
                    : t === "recent_changes"
                      ? "audit_logs"
                      : t,
              )
              .select("id", { head: true, count: "exact" })
              .abortSignal(controller.signal);
            if (t === "pending_reviews")
              return request.in("status", ["pending", "conflicting"]);
            if (t === "data_quality_checks")
              return request.eq("resolved", false);
            if (t === "recent_signups" || t === "recent_changes")
              return request.gte(
                "created_at",
                new Date(Date.now() - 7 * 86400000).toISOString(),
              );
            return request;
          }),
        );
        if (current !== revision.current) return;
        // A missing optional analytics table must not hide valid catalogue counts.
        // An unavailable count is different from a measured zero.
        const available: Record<string, number> = {};
        const unavailable: string[] = [];
        results.forEach((result, index) => {
          if (
            result.status === "fulfilled" &&
            !result.value.error &&
            result.value.count !== null
          ) {
            available[names[index]] = result.value.count;
          } else unavailable.push(names[index].replaceAll("_", " "));
        });
        setCounts(available);
        setCountErrors(unavailable);
        setCountsUpdatedAt(Object.keys(available).length ? new Date() : null);
        if (unavailable.length === names.length)
          setError(
            "Database counts could not load. Check your connection and staff access, then retry.",
          );
      }
    } catch (e) {
      if (e instanceof StaffAccountChangedError) return;
      if (current === revision.current) {
        setRows([]);
        setCounts({});
        setCountsUpdatedAt(null);
        setTotal(0);
        setError(
          "Database records could not load. Check that the hosted schema is installed and your account has administrator access.",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (readController.current === controller) readController.current = null;
      if (current === revision.current) setLoading(false);
    }
  }, [
    role,
    userId,
    section,
    table,
    page,
    search,
    staffSession.active,
    staffSession.boundary,
  ]);
  useLayoutEffect(() => {
    return staffSession.boundary.subscribe(() => {
      if (staffSession.boundary.active()) return;
      revision.current++;
      readController.current?.abort();
      setRows([]);
      setCounts({});
      setCountErrors([]);
      setCountsUpdatedAt(null);
      setTotal(0);
      setEditing(null);
      setDecision(null);
      setImportText("");
      setSourceId("");
    });
  }, [staffSession.boundary]);
  useEffect(() => {
    const counter = revision;
    const timer = setTimeout(() => {
      void load();
    }, 180);
    return () => {
      clearTimeout(timer);
      counter.current++;
      readController.current?.abort();
    };
  }, [load]);
  if (!s.authReady)
    return (
      <EmptyState
        title="Checking access…"
        description="Restoring your authenticated role."
      />
    );
  if (s.user && !s.profile)
    return (
      <EmptyState
        title="Your staff profile is not ready yet."
        description="We need your account profile to check access. If it does not load, try again."
        action={
          <button
            type="button"
            className="button button-primary"
            onClick={() => void s.refreshAccount()}
          >
            Retry account
          </button>
        }
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
          <Link className="button button-primary" href={STAFF_SIGN_IN}>
            Staff sign in <ArrowUpRight size={16} />
          </Link>
          <Link className="text-link" href="/">
            <ArrowLeft size={15} /> Return to CollegeStat
          </Link>
        </section>
      </div>
    );
  if (!staffSession.ready || !staffSession.active)
    return (
      <div className="staff-gate">
        <Brand />
        <section>
          <div className="staff-lock">
            <ShieldCheck size={28} />
          </div>
          <span className="eyebrow">PRIVATE STAFF WORKSPACE</span>
          <h1>
            {staffSession.ready
              ? "Secure your admin session."
              : "Checking admin session…"}
          </h1>
          <p>
            Use your authenticator to open every catalogue, review and
            administration tool.
          </p>
          {staffSession.error && <p role="status">{staffSession.error}</p>}
          <StaffSecurity key={s.user.id} />
          <Link className="text-link" href="/">
            Return to CollegeStat
          </Link>
        </section>
      </div>
    );
  const runImport = async () => {
    setBusy(true);
    setImportResult("");
    try {
      if (loading || error) return;
      const rows = parseAdminImport(importText);
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
      if (e instanceof StaffAccountChangedError) return;
      setImportResult(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    if (!decision || reviewLock.current || loading || error) return;
    reviewLock.current = true;
    setReviewing(true);
    setReviewError("");
    try {
      await adminRequest({
        action: "review",
        id: decision.row.id,
        approve: decision.approve,
      });
      toast.success(
        decision.approve ? "Observation approved" : "Observation rejected",
      );
      setDecision(null);
      await load();
    } catch (e) {
      if (e instanceof StaffAccountChangedError) return;
      setReviewError(
        e instanceof Error
          ? e.message
          : "Review failed. Check for an existing observation or invalid source.",
      );
    } finally {
      reviewLock.current = false;
      setReviewing(false);
    }
  };
  const trimmedNavQuery = navQuery.trim().toLowerCase();
  const matchesNav = (name: string) =>
    !trimmedNavQuery ||
    [
      name,
      staffSectionLabel(name),
      staffSectionTable(name) || "",
      staffSection(name)?.category || "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(trimmedNavQuery);
  const currentGroup = staffSectionArea(section);
  const visibleGroups = (
    trimmedNavQuery
      ? ["Overview", "Catalogue", "Review", "Operations"]
      : [currentGroup]
  ).map((group) => ({
    group,
    sections: STAFF_SECTIONS.filter(
      (s) =>
        s.area === group &&
        matchesNav(s.name) &&
        (s.name !== "Overview" || !!trimmedNavQuery),
    ),
  }));
  const navTotal = visibleGroups.reduce((n, g) => n + g.sections.length, 0);
  const searchable = !!table && !!TEXT_SEARCH_COLUMNS[table];
  const renderActions = (r: AdminRow) => (
    <>
      {r.verification_status === "needs_review" &&
        table &&
        table in entitySchemas && (
          <button
            className="sb-text-btn"
            onClick={async () => {
              try {
                await adminRequest({
                  action: "verify",
                  entity: table,
                  id: r.id,
                });
                await load();
                toast.success("Source verified");
              } catch (e) {
                if (e instanceof StaffAccountChangedError) return;
                toast.error("Verification failed");
              }
            }}
          >
            Verify source
          </button>
        )}
      {section === "Jobs" && r.status === "failed" && (
        <button
          className="sb-text-btn"
          onClick={async () => {
            try {
              await adminRequest({
                action: "retry",
                id: r.id,
              });
              await load();
            } catch (e) {
              if (e instanceof StaffAccountChangedError) return;
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
          className="sb-text-btn"
          onClick={() => {
            setEntity(table as Entity);
            setEditing(r);
          }}
        >
          Edit →
        </button>
      ) : section === "Review" &&
        ["pending", "conflicting"].includes(String(r.status)) ? (
        <span className="sb-row-actions">
          <button
            className="sb-text-btn"
            disabled={
              loading ||
              !!error ||
              reviewing ||
              (typeof r.metric === "string" &&
                r.metric.startsWith("ranking:")) ||
              (r.raw_value != null &&
                typeof r.raw_value === "object" &&
                "target_table" in r.raw_value &&
                (r.raw_value as { target_table?: unknown }).target_table !==
                  "data_points")
            }
            title={
              typeof r.metric === "string" && r.metric.startsWith("ranking:")
                ? "Requires a dedicated ranking review"
                : r.raw_value != null &&
                    typeof r.raw_value === "object" &&
                    "target_table" in r.raw_value &&
                    (r.raw_value as { target_table?: unknown }).target_table !==
                      "data_points"
                  ? "Requires section-specific review to preserve population, programme and cycle"
                  : undefined
            }
            onClick={() => {
              setDecision({ row: r, approve: true });
              setReviewError("");
            }}
          >
            Approve
          </button>
          <button
            className="sb-text-btn"
            disabled={loading || !!error || reviewing}
            onClick={() => {
              setDecision({ row: r, approve: false });
              setReviewError("");
            }}
          >
            Reject
          </button>
        </span>
      ) : (
        <span className="sb-null">Read-only</span>
      )}
    </>
  );
  return (
    <div className="supabase-console admin-workspace-oct13 admin-studio admin-console-oct16">
      <a className="sb-skip-link" href="#staff-workspace-content">
        Skip to workspace
      </a>
      <aside className="sb-browser" aria-label="Staff navigation">
        <Link className="sb-workspace-brand" href={STAFF_PATH}>
          <span className="sb-rail-brand" aria-hidden="true">
            C
          </span>
          <span>
            <strong>CollegeStat</strong>
            <small>Staff workspace</small>
          </span>
        </Link>
        <nav className="sb-primary-areas" aria-label="Primary console sections">
          {STAFF_AREAS.map(({ entry: name, area, icon: Icon }) => (
            <Link
              key={name}
              href={staffSectionHref(name)}
              aria-current={currentGroup === area ? "page" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{area}</span>
            </Link>
          ))}
        </nav>
        <div className="sb-browser-head">
          <div className="sb-search-row" role="search">
            <Search size={14} aria-hidden="true" />
            <label htmlFor="sb-nav-filter" className="sr-only">
              Filter tables and sections
            </label>
            <input
              id="sb-nav-filter"
              type="search"
              autoComplete="off"
              placeholder="Find a section…"
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && navQuery) {
                  e.preventDefault();
                  setNavQuery("");
                }
              }}
              maxLength={80}
              aria-keyshortcuts="/"
            />
            {!navQuery && (
              <kbd className="sb-search-kbd" aria-hidden="true">
                /
              </kbd>
            )}
            {navQuery && (
              <button
                type="button"
                aria-label="Clear table filter"
                onClick={() => setNavQuery("")}
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="sb-browser-scroll">
          {trimmedNavQuery && navTotal === 0 ? (
            <p className="sb-browser-empty" role="status">
              No tables match “{navQuery.trim()}”. Clear the filter to see
              catalogue, evidence and operations.
            </p>
          ) : (
            visibleGroups.map(({ group, sections }) =>
              sections.length > 0 ? (
                <nav
                  className="sb-browser-group"
                  key={group}
                  aria-label={`${group} sections`}
                >
                  {sections.map(({ name, category }, i) => {
                    const Icon = staffSectionIcon(name);
                    const heading =
                      category && category !== sections[i - 1]?.category ? (
                        <span
                          className="sb-browser-category"
                          aria-hidden="true"
                        >
                          {category}
                        </span>
                      ) : null;
                    return (
                      <Fragment key={name}>
                        {heading}
                        <Link
                          href={staffSectionHref(name)}
                          aria-current={section === name ? "page" : undefined}
                          title={staffSectionLabel(name)}
                        >
                          <Icon size={16} aria-hidden="true" />
                          <span>{staffSectionLabel(name)}</span>
                        </Link>
                      </Fragment>
                    );
                  })}
                </nav>
              ) : null,
            )
          )}
        </div>
        <div className="sb-browser-foot">
          <Link href="/">
            <ArrowLeft size={13} aria-hidden="true" /> Public website
          </Link>
          <Link href="/dashboard">
            <LayoutDashboard size={13} aria-hidden="true" /> My dashboard
          </Link>
        </div>
      </aside>
      <div
        className="sb-main"
        id="staff-workspace-content"
        tabIndex={-1}
        aria-busy={loading}
      >
        <div className="sb-mobilebar">
          <nav
            className="sb-mobile-areas"
            aria-label="Primary console sections"
          >
            {STAFF_AREAS.map(({ entry: name, area, icon: Icon }) => (
              <Link
                key={name}
                href={staffSectionHref(name)}
                aria-current={currentGroup === area ? "page" : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{area}</span>
              </Link>
            ))}
          </nav>
          <label htmlFor="sb-section-select">{currentGroup}</label>
          <select
            id="sb-section-select"
            value={section}
            onChange={(e) => {
              window.location.href = staffSectionHref(e.target.value);
            }}
          >
            {[currentGroup].map((group) => (
              <optgroup key={group} label={group}>
                {STAFF_SECTIONS.filter((item) => item.area === group).map(
                  ({ name }) => (
                    <option key={name} value={name}>
                      {staffSectionLabel(name)}
                    </option>
                  ),
                )}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="sb-topbar">
          <nav className="sb-crumbs" aria-label="Breadcrumb">
            <Link href={STAFF_PATH}>Staff workspace</Link>
            <span className="sep" aria-hidden="true">
              /
            </span>
            {section !== currentGroup && (
              <>
                <span>{currentGroup}</span>
                <span className="sep" aria-hidden="true">
                  /
                </span>
              </>
            )}
            <strong aria-current="page">{staffSectionLabel(section)}</strong>
          </nav>
          <div className="sb-topbar-actions">
            <AppearanceButton />
            {(table || section === "Overview") && (
              <button className="sb-btn" disabled={loading} onClick={load}>
                <RefreshCw size={13} aria-hidden="true" /> Refresh
              </button>
            )}
          </div>
        </div>
        {staffSection(section)?.description && (
          <header className="sb-page-heading">
            <h1>
              {section === "Overview"
                ? "Workspace overview"
                : staffSectionLabel(section)}
            </h1>
            <p>{staffSection(section)?.description}</p>
            <Link
              className="sb-session-summary"
              href={staffSectionHref("Security")}
            >
              <ShieldCheck size={14} aria-hidden="true" /> Verified staff
              session
              <span>· 15-minute idle sign-out</span>
            </Link>
          </header>
        )}
        <div className="sb-notices">
          {section === "Review" && (
            <div className="sb-notice" role="note">
              <ClipboardCheck size={15} aria-hidden="true" />
              <div>
                <strong>Review queue.</strong> Approve or reject staged
                observations; each decision writes audit history.{" "}
                <Link className="sb-link" href={STAFF_PATH + "/coverage"}>
                  Check coverage gaps
                </Link>{" "}
                before publishing.
              </div>
            </div>
          )}
          {section === "Sources" && (
            <div className="sb-notice" role="note">
              <Database size={15} aria-hidden="true" />
              <div>
                <strong>Source evidence first.</strong> Open the original URL
                and confirm publisher, date and scope before verifying.
                Unverified rows never reach the public catalogue.
              </div>
            </div>
          )}
          {section === "Imports" && (
            <div className="sb-notice" role="note">
              <Upload size={15} aria-hidden="true" />
              <div>
                <strong>Staged, never auto-published.</strong> Validated rows
                wait in review. Imports are not connected to automatic
                publishing or usage analytics.
              </div>
            </div>
          )}
          {loading && (
            <p role="status" className="sb-status-line">
              Loading the hosted database… Existing rows stay visible where
              already loaded; counts marked unavailable are not zero.
            </p>
          )}
          {error && (
            <div className="sb-errorbar" role="alert">
              <span>
                {error} No records were changed. Imports and review decisions
                are paused until records load.
              </span>
              <button className="sb-btn" onClick={load} disabled={loading}>
                {loading ? "Retrying…" : "Retry"}
              </button>
            </div>
          )}
        </div>
        {section === "Mcp" || section === "Coverage" ? (
          <AdminWorkbench
            key={s.user.id + section}
            coverageOnly={section === "Coverage"}
          />
        ) : section === "Structure" ? (
          <AdminDatabaseStructure />
        ) : section === "Activity" ? (
          <AdminActivity />
        ) : section === "Inbox" ? (
          <StaffSupportInbox />
        ) : section === "Security" ? (
          <StaffSecurity key={s.user.id} />
        ) : section === "Overview" ? (
          <div className="sb-overview">
            {countErrors.length > 0 && !error && (
              <div className="sb-metric-note" role="status">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  Some metrics are unavailable ({countErrors.join(", ")}).
                  Loaded records and management tools remain accessible.
                </span>
              </div>
            )}
            <AdminOverview
              counts={counts}
              loading={loading}
              updatedAt={countsUpdatedAt}
            />
          </div>
        ) : section === "Settings" ? (
          <div className="sb-overview">
            <section className="sb-mini-panel">
              <h2>Operational configuration</h2>
              <p>
                Authentication providers, redirect URLs, secret rotation, and
                service credentials are managed in Supabase and server
                environment settings. Profile roles cannot be changed through
                the public application.
              </p>
              <Link className="sb-link" href="/methodology">
                Review data publication rules →
              </Link>
            </section>
          </div>
        ) : (
          <>
            {table && (
              <div className="sb-toolbar" role="search">
                <div className="sb-search-row">
                  <Search size={14} aria-hidden="true" />
                  <label htmlFor="sb-record-search" className="sr-only">
                    Search database records
                  </label>
                  <input
                    id="sb-record-search"
                    aria-label="Search database records"
                    placeholder={
                      searchable
                        ? `Search ${table.replaceAll("_", " ")} or paste a record UUID`
                        : "Paste a complete record UUID"
                    }
                    maxLength={120}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear record search"
                      onClick={() => {
                        setSearch("");
                        setPage(1);
                      }}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <span className="sb-count" aria-live="polite">
                  {loading ? "Loading…" : `${total.toLocaleString()} records`}
                </span>
                {!searchable && (
                  <span className="sb-uuid-hint">
                    Text search doesn&apos;t apply here — use a complete record
                    UUID.
                  </span>
                )}
                <span className="sb-toolbar-spacer" />
                {section === "Rankings" && (
                  <span className="sb-entity-select">
                    <Choice
                      label="Ranking entity"
                      value={entity}
                      onChange={(v) => {
                        setEntity(v as Entity);
                        setPage(1);
                        setSearch("");
                      }}
                      options={[
                        "ranking_providers",
                        "ranking_editions",
                        "ranking_entries",
                      ]}
                    />
                  </span>
                )}
                {section === "Programs" && (
                  <span className="sb-entity-select">
                    <Choice
                      label="Program entity"
                      value={entity}
                      onChange={(v) => {
                        setEntity(v as Entity);
                        setPage(1);
                        setSearch("");
                      }}
                      options={["programs", "university_programs"]}
                    />
                  </span>
                )}
                {table in entitySchemas && (
                  <button
                    className="sb-btn sb-btn-primary"
                    onClick={() => {
                      setEntity(table as Entity);
                      setEditing({ id: "" });
                    }}
                  >
                    <Plus size={14} aria-hidden="true" /> New record
                  </button>
                )}
              </div>
            )}
            {section === "Imports" && (
              <section
                className="sb-panel-block"
                aria-label="Stage sourced observations"
              >
                <h2>Stage sourced observations</h2>
                <p>
                  CSV or JSON. Fields: university_id, metric, year, value, unit,
                  source_url, notes. Canonical values remain untouched until
                  review.
                </p>
                <div className="sb-form-grid">
                  <label className="sb-field">
                    Source ID
                    <input
                      value={sourceId}
                      maxLength={36}
                      disabled={busy}
                      onChange={(e) => setSourceId(e.target.value)}
                    />
                  </label>
                  <label className="sb-field">
                    Import file (CSV or JSON, under 1 MB)
                    <input
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      aria-label="Import CSV or JSON"
                      onChange={async (e) => {
                        const currentFile = ++fileRevision.current;
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 1000000) {
                            toast.error("Import must be under 1 MB");
                            return;
                          }
                          try {
                            const contents = await file.text();
                            if (currentFile === fileRevision.current)
                              setImportText(contents);
                          } catch {
                            if (currentFile === fileRevision.current)
                              toast.error(
                                "File could not be read. Choose it again or paste the observations.",
                              );
                          }
                        }
                      }}
                    />
                  </label>
                </div>
                <label className="sb-field">
                  Observations payload
                  <textarea
                    className="sb-code-input"
                    value={importText}
                    disabled={busy}
                    onChange={(e) => {
                      fileRevision.current++;
                      setImportText(e.target.value);
                    }}
                    aria-label="Import observations"
                    placeholder="Paste a JSON array or CSV with headers"
                  />
                </label>
                <button
                  className="sb-btn sb-btn-primary"
                  disabled={
                    busy ||
                    loading ||
                    !!error ||
                    !sourceId.trim() ||
                    !importText.trim()
                  }
                  onClick={runImport}
                >
                  {busy ? "Validating…" : "Validate and stage import"}
                </button>
                {importResult && (
                  <pre className="sb-import-result">{importResult}</pre>
                )}
              </section>
            )}
            {table && (
              <>
                {section === "Review" && rows.length > 0 && (
                  <div
                    className="sb-review-cards"
                    aria-label="Evidence awaiting a decision"
                  >
                    {rows.map((row) => (
                      <article className="sb-review-card" key={row.id}>
                        <div className="sb-review-card-heading">
                          <h2>{recordTitle(row)}</h2>
                          <StatusChip row={row} />
                        </div>
                        <dl>
                          <div>
                            <dt>Reporting year</dt>
                            <dd>{String(row.year ?? "Unspecified")}</dd>
                          </div>
                          <div>
                            <dt>Reported value</dt>
                            <dd>
                              {String(row.normalized_value ?? "Unspecified")}{" "}
                              {String(row.unit ?? "")}
                            </dd>
                          </div>
                          <div className="sb-review-card-wide">
                            <dt>Scope & population</dt>
                            <dd>
                              {String(
                                row.notes ||
                                  "Scope not recorded. Check the original source before deciding.",
                              )}
                            </dd>
                          </div>
                          <div className="sb-review-card-wide">
                            <dt>Original source</dt>
                            <dd>
                              {typeof row.source_url === "string" &&
                              /^https:\/\//.test(row.source_url) ? (
                                <a
                                  className="sb-link"
                                  href={row.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {row.source_url}
                                  <ArrowUpRight size={13} aria-hidden="true" />
                                </a>
                              ) : (
                                "Source unavailable"
                              )}
                            </dd>
                          </div>
                        </dl>
                        <details className="sb-review-identifiers">
                          <summary>Record identifiers</summary>
                          <p>Observation: {row.id}</p>
                          <p>
                            Institution:{" "}
                            {String(row.university_id ?? "Unspecified")}
                          </p>
                        </details>
                        <div className="sb-review-card-actions">
                          {renderActions(row)}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <div
                  className={
                    section === "Review" && rows.length > 0
                      ? "sb-records-region sb-review-table"
                      : "sb-records-region"
                  }
                >
                  <p className="sb-table-guidance">
                    Open a record name for full details.{" "}
                    <span>Scroll the table to see more columns.</span>
                  </p>
                  <SupabaseDataTable
                    key={table + section}
                    tableName={table}
                    rows={rows}
                    loading={loading}
                    error={error}
                    renderActions={renderActions}
                  />
                </div>
                <div className="sb-pagination">
                  <button
                    className="sb-btn"
                    disabled={loading || page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <span aria-live="polite">
                    Page {page} of{" "}
                    {Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))} ·{" "}
                    {adminRecordRange(page, total)}
                  </span>
                  <button
                    className="sb-btn"
                    disabled={loading || page * ADMIN_PAGE_SIZE >= total}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                  <span className="sb-count">
                    25 per page · history retained
                  </span>
                </div>
              </>
            )}
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
        <Dialog
          open={!!decision}
          onOpenChange={(open) => {
            if (!open && !reviewing) setDecision(null);
          }}
        >
          <DialogContent
            className="supabase-console-dialog sb-review-dialog"
            style={{ maxWidth: 540 }}
            showCloseButton={!reviewing}
          >
            <DialogTitle>
              {decision?.approve
                ? "Approve sourced observation?"
                : "Reject staged observation?"}
            </DialogTitle>
            <DialogDescription>
              {decision?.approve
                ? "Confirm the original evidence, reporting year and population before publishing this observation. Conflicts and source rules are checked by the server."
                : "This marks the staged observation as rejected and retains its evidence and review history."}
            </DialogDescription>
            {decision && (
              <dl className="sb-review-evidence">
                <dt>Observation</dt>
                <dd>{recordTitle(decision.row)}</dd>
                <dt>Record ID</dt>
                <dd>{decision.row.id}</dd>
                <dt>Reporting year</dt>
                <dd>{String(decision.row.year ?? "Unspecified")}</dd>
                <dt>Value</dt>
                <dd>
                  {String(decision.row.normalized_value ?? "Unspecified")}{" "}
                  {String(decision.row.unit ?? "")}
                </dd>
                <dt>Original source</dt>
                <dd>
                  {typeof decision.row.source_url === "string" &&
                  /^https:\/\//.test(decision.row.source_url) ? (
                    <a
                      href={decision.row.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {decision.row.source_url}
                    </a>
                  ) : (
                    "Source unavailable"
                  )}
                </dd>
                <dt>Scope / evidence</dt>
                <dd>
                  {String(
                    decision.row.notes ??
                      "Inspect the full record and original source for population and scope.",
                  )}
                </dd>
              </dl>
            )}
            {reviewError && (
              <p className="sb-inline-error" role="alert">
                {reviewError}
              </p>
            )}
            <div className="sb-review-actions">
              <button
                type="button"
                className="sb-btn"
                disabled={reviewing}
                onClick={() => setDecision(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sb-btn sb-btn-primary"
                disabled={reviewing || loading || !!error}
                onClick={() => void review()}
              >
                {reviewing
                  ? "Recording decision…"
                  : decision?.approve
                    ? "Approve observation"
                    : "Reject observation"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
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
  const { request: adminRequest } = useStaffAccount();
  const { accountScope } = useCollege();
  const [values, setValues] = useState<Record<string, unknown>>(record || {}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const editorRevision = useRef(0);
  useLayoutEffect(() => {
    const editor = editorRevision;
    editor.current++;
    setBusy(false);
    return () => {
      editor.current++;
    };
  }, [entity, record]);
  useEffect(() => {
    setValues(record || {});
    setError("");
  }, [record]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const token = accountScope.capture(),
      editor = editorRevision.current;
    const current = () =>
      accountScope.isCurrent(token) && editorRevision.current === editor;
    setBusy(true);
    setError("");
    try {
      await adminRequest({
        action: "save",
        entity,
        record: { ...values, id: record?.id || undefined },
      });
      if (!current()) return;
      onSaved();
      toast.success("Record saved with audit history");
    } catch (e) {
      if (e instanceof StaffAccountChangedError) return;
      if (current()) setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <Dialog open={!!record} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="supabase-console-dialog"
        style={{ maxWidth: 680, maxHeight: "90vh", overflow: "auto" }}
      >
        <DialogTitle>
          {record?.id ? "Edit" : "Create"} {entity.replaceAll("_", " ")}
        </DialogTitle>
        <DialogDescription>
          Validation runs on the server. Content changes are recorded in the
          audit log.
        </DialogDescription>
        <form onSubmit={save}>
          <div className="sb-form-grid">
            {(fieldDefinitions[entity] || []).map((f) =>
              f.type === "requirement" ? (
                <label className="sb-field" key={f.key}>
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
                <label className="sb-field" key={f.key}>
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
            <label className="sb-field">
              Institution logo (PNG, JPEG, WebP; max 5 MB)
              <input
                type="file"
                disabled={busy}
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0],
                    db = getSupabase();
                  if (!file || !db) return;
                  const token = accountScope.capture(),
                    editor = editorRevision.current;
                  const current = () =>
                    accountScope.isCurrent(token) &&
                    editorRevision.current === editor;
                  setBusy(true);
                  setError("");
                  try {
                    const url = await uploadAdminLogo(
                      file,
                      { scope: accountScope, token, isEditorCurrent: current },
                      {
                        getSession: () => db.auth.getSession(),
                        upload: ({ path, file, contentType, accessToken }) =>
                          db.storage
                            .from("university-logos")
                            .upload(path, file, {
                              contentType,
                              headers: {
                                Authorization: "Bearer " + accessToken,
                              },
                            }),
                        publicUrl: (path) =>
                          db.storage.from("university-logos").getPublicUrl(path)
                            .data.publicUrl,
                        randomId: () => crypto.randomUUID(),
                      },
                    );
                    if (current())
                      setValues((old) => ({
                        ...old,
                        logo_url: url,
                      }));
                  } catch (error) {
                    if (error instanceof AdminLogoChangedError) return;
                    if (current())
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Logo upload failed. Please retry.",
                      );
                  } finally {
                    if (current()) setBusy(false);
                  }
                }}
              />
            </label>
          )}
          {error && (
            <p className="sb-inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="sb-btn sb-btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save record"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CandidateReview({
  id,
  onReviewed,
}: {
  id: string;
  onReviewed: () => Promise<void>;
}) {
  const { request: adminRequest } = useStaffAccount();
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
      if (e instanceof StaffAccountChangedError) return;
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="sb-candidate">
      <label className="sb-field">
        Existing university UUID (optional)
        <input
          value={existing}
          onChange={(e) => setExisting(e.target.value)}
          placeholder="Link instead of creating a draft"
        />
      </label>
      <span className="sb-row-actions">
        <button
          className="sb-text-btn"
          disabled={pending}
          onClick={() => review(true)}
        >
          {existing ? "Link identity" : "Create unpublished draft"}
        </button>
        <button
          className="sb-text-btn"
          disabled={pending}
          onClick={() => review(false)}
        >
          Reject
        </button>
      </span>
    </div>
  );
}
