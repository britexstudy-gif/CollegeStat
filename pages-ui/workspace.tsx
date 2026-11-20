"use client";
import { recordActivity } from "@/lib/progress-store";
import { filterLabel } from "@/lib/filter-labels";
import { workspaceSectionHref } from "@/lib/workspace-navigation";
import { FEATURES } from "@/lib/features";
import { loadWorkspaceUniversities } from "@/lib/workspace-universities";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GraduationCap,
  Sparkles,
  Columns2,
  Search,
  ListChecks,
  FolderOpen,
  ArrowRight,
  Target,
  FilePenLine,
  History,
  X,
} from "lucide-react";
import { StudentStudio } from "@/components/college/student-studio";
import { PlanBoard } from "@/components/college/plan-board";
import { practiceSets } from "@/lib/student-practice";
import { deadlineDate } from "@/lib/application-dates";
import { useCollege } from "@/components/college/provider";
import {
  EmptyState,
  Choice,
} from "@/components/college/primitives";
import { University, countryName } from "@/lib/domain";
import { WorkspaceDraftField } from "@/components/college/workspace-draft-field";
import { writeWorkspace, removeWorkspace, updateWorkspaceTask, WorkspaceAccountChangedError } from "@/services/workspace-mutations";
import type { AccountToken } from "@/lib/account-owner";
import { universitiesByIds } from "@/lib/supabase/catalogue";
import { loadWorkspace, emptyWorkspace, Workspace } from "@/services/workspace";
import {
  dueLabel,
  prioritizeTasks,
  validPlanDate,
  localPlanDate,
} from "@/lib/workspace-planner";
import {
  OnePrepShell,
  OnePrepGateShell,
  type OnePrepSection,
  ONEPREP_SECTIONS,
} from "@/components/college/workspace-oneprep-shell";
import { OnePrepOverview, WorkspaceSummaryContext } from "@/components/college/workspace-oneprep-overview";
import { MyCollegesBoard, STATUS_VALUES, statusLabel } from "@/components/college/my-colleges";
import { nextDeadline } from "@/lib/my-colleges";
import { useT } from "@/components/college/i18n";

const SECTION_TITLES: Record<OnePrepSection, { title: string; desc: string }> =
  {
    Overview: { title: "Home", desc: "Your study and application workspace." },
    Practice: {
      title: "Practice studio",
      desc: "Choose a short original session, then review each explanation.",
    },
    Writing: {
      title: "Writing desk",
      desc: "Work on a personal statement, motivation letter or recommendation request.",
    },
    Guide: {
      title: "Research guide",
      desc: "Use your shortlist to decide what to check next.",
    },
    Universities: {
      title: "My shortlist",
      desc: "Your universities, private notes and application status.",
    },
    Scholarships: {
      title: "Saved scholarships",
      desc: "Saved awards and deadlines.",
    },
    Comparisons: {
      title: "Comparisons",
      desc: "Saved university tables.",
    },
    Searches: {
      title: "Saved searches",
      desc: "Saved explorer filters.",
    },
    History: {
      title: "Recently viewed",
      desc: "Private to your account · newest first.",
    },
    Checklist: {
      title: "My application plan",
      desc: "Keep track of tasks and dates for your applications.",
    },
    Lists: {
      title: "Research lists",
      desc: "Group saved universities.",
    },
  };

function isSection(value: string | null): value is OnePrepSection {
  return !!value && (ONEPREP_SECTIONS as string[]).includes(value);
}

export default function WorkspacePage({
  children,
  embedded = false,
}: {
  children?: React.ReactNode;
  embedded?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const s = useCollege(),
    dashboard = embedded || /^\/dashboard(?:\/|$)/.test(pathname);
  const nested =
    embedded && pathname !== "/dashboard" && pathname !== "/dashboard/prepare";
  const params = useSearchParams();
  const askedSection =
    params.get("section") ||
    (pathname === "/dashboard/prepare"
      ? "Practice"
      : pathname === "/dashboard"
        ? "Overview"
        : null);
  // Test prep is hidden (lib/features.ts): its practice tab opens the writing desk instead.
  const requestedSection = askedSection === "Practice" && !FEATURES.testPrep ? "Writing" : askedSection;
  const requestedTrack = params.get("track");
  const initialTab: OnePrepSection = dashboard ? "Overview" : "Universities";
  const [storedData, setData] = useState<Workspace>(emptyWorkspace),
    [storedUniversities, setUniversities] = useState<University[]>([]),
    [owner, setOwner] = useState<string | undefined>(),
    [ownerGeneration, setOwnerGeneration] = useState(-1),
    [successfulOwner, setSuccessfulOwner] = useState<string | undefined>(),
    [loading, setLoading] = useState(false),
    [tab, setTab] = useState<OnePrepSection>(initialTab),
    [practiceTrack, setPracticeTrack] = useState("math"),
    [practiceEntry, setPracticeEntry] = useState(0),
    [list, setList] = useState("all"),
    [listName, setListName] = useState(""),
    [listBusy, setListBusy] = useState(false),
    [error, setError] = useState(""),
    [workspaceQuery, setWorkspaceQuery] = useState(""),
    [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const userId = s.user?.id;
  const accountGeneration = useSyncExternalStore(
    useCallback((notify) => s.accountScope.subscribe(notify), [s.accountScope]),
    () => s.accountScope.capture().generation,
    () => 0,
  );
  const pendingRowsRef = useRef(new Set<string>());
  const renderedAccount: AccountToken = { owner: userId || null, generation: accountGeneration };
  const listRetry = useRef<{ fingerprint: string; id: string } | null>(null);
  const currentUserId = useRef(userId);
  useLayoutEffect(() => {
    currentUserId.current = userId;
  }, [userId]);
  const revision = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const lastRequestedTrack = useRef<string | undefined>(undefined);
  const loadedOwner = useRef<string | undefined>(undefined);
  useEffect(() => {
    listRetry.current = null;
    pendingRowsRef.current.clear();
    setPendingRows(new Set());
    loadedOwner.current = undefined;
    setSuccessfulOwner(undefined);
    setOwner(undefined);
    setOwnerGeneration(-1);
    setData(emptyWorkspace);
    setUniversities([]);
    setListName("");
    setList("all");
    setWorkspaceQuery("");
    setListBusy(false);
    lastRequestedTrack.current = undefined;
    setPracticeTrack("math");
    setPracticeEntry(0);
    setTab(initialTab);
  }, [userId, accountGeneration, initialTab]);
  useEffect(() => {
    if (isSection(requestedSection)) setTab(requestedSection);
    if (
      requestedTrack &&
      Object.hasOwn(practiceSets, requestedTrack) &&
      lastRequestedTrack.current !== requestedTrack
    ) {
      lastRequestedTrack.current = requestedTrack;
      setPracticeTrack(requestedTrack);
      setPracticeEntry((entry) => entry + 1);
    }
  }, [requestedSection, requestedTrack, userId, accountGeneration]);
  const selectSection = (next: OnePrepSection, track?: string) => {
    setTab(next);
    router.push(workspaceSectionHref(next, track), { scroll: false });
  };
  const data = owner === userId && ownerGeneration === accountGeneration ? storedData : emptyWorkspace;
  const universities = useMemo(
    () => (owner === userId && ownerGeneration === accountGeneration ? storedUniversities : []),
    [owner, userId, storedUniversities, ownerGeneration, accountGeneration],
  );
  const universityIndex = useMemo(
    () => new Map(universities.map((u) => [u.id, u])),
    [universities],
  );
  const reload = useCallback(async () => {
    // An operation from a previous account must not invalidate this account's load.
    const captured = { owner: userId || null, generation: accountGeneration };
    if (userId !== currentUserId.current || !s.accountScope.isCurrent(captured)) return;
    loadController.current?.abort();
    const current = ++revision.current;
    if (!userId) {
      setData(emptyWorkspace);
      setUniversities([]);
      setOwner(undefined);
      loadedOwner.current = undefined;
      setSuccessfulOwner(undefined);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    loadController.current = controller;
    const deadline = setTimeout(() => {
      const timeoutError = new Error("Your workspace took too long to refresh. Please retry.");
      timeoutError.name = "WorkspaceRefreshTimeout";
      controller.abort(timeoutError);
    }, 30000);
    const unsubscribe = s.accountScope.subscribe(() => {
      if (!s.accountScope.isCurrent(captured)) controller.abort();
    });
    setLoading(true);
    try {
      const d = await loadWorkspace(userId, { signal: controller.signal });
      const institutions = await loadWorkspaceUniversities(
        [
          ...d.saved.map((v) => v.university_id),
          ...d.history.map((v) => v.university_id),
        ],
        universitiesByIds,
        {
          signal: controller.signal,
          isCurrent: () =>
            current === revision.current && userId === currentUserId.current && s.accountScope.isCurrent(captured),
        },
      );
      if (current !== revision.current || userId !== currentUserId.current || !s.accountScope.isCurrent(captured))
        return;
      setData(d);
      setUniversities(institutions);
      setOwner(userId);
      setOwnerGeneration(captured.generation);
      loadedOwner.current = userId;
      setSuccessfulOwner(userId);
      setList((selected) =>
        selected === "all" || d.lists.some((item) => item.id === selected)
          ? selected
          : "all",
      );
      setError("");
    } catch (loadError) {
      if (controller.signal.aborted && controller.signal.reason?.name !== "WorkspaceRefreshTimeout") return;
      if (current === revision.current && userId === currentUserId.current && s.accountScope.isCurrent(captured)) {
        if (loadedOwner.current !== userId) {
          setData(emptyWorkspace);
          setUniversities([]);
          setOwner(userId);
          setOwnerGeneration(captured.generation);
        }
        setError(
          loadError instanceof Error &&
            loadError.name === "WorkspaceCapacityError"
            ? loadError.message
            : loadedOwner.current === userId
              ? "Your saved research could not be refreshed. Your last loaded items are still here. Please retry."
              : "Your saved research could not be loaded. Practice and writing are available while you retry.",
        );
      }
    } finally {
      clearTimeout(deadline);
      unsubscribe();
      if (current === revision.current && userId === currentUserId.current && s.accountScope.isCurrent(captured))
        setLoading(false);
    }
  }, [userId, s.accountScope, accountGeneration]);
  useEffect(() => {
    void reload();
    const counter = revision;
    return () => {
      counter.current++;
      loadController.current?.abort();
    };
  }, [reload, s.saved, s.savedScholarships]);
  const beginEdit = (key: string, captured: AccountToken) => {
    if (!s.accountScope.isCurrent(captured) || pendingRowsRef.current.has(key)) return false;
    pendingRowsRef.current.add(key);
    setPendingRows(new Set(pendingRowsRef.current));
    return true;
  };
  const endEdit = (key: string, captured: AccountToken) => {
    if (!s.accountScope.isCurrent(captured)) return;
    pendingRowsRef.current.delete(key);
    setPendingRows(new Set(pendingRowsRef.current));
  };
  const write = async (
    table: string,
    payload: Record<string, unknown>,
    conflict?: string,
    captured: AccountToken = renderedAccount,
    announce = true,
  ) => {
    if (!s.user || captured.owner !== userId || !s.accountScope.isCurrent(captured)) return false;
    const key = table + ":" + String(payload.university_id || payload.id || payload.list_id || "") + ":" + Object.keys(payload).filter((field) => !["id", "university_id", "list_id"].includes(field)).sort().join(",");
    if (!beginEdit(key, captured)) return false;
    try {
      await writeWorkspace(s.accountScope, table, payload, conflict, captured);
      if (!s.accountScope.isCurrent(captured)) return false;
      await reload();
      if (!s.accountScope.isCurrent(captured)) return false;
      if (announce) toast.success("Saved");
      return true;
    } catch (error) {
      if (s.accountScope.isCurrent(captured) && !(error instanceof WorkspaceAccountChangedError) && announce)
        toast.error(error instanceof Error ? error.message : "Could not save. Please retry.");
      return false;
    } finally { endEdit(key, captured); }
  };
  const remove = async (table: string, id: string) => {
    const captured = renderedAccount;
    if (!s.user || captured.owner !== userId || !s.accountScope.isCurrent(captured)) return;
    const key = (table === "user_checklist" ? "task:" : "remove:") + id;
    if (!beginEdit(key, captured)) return;
    try {
      await removeWorkspace(s.accountScope, table, id, captured);
      if (s.accountScope.isCurrent(captured)) await reload();
    } catch (error) {
      if (s.accountScope.isCurrent(captured) && !(error instanceof WorkspaceAccountChangedError))
        toast.error(error instanceof Error ? error.message : "Could not remove. Please retry.");
    } finally { endEdit(key, captured); }
  };
  const updateTask = async (id: string, payload: Record<string, unknown>) => {
    const captured = renderedAccount;
    if (!s.user || captured.owner !== userId || !s.accountScope.isCurrent(captured)) return false;
    const key = "task:" + id;
    if (!beginEdit(key, captured)) return false;
    try {
      await updateWorkspaceTask(s.accountScope, id, payload, captured);
      if (!s.accountScope.isCurrent(captured)) return false;
      if (payload.done === true) void recordActivity("task", id);
      await reload();
      return s.accountScope.isCurrent(captured);
    } catch (error) {
      if (s.accountScope.isCurrent(captured) && !(error instanceof WorkspaceAccountChangedError))
        toast.error(error instanceof Error ? error.message : "Could not update your task. Please retry.");
      return false;
    } finally { endEdit(key, captured); }
  };
  if (!s.authReady)
    return (
      <div className="oneprep-workspace">
        <div className="oneprep-workspace__main">
          <div className="oneprep-workspace__content">
            <p role="status">Opening your workspace…</p>
          </div>
        </div>
      </div>
    );
  if (!s.user)
    return (
      <OnePrepGateShell>
        <section
          className="oneprep-pagehead"
          aria-labelledby="oneprep-gate-title"
        >
          <div className="oneprep-pagehead__eyebrow">Student workspace</div>
          <h1 id="oneprep-gate-title">Make your next step clearer.</h1>
          <p>
            Keep your shortlist, steps and deadlines in one place. Sign in to
            pick up where you left off.
          </p>
          <div className="oneprep-btnrow" style={{ marginTop: 12 }}>
            <Link
              className="button button-primary"
              href="/auth/sign-in?next=/dashboard"
            >
              Sign in <ArrowRight size={15} />
            </Link>
            <Link
              className="button button-secondary"
              href="/auth/sign-up?next=/dashboard"
            >
              Create an account
            </Link>
          </div>
        </section>
        <div className="oneprep-gate">
          <section className="oneprep-card" aria-label="Start exploring">
            <h2>Start exploring</h2>
            <p>Browse freely. Your saved plan appears after sign-in.</p>
            <div className="oneprep-gate__links">
              {[
                [
                  "Practice studio",
                  "Short original exercises",
                  "/auth/sign-in?next=%2Fdashboard%3Fsection%3DPractice",
                  Target,
                ],
                [
                  "Writing desk",
                  "Draft your statement",
                  "/auth/sign-in?next=%2Fdashboard%3Fsection%3DWriting",
                  FilePenLine,
                ],
                [
                  "Universities",
                  "Costs, requirements, sources",
                  "/universities",
                  GraduationCap,
                ],
                [
                  "Funding",
                  "Eligibility and coverage",
                  "/scholarships",
                  Sparkles,
                ],
                [
                  "Application guides",
                  "Turn a guide into tasks",
                  "/resources",
                  ListChecks,
                ],
              ].map(([name, description, href, I]) => {
                const Icon = I as typeof Search;
                return (
                  <Link key={String(href)} href={String(href)}>
                    <Icon size={17} aria-hidden="true" />
                    <span>
                      <strong>{String(name)}</strong>
                      <small>{String(description)}</small>
                    </span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
          <section className="oneprep-card" aria-label="How it works">
            <h2>How it works</h2>
            <ul className="oneprep-list">
              <li className="oneprep-row">
                <span>
                  1. Explore
                  <small>Compare universities and awards.</small>
                </span>
              </li>
              <li className="oneprep-row">
                <span>
                  2. Save
                  <small>Shortlist, tasks and lists are private.</small>
                </span>
              </li>
              <li className="oneprep-row">
                <span>
                  3. Apply
                  <small>Track status and deadlines weekly.</small>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </OnePrepGateShell>
    );
  const today = localPlanDate();
  const ready = owner === userId && ownerGeneration === accountGeneration;
  const hasData = ready && (!error || successfulOwner === userId);
  const focusedStudy =
    tab === "Practice" || tab === "Writing" || tab === "Guide";
  const upcoming = [
    ...data.saved.flatMap((v) =>
      v.deadline
        ? [
            {
              id: v.id,
              label: "Your application target",
              name:
                universityIndex.get(v.university_id)?.name ||
                "Saved university",
              date: v.deadline,
              href: universityIndex.has(v.university_id)
                ? "/university/" + universityIndex.get(v.university_id)!.slug
                : "/universities",
            },
          ]
        : [],
    ),
    ...universities
      .filter((u) => data.saved.some((v) => v.university_id === u.id))
      .flatMap((u) =>
        u.deadlines.map((d) => ({
          id: d.id,
          label: d.student_category,
          name: d.title,
          date: deadlineDate(d),
          href: "/university/" + u.slug + "?tab=Admissions",
        })),
      ),
    ...s.scholarships
      .filter((a) => s.savedScholarships.includes(a.id) && a.deadline)
      .map((a) => ({
        id: a.id,
        label: "Saved scholarship",
        name: a.name,
        date: a.deadline!,
        href: "/scholarships/" + a.slug,
      })),
    ...data.checklist
      .filter((t) => !t.done && t.due_at)
      .map((t) => ({
        id: t.id,
        label: "Your checklist",
        name: t.title,
        date: t.due_at!,
        href: workspaceSectionHref("Checklist"),
      })),
  ]
    .filter((item) => validPlanDate(item.date) && item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const priorityTasks = prioritizeTasks(data.checklist);
  const shown = data.saved.filter(
    (v) =>
      (list === "all" ||
        data.items.some(
          (i) => i.university_id === v.university_id && i.list_id === list,
        )),
  );
  const trimmedQuery = workspaceQuery.trim().toLowerCase();
  const searching = trimmedQuery.length >= 2;
  const openTasks = data.checklist.filter((t) => !t.done);
  const historySorted = [...data.history].sort((a, b) =>
    b.viewed_at.localeCompare(a.viewed_at),
  );
  const searchResults = !searching
    ? null
    : {
        universities: universities
          .filter((u) => data.saved.some((v) => v.university_id === u.id))
          .filter((u) =>
            [u.name, u.city, countryName(u.country_code), u.slug]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(trimmedQuery),
          )
          .slice(0, 5),
        scholarships: s.scholarships
          .filter((a) => s.savedScholarships.includes(a.id))
          .filter((a) =>
            [a.name, a.slug]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(trimmedQuery),
          )
          .slice(0, 4),
        tasks: data.checklist
          .filter((t) => t.title.toLowerCase().includes(trimmedQuery))
          .slice(0, 5),
        lists: data.lists
          .filter((l) => l.name.toLowerCase().includes(trimmedQuery))
          .slice(0, 4),
        comparisons: data.comparisons
          .filter((c) => c.name.toLowerCase().includes(trimmedQuery))
          .slice(0, 4),
        searches: data.searches
          .filter((v) => v.name.toLowerCase().includes(trimmedQuery))
          .slice(0, 4),
        history: historySorted
          .filter((h) =>
            (universityIndex.get(h.university_id)?.name || "")
              .toLowerCase()
              .includes(trimmedQuery),
          )
          .slice(0, 4),
      };
  const searchTotal = searchResults
    ? searchResults.universities.length +
      searchResults.scholarships.length +
      searchResults.tasks.length +
      searchResults.lists.length +
      searchResults.comparisons.length +
      searchResults.searches.length +
      searchResults.history.length
    : 0;
  const todayLabel = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(today + "T00:00:00Z"));
  const counts: Partial<Record<OnePrepSection, number>> = hasData
    ? {
        Universities: data.saved.length,
        Scholarships: s.savedScholarships.length,
        Checklist: openTasks.length,
        Lists: data.lists.length,
        Comparisons: data.comparisons.length,
        Searches: data.searches.length,
        History: data.history.length,
      }
    : {};
  const status = t("d3.updating");
  // Only a slow refresh is worth a status line; quick background refreshes stay silent.
  const slowRefresh = useSlow(loading && ready, 1500);
  const displayName =
    s.profile?.display_name?.trim().split(/\s+/)[0] || "Student";
  const head = SECTION_TITLES[tab];
  return (
    <OnePrepShell
      tab={tab}
      onTab={selectSection}
      counts={counts}
      status={slowRefresh ? status : undefined}
      displayName={displayName}
    >
      <div className="workspace-route-content" hidden={nested}>
        {tab !== "Overview" && tab !== "Writing" && tab !== "Checklist" && tab !== "Universities" && (
          <section
            className="oneprep-pagehead"
            aria-labelledby="oneprep-page-title"
          >
            <div className="oneprep-pagehead__eyebrow">
              {tab} · {todayLabel}
            </div>
            <h1 id="oneprep-page-title">{head.title}</h1>
            <p>
              {head.desc}{" "}
              {tab === "Scholarships" &&
                hasData &&
                `${s.savedScholarships.length} saved.`}
            </p>
          </section>
        )}
        {!focusedStudy && tab !== "Overview" && tab !== "Checklist" && tab !== "Universities" && hasData && (
          <div
            className="oneprep-search"
            role="search"
            aria-label="Search your workspace"
          >
            <div className="oneprep-search__row">
              <Search size={16} aria-hidden="true" />
              <label htmlFor="oneprep-workspace-search" className="sr-only">
                Search saved universities, scholarships, tasks and lists
              </label>
              <input
                id="oneprep-workspace-search"
                type="search"
                autoComplete="off"
                placeholder="Search saved universities, tasks, lists…"
                value={workspaceQuery}
                onChange={(e) => setWorkspaceQuery(e.target.value)}
                maxLength={120}
              />
              {workspaceQuery && (
                <button
                  type="button"
                  aria-label="Clear workspace search"
                  onClick={() => setWorkspaceQuery("")}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
            {!searching ? null : searchTotal === 0 ? (
              <div className="oneprep-hint" role="status">
                <strong>No matches for “{workspaceQuery.trim()}”</strong>
                <span>
                  Try a university name, task title or list name. Practice
                  results stay in the Practice tab.
                </span>
              </div>
            ) : (
              <div
                className="oneprep-search__groups"
                role="status"
                aria-label={`${searchTotal} workspace matches`}
              >
                {searchResults!.universities.length > 0 && (
                  <div className="oneprep-search__group">
                    <h3>Universities</h3>
                    <ul>
                      {searchResults!.universities.map((u) => (
                        <li key={u.id}>
                          <Link href={"/university/" + u.slug}>
                            <GraduationCap size={15} aria-hidden="true" />
                            <span>
                              {u.name}
                              <small>
                                {[u.city, countryName(u.country_code)]
                                  .filter(Boolean)
                                  .join(" · ") || "Saved university"}
                              </small>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {searchResults!.scholarships.length > 0 && (
                  <div className="oneprep-search__group">
                    <h3>Scholarships</h3>
                    <ul>
                      {searchResults!.scholarships.map((a) => (
                        <li key={a.id}>
                          <Link
                            href={
                              a.slug
                                ? "/scholarships/" + a.slug
                                : "/scholarships"
                            }
                          >
                            <Sparkles size={15} aria-hidden="true" />
                            <span>
                              {a.name}
                              <small>
                                {a.deadline
                                  ? "Deadline " + a.deadline
                                  : "Deadline not published"}
                              </small>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {searchResults!.tasks.length > 0 && (
                  <div className="oneprep-search__group">
                    <h3>Checklist</h3>
                    <ul>
                      {searchResults!.tasks.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => selectSection("Checklist")}
                          >
                            <ListChecks size={15} aria-hidden="true" />
                            <span>
                              {t.title}
                              <small>
                                {t.done
                                  ? "Completed"
                                  : t.due_at
                                    ? dueLabel(t.due_at, today)
                                    : "Open task"}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(searchResults!.lists.length > 0 ||
                  searchResults!.comparisons.length > 0 ||
                  searchResults!.searches.length > 0) && (
                  <div className="oneprep-search__group">
                    <h3>Lists & research</h3>
                    <ul>
                      {searchResults!.lists.map((l) => (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => selectSection("Lists")}
                          >
                            <FolderOpen size={15} aria-hidden="true" />
                            <span>
                              {l.name}
                              <small>Research list</small>
                            </span>
                          </button>
                        </li>
                      ))}
                      {searchResults!.comparisons.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={"/compare?ids=" + c.university_ids.join(",")}
                          >
                            <Columns2 size={15} aria-hidden="true" />
                            <span>
                              {c.name}
                              <small>
                                {c.university_ids.length} universities
                              </small>
                            </span>
                          </Link>
                        </li>
                      ))}
                      {searchResults!.searches.map((v) => (
                        <li key={v.id}>
                          <button
                            type="button"
                            onClick={() => selectSection("Searches")}
                          >
                            <Search size={15} aria-hidden="true" />
                            <span>
                              {v.name}
                              <small>Saved search</small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {searchResults!.history.length > 0 && (
                  <div className="oneprep-search__group">
                    <h3>Recently viewed</h3>
                    <ul>
                      {searchResults!.history.map((h) => (
                        <li key={h.id}>
                          <Link
                            href={
                              universityIndex.get(h.university_id)
                                ? "/university/" +
                                  universityIndex.get(h.university_id)!.slug
                                : "/universities"
                            }
                          >
                            <History size={15} aria-hidden="true" />
                            <span>
                              {universityIndex.get(h.university_id)?.name ||
                                "Viewed university"}
                              <small>Research history · private</small>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {!ready && !focusedStudy && tab !== "Overview" && (
          <div className="mx-auto grid w-full max-w-[1120px] gap-4" role="status" aria-label={t("d3.loading")}>
            <div className="h-16 w-2/3 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
            <div className="h-72 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
          </div>
        )}
        {error && (
          <div className="mx-auto mb-4 flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--cs-warning)_35%,var(--cs-line))] bg-[color-mix(in_srgb,var(--cs-warning)_8%,var(--cs-surface))] px-4 py-3 text-[13.5px]" role="alert">
            <span>{error}</span>
            <button type="button" className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] font-medium hover:bg-muted" onClick={reload} disabled={loading}>
              {t("d2.pf.recover.retry")}
            </button>
          </div>
        )}
        {tab === "Overview" && (
          <OnePrepOverview
            displayName={displayName}
            today={today}
            dataReady={hasData}
            tasks={priorityTasks}
            pendingTaskIds={new Set([...pendingRows].filter((key) => key.startsWith("task:")).map((key) => key.slice(5)))}
            onCompleteTask={(id, done) => void updateTask(id, { done })}
            onTab={selectSection}
            upcoming={upcoming.filter(
              (item) => item.label !== "Your checklist",
            )}
            tracker={data.saved.map((v) => ({
              id: v.university_id,
              status: v.status,
              deadline: v.deadline,
              university: universityIndex.get(v.university_id),
            }))}
          />
        )}
        <StudentStudio
          key={userId}
          owner={s.user.id}
          accountScope={s.accountScope}
          practiceTrack={practiceTrack}
          practiceEntry={practiceEntry}
          mode={
            !nested &&
            (tab === "Practice" || tab === "Writing" || tab === "Guide")
              ? tab
              : undefined
          }
          universities={universities.filter((u) =>
            data.saved.some((v) => v.university_id === u.id),
          )}
          addTask={(title) => write("user_checklist", { title, due_at: null })}
        />
        {hasData && (
          <>
            {tab === "Universities" && (
              <MyCollegesBoard
                today={today}
                toolbar={
                  data.lists.length > 0 ? (
                    <Choice
                      label="Research list"
                      value={list}
                      onChange={setList}
                      options={[
                        { value: "all", label: "All universities" },
                        ...data.lists.map((l) => ({ value: l.id, label: l.name })),
                      ]}
                    />
                  ) : null
                }
                rows={shown.map((saved) => {
                  const u = universityIndex.get(saved.university_id);
                  return {
                    id: saved.university_id,
                    status: saved.status,
                    university: u,
                    nextDeadline: nextDeadline(u, saved.deadline, today),
                    onRemove: () => void s.toggleSaved(saved.university_id),
                    statusControl: (
                      <Choice
                        label={"Application status for " + (u?.name || "")}
                        disabled={pendingRows.has("saved_universities:" + saved.university_id + ":status")}
                        value={saved.status}
                        onChange={(v) =>
                          void write("saved_universities", { university_id: saved.university_id, status: v }, "user_id,university_id")
                        }
                        options={STATUS_VALUES.map((value) => ({ value, label: statusLabel(t, value) }))}
                      />
                    ),
                    details: u ? (
                      <>
                        <WorkspaceDraftField
                          key={`notes:${userId}:${accountGeneration}:${u.id}`}
                          label={"Private notes for " + u.name}
                          value={data.notes.find((n) => n.university_id === u.id)?.body || ""}
                          onSave={(body) => write("user_notes", { university_id: u.id, body }, "user_id,university_id", renderedAccount, false)}
                        />
                        <WorkspaceDraftField
                          key={`target:${userId}:${accountGeneration}:${u.id}`}
                          kind="date"
                          label={"Application target for " + u.name}
                          help="Your planning date. Confirm the official course deadline."
                          value={saved.deadline || ""}
                          onSave={(date) => write("saved_universities", { university_id: u.id, deadline: date || null }, "user_id,university_id", renderedAccount, false)}
                        />
                        {data.lists.length > 0 && (
                          <Choice
                            label={"List for " + u.name}
                            value="none"
                            onChange={(v) => {
                              if (v === "none") return;
                              void write(
                                "user_list_items",
                                { list_id: v, university_id: u.id, position: data.items.filter((i) => i.list_id === v).length },
                                "list_id,university_id",
                              );
                            }}
                            options={[{ value: "none", label: "Add to a list" }, ...data.lists.map((l) => ({ value: l.id, label: l.name }))]}
                          />
                        )}
                      </>
                    ) : null,
                  };
                })}
              />
            )}
            {tab === "Scholarships" && (
              <>
                {s.savedScholarships.length ? (
                  s.scholarships
                    .filter((a) => s.savedScholarships.includes(a.id))
                    .map((a) => (
                      <div className="workspace-row" key={a.id}>
                        <div>
                          <h3>{a.name}</h3>
                          <p>Deadline: {a.deadline || "Not published"}</p>
                        </div>
                        <Link
                          className="text-link"
                          href={
                            a.slug ? "/scholarships/" + a.slug : "/scholarships"
                          }
                        >
                          Review award →
                        </Link>
                      </div>
                    ))
                ) : (
                  <EmptyState
                    title="Keep funding in your research."
                    description="Save a sourced scholarship and track its deadline from the scholarship directory."
                    action={
                      <Link
                        className="button button-primary"
                        href="/scholarships"
                      >
                        Explore scholarships
                      </Link>
                    }
                  />
                )}
              </>
            )}
            {tab === "Comparisons" && (
              <>
                {data.comparisons.map((c) => (
                  <div className="workspace-row" key={c.id}>
                    <div>
                      <h3>{c.name}</h3>
                      <p>{c.university_ids.length} universities</p>
                    </div>
                    <Link
                      className="text-link"
                      href={"/compare?ids=" + c.university_ids.join(",")}
                    >
                      Open →
                    </Link>
                    <button onClick={() => remove("comparison_lists", c.id)}>
                      Remove
                    </button>
                  </div>
                ))}
                {!data.comparisons.length && (
                  <EmptyState
                    title="Keep a decision in context."
                    description="Build a comparison, then choose Save comparison to return to it here."
                    action={
                      <Link className="button button-primary" href="/compare">
                        Start comparing
                      </Link>
                    }
                  />
                )}
              </>
            )}
            {tab === "Searches" && (
              <>
                {data.searches.map((v) => (
                  <div className="workspace-row" key={v.id}>
                    <div>
                      <h3>{v.name}</h3>
                      <p>
                        {Object.entries(v.filters)
                          .filter(([k, x]) => x && k !== "page" && k !== "sort")
                          .map(([k, x]) => filterLabel(k, x))
                          .join(" · ")}
                      </p>
                    </div>
                    <Link
                      className="text-link"
                      href={
                        "/universities?" +
                        new URLSearchParams(
                          Object.entries(v.filters).map(([k, v]) => [
                            k,
                            String(v),
                          ]),
                        ).toString()
                      }
                    >
                      Run search →
                    </Link>
                    <button onClick={() => remove("saved_searches", v.id)}>
                      Remove
                    </button>
                  </div>
                ))}
                {!data.searches.length && (
                  <EmptyState
                    title="Keep a useful set of filters."
                    description="Choose Save search in the explorer to revisit your priorities here."
                  />
                )}
              </>
            )}
            {tab === "History" && (
              <>
                <div className="oneprep-sectionhead">
                  <h2>Research history</h2>
                  <p>Private · newest first</p>
                </div>
                {historySorted.length ? (
                  <div className="oneprep-history">
                    {historySorted.slice(0, 30).map((h) => {
                      const u = universityIndex.get(h.university_id);
                      return (
                        <Link
                          key={h.id}
                          href={u ? "/university/" + u.slug : "/universities"}
                        >
                          <History size={15} aria-hidden="true" />
                          <span>
                            {u?.name || "Viewed university"}
                            <small>
                              {[u?.city, u ? countryName(u.country_code) : ""]
                                .filter(Boolean)
                                .join(" · ")}
                              {u?.city || u?.country_code ? " · " : ""}
                              Viewed{" "}
                              {new Intl.DateTimeFormat("en", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              }).format(new Date(h.viewed_at))}
                            </small>
                          </span>
                          <ArrowRight size={13} aria-hidden="true" />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No research history yet."
                    description="Universities you open are listed here, privately. Explore the directory to start."
                    action={
                      <Link
                        className="button button-primary"
                        href="/universities"
                      >
                        Explore universities
                      </Link>
                    }
                  />
                )}
                <p className="oneprep-hint">
                  History is stored per account and never shared. Clear or
                  export it from your profile privacy controls.
                </p>
              </>
            )}
            {tab === "Checklist" && (
              <>
                <PlanBoard
                  tasks={data.checklist}
                  deadlines={upcoming.filter((item) => item.label !== "Your checklist")}
                  today={today}
                  universities={universityIndex}
                  onCreate={(title, due) =>
                    void write("user_checklist", { id: crypto.randomUUID(), title, due_at: due })
                  }
                  onUpdate={(id, payload) => void updateTask(id, payload)}
                  onDelete={(id) => void remove("user_checklist", id)}
                />
              </>
            )}
            {tab === "Lists" && (
              <>
                <form
                  className="assistant-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!listName.trim() || listBusy) return;
                    const captured = renderedAccount;
                    if (!s.accountScope.isCurrent(captured)) return;
                    const fingerprint = listName.trim();
                    if (listRetry.current?.fingerprint !== fingerprint)
                      listRetry.current = { fingerprint, id: crypto.randomUUID() };
                    setListBusy(true);
                    try {
                      if (await write("user_lists", { id: listRetry.current.id, name: fingerprint }, undefined, captured)) {
                        listRetry.current = null;
                        setListName("");
                      }
                    } finally {
                      if (s.accountScope.isCurrent(captured)) setListBusy(false);
                    }
                  }}
                >
                  <input
                    placeholder="Dream, Affordable, Europe, shortlist…"
                    aria-label="New list name"
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    maxLength={100}
                    required
                    disabled={listBusy}
                  />
                  <button
                    className="button button-primary"
                    disabled={listBusy || !listName.trim()}
                  >
                    {listBusy ? "Saving…" : "Create list"}
                  </button>
                </form>
                {!data.lists.length && (
                  <p className="dashboard-empty-hint">
                    Create a list for a destination, budget or round, then add
                    saved universities.
                  </p>
                )}
                <div className="oneprep-grid oneprep-grid--2">
                  {data.lists.map((l) => (
                    <section
                      className="panel"
                      key={l.id}
                    >
                      <h2>{l.name}</h2>
                      <p className="caption">
                        {data.items.filter((i) => i.list_id === l.id).length}{" "}
                        universities · Use “Add to a list” on a saved
                        university to put it here.
                      </p>
                      {data.items
                        .filter((i) => i.list_id === l.id)
                        .sort((a, b) => a.position - b.position)
                        .map((item) => (
                          <div className="workspace-row" key={item.id}>
                            <div>
                              {universityIndex.get(item.university_id)?.name ||
                                "University"}
                            </div>
                            <button
                              aria-label="Remove university from list"
                              onClick={() => remove("user_list_items", item.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      <button
                        className="text-link"
                        style={{ marginTop: 20 }}
                        onClick={() => {
                          if (window.confirm(`Delete “${l.name}” and its list memberships? Your saved universities and notes will stay in your shortlist.`))
                            void remove("user_lists", l.id);
                        }}
                      >
                        Delete list
                      </button>
                    </section>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {nested && (
        <WorkspaceSummaryContext.Provider
          value={{
            today,
            tasks: data.checklist,
            tracker: data.saved.map((v) => ({ id: v.university_id, status: v.status, deadline: v.deadline, university: universityIndex.get(v.university_id) })),
          }}
        >
          <div className="workspace-discovery-view">{children}</div>
        </WorkspaceSummaryContext.Provider>
      )}
    </OnePrepShell>
  );
}

/** True once `on` has stayed true for `ms`; false again as soon as it turns false. */
function useSlow(on: boolean, ms: number) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!on) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return slow;
}
