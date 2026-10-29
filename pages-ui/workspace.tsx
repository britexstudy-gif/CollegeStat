"use client";
import { filterLabel } from "@/lib/filter-labels";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  BookmarkPlus,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns2,
  FolderOpen,
  GraduationCap,
  History as HistoryIcon,
  ListChecks,
  Plus,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { deadlineDate } from "@/lib/application-dates";
import { useCollege } from "@/components/college/provider";
import { Choice, UniversityLogo } from "@/components/college/primitives";
import { University } from "@/lib/domain";
import { getSupabase } from "@/lib/supabase/client";
import { universitiesByIds } from "@/lib/supabase/catalogue";
import { loadWorkspace, emptyWorkspace, Workspace } from "@/services/workspace";
import { STAFF_PATH } from "@/lib/staff-route";
import {
  dueLabel,
  plannerWeek,
  prioritizeTasks,
  validPlanDate,
  localPlanDate,
} from "@/lib/workspace-planner";

const statuses = [
  "Researching",
  "Considering",
  "Applying",
  "Submitted",
  "Accepted",
  "Rejected",
  "Waitlisted",
];
const pipeline = [
  { label: "Researching", match: ["Researching"] },
  { label: "Considering", match: ["Considering"] },
  { label: "Applying", match: ["Applying"] },
  { label: "Submitted", match: ["Submitted"] },
  { label: "Decisions", match: ["Accepted", "Rejected", "Waitlisted"] },
];
const tabs = [
  ["Universities", GraduationCap],
  ["Scholarships", Sparkles],
  ["Comparisons", Columns2],
  ["Searches", Search],
  ["Checklist", ListChecks],
  ["Lists", FolderOpen],
] as const;
type Tab = (typeof tabs)[number][0];
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));

export default function WorkspacePage() {
  const s = useCollege(),
    dashboard = usePathname() === "/dashboard";
  const [storedData, setData] = useState<Workspace>(emptyWorkspace),
    [storedUniversities, setUniversities] = useState<University[]>([]),
    [owner, setOwner] = useState<string | undefined>(),
    [loading, setLoading] = useState(false),
    [tab, setTab] = useState<Tab>("Universities"),
    [list, setList] = useState("all"),
    [listName, setListName] = useState(""),
    [task, setTask] = useState(""),
    [taskDue, setTaskDue] = useState(""),
    [taskBusy, setTaskBusy] = useState(false),
    [error, setError] = useState(""),
    [focusDay, setFocusDay] = useState(""),
    [weekOffset, setWeekOffset] = useState(0);
  const userId = s.user?.id;
  const revision = useRef(0);
  const library = useRef<HTMLElement>(null);
  const data = owner === userId ? storedData : emptyWorkspace;
  const universities = owner === userId ? storedUniversities : [];
  const reload = useCallback(async () => {
    const current = ++revision.current;
    if (!userId) {
      setData(emptyWorkspace);
      setUniversities([]);
      setOwner(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await loadWorkspace(userId);
      const institutions = await universitiesByIds([
        ...new Set([
          ...d.saved.map((v) => v.university_id),
          ...d.history.map((v) => v.university_id),
        ]),
      ]);
      if (current !== revision.current) return;
      setData(d);
      setUniversities(institutions);
      setOwner(userId);
      setError("");
    } catch {
      if (current === revision.current) {
        setData(emptyWorkspace);
        setUniversities([]);
        setOwner(userId);
        setError("Your research could not be loaded. Please retry.");
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    void reload();
    const counter = revision;
    return () => {
      counter.current++;
    };
  }, [reload, s.saved, s.savedScholarships]);
  const write = async (
    table: string,
    payload: Record<string, unknown>,
    conflict?: string,
  ) => {
    const db = getSupabase();
    if (!db || !s.user) return false;
    const q = conflict
      ? db
          .from(table)
          .upsert({ ...payload, user_id: s.user.id }, { onConflict: conflict })
      : db.from(table).insert({ ...payload, user_id: s.user.id });
    const { error } = await q;
    if (error) {
      toast.error("Could not save your change");
      return false;
    }
    await reload();
    toast.success("Saved");
    return true;
  };
  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task.trim() || taskBusy) return;
    setTaskBusy(true);
    try {
      if (
        await write("user_checklist", {
          title: task.trim(),
          due_at: taskDue || null,
        })
      ) {
        setTask("");
        setTaskDue("");
      }
    } finally {
      setTaskBusy(false);
    }
  };
  const remove = async (table: string, id: string) => {
    const db = getSupabase();
    if (!db) return;
    const { error } = await db.from(table).delete().eq("id", id);
    if (error) toast.error("Could not remove item");
    else await reload();
  };
  const setDone = async (id: string, done: boolean) => {
    const { error } = await getSupabase()!
      .from("user_checklist")
      .update({ done })
      .eq("id", id)
      .eq("user_id", s.user!.id);
    if (error) toast.error("Could not update task");
    else await reload();
  };
  const openTab = (next: Tab) => {
    setTab(next);
    library.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (!s.authReady)
    return (
      <div className="db">
        <div className="db-skeleton" role="status" aria-label="Opening your dashboard">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  if (!s.user) return <DashboardGate />;

  const today = localPlanDate();
  const universityOf = (id: string) => universities.find((u) => u.id === id);
  const upcoming = [
    ...data.saved.flatMap((v) => {
      const u = universityOf(v.university_id);
      return v.deadline
        ? [
            {
              id: v.id,
              label: "Your application target",
              name: u?.name || "Saved university",
              date: v.deadline,
              href: u ? "/university/" + u.slug : "/universities",
            },
          ]
        : [];
    }),
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
        label: "Your task",
        name: t.title,
        date: t.due_at!,
        href: "/dashboard",
      })),
  ]
    .filter((item) => validPlanDate(item.date) && item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const priorityTasks = prioritizeTasks(data.checklist);
  const focusedTasks = focusDay
    ? priorityTasks.filter((t) => t.due_at === focusDay)
    : priorityTasks;
  const completed = data.checklist.filter((t) => t.done).length;
  const progress = data.checklist.length
    ? Math.round((completed / data.checklist.length) * 100)
    : 0;
  const overdue = priorityTasks.filter(
    (t) => validPlanDate(t.due_at) && t.due_at < today,
  ).length;
  const shown = data.saved.filter(
    (v) =>
      list === "all" ||
      data.items.some(
        (i) => i.university_id === v.university_id && i.list_id === list,
      ),
  );
  const recent = [...data.history]
    .sort((a, b) => b.viewed_at.localeCompare(a.viewed_at))
    .map((h) => universityOf(h.university_id))
    .filter((u, i, all): u is University => !!u && all.indexOf(u) === i)
    .slice(0, 4);
  const setup = [
    {
      done: data.saved.length > 0,
      label: "Save a university",
      href: "/universities",
    },
    {
      done: data.checklist.some((t) => t.due_at),
      label: "Add a task with a date",
      action: () => document.getElementById("db-task")?.focus(),
    },
    {
      done: s.savedScholarships.length > 0,
      label: "Save a scholarship",
      href: "/scholarships",
    },
    {
      done: data.comparisons.length > 0,
      label: "Save a comparison",
      href: "/compare",
    },
  ];
  const setupDone = setup.filter((x) => x.done).length;
  const week = plannerWeek(today, weekOffset);
  const marked = [
    ...upcoming.map((v) => v.date),
    ...priorityTasks
      .filter((t) => validPlanDate(t.due_at) && t.due_at < today)
      .map((t) => t.due_at!),
  ];
  const next = upcoming[0];
  const firstName = s.profile?.display_name?.split(" ")[0];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const counts: Record<Tab, number> = {
    Universities: data.saved.length,
    Scholarships: s.savedScholarships.length,
    Comparisons: data.comparisons.length,
    Searches: data.searches.length,
    Checklist: data.checklist.filter((t) => !t.done).length,
    Lists: data.lists.length,
  };
  const taskForm = (
    <form className="db-task-form" onSubmit={addTask}>
      <input
        id="db-task"
        aria-label="New application task"
        placeholder="Add a task, e.g. request transcript"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        maxLength={300}
        required
        disabled={taskBusy}
      />
      <input
        type="date"
        aria-label="Task due date (optional)"
        value={taskDue}
        onChange={(e) => setTaskDue(e.target.value)}
        disabled={taskBusy}
      />
      <button
        className="db-btn db-btn-primary"
        disabled={taskBusy || !task.trim()}
        aria-label="Add task"
      >
        <Plus size={17} />
      </button>
    </form>
  );

  return (
    <div className="db">
      <header className="db-head">
        <div>
          <span className="db-date">
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(new Date())}
          </span>
          <h1>
            {dashboard
              ? `${greeting}${firstName ? ", " + firstName : ""}.`
              : "Your shortlist"}
          </h1>
          <p>
            {priorityTasks.length
              ? `${priorityTasks.length} open ${priorityTasks.length === 1 ? "task" : "tasks"}${overdue ? `, ${overdue} overdue` : ""}. `
              : "No open tasks. "}
            {next
              ? `Next date: ${next.name}, ${dueLabel(next.date, today).toLowerCase()}.`
              : "Add a dated task or save a university to build your timeline."}
          </p>
        </div>
        <div className="db-head-actions">
          <Link className="db-btn db-btn-quiet" href="/profile">
            <Settings size={16} /> Profile
          </Link>
          {s.profile?.role === "admin" && (
            <Link className="db-btn db-btn-quiet" href={STAFF_PATH}>
              <ShieldCheck size={16} /> Admin
            </Link>
          )}
          <Link className="db-btn db-btn-primary" href="/universities">
            <Search size={16} /> Find universities
          </Link>
        </div>
      </header>

      {loading && (
        <p className="db-status" role="status">
          Updating your dashboard…
        </p>
      )}
      {error && (
        <div className="db-error" role="alert">
          {error}
          <button className="db-link" onClick={reload}>
            Retry
          </button>
        </div>
      )}

      {dashboard && setupDone < setup.length && (
        <section className="db-card db-setup" aria-label="Get started">
          <div className="db-setup-intro">
            <h2>Get your plan started</h2>
            <p>
              {setupDone} of {setup.length} done
            </p>
            <div
              className="db-bar"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={0}
              aria-valuemax={setup.length}
              aria-valuenow={setupDone}
            >
              <span style={{ width: `${(setupDone / setup.length) * 100}%` }} />
            </div>
          </div>
          <ol>
            {setup.map((step) => {
              const inner = (
                <>
                  <span className="db-setup-check">
                    {step.done ? <Check size={14} /> : null}
                  </span>
                  {step.label}
                  {!step.done && <ArrowRight size={14} />}
                </>
              );
              return (
                <li key={step.label} className={step.done ? "is-done" : ""}>
                  {step.done ? (
                    <span>{inner}</span>
                  ) : step.href ? (
                    <Link href={step.href}>{inner}</Link>
                  ) : (
                    <button onClick={step.action}>{inner}</button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {dashboard && (
        <div className="db-grid">
          <section className="db-card db-tasks" aria-labelledby="db-tasks-title">
            <header className="db-card-head">
              <h2 id="db-tasks-title">
                <ListChecks size={18} />
                {focusDay ? `Tasks on ${shortDate(focusDay)}` : "Next steps"}
              </h2>
              <span className="db-muted">
                {completed}/{data.checklist.length} done
              </span>
            </header>
            <div
              className="db-bar"
              role="progressbar"
              aria-label="Checklist progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <ul className="db-task-list">
              {focusedTasks.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Checkbox
                    aria-label={"Complete " + t.title}
                    checked={t.done}
                    onCheckedChange={(v) => void setDone(t.id, !!v)}
                  />
                  <span className="db-task-title">{t.title}</span>
                  {validPlanDate(t.due_at) && (
                    <small
                      className={
                        "db-due" + (t.due_at < today ? " is-overdue" : "")
                      }
                    >
                      {dueLabel(t.due_at, today)}
                    </small>
                  )}
                </li>
              ))}
              {!focusedTasks.length && (
                <li className="db-empty-line">
                  <CheckCircle2 size={17} />
                  {focusDay
                    ? "Nothing scheduled for this day."
                    : data.checklist.length
                      ? "All tasks complete. Nice work."
                      : "Add your first task below."}
                </li>
              )}
            </ul>
            {taskForm}
            <div className="db-card-foot">
              {focusDay && (
                <button className="db-link" onClick={() => setFocusDay("")}>
                  <X size={14} /> Clear day filter
                </button>
              )}
              <button className="db-link" onClick={() => openTab("Checklist")}>
                All tasks <ArrowRight size={14} />
              </button>
            </div>
          </section>

          <section className="db-card db-week" aria-labelledby="db-week-title">
            <header className="db-card-head">
              <h2 id="db-week-title">
                <CalendarDays size={18} />
                {week.length
                  ? new Intl.DateTimeFormat("en", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(week[3]))
                  : "This week"}
              </h2>
              <div className="db-week-nav">
                <button
                  aria-label="Previous week"
                  onClick={() => setWeekOffset((v) => v - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => {
                    setWeekOffset(0);
                    setFocusDay("");
                  }}
                >
                  Today
                </button>
                <button
                  aria-label="Next week"
                  onClick={() => setWeekOffset((v) => v + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </header>
            <div className="db-days">
              {week.map((day) => {
                const n = marked.filter((d) => d === day).length;
                return (
                  <button
                    key={day}
                    aria-pressed={focusDay === day}
                    className={day === today ? "is-today" : ""}
                    onClick={() => setFocusDay(focusDay === day ? "" : day)}
                    aria-label={`${day}, ${n} scheduled ${n === 1 ? "item" : "items"}`}
                  >
                    <span>
                      {new Intl.DateTimeFormat("en", {
                        weekday: "narrow",
                        timeZone: "UTC",
                      }).format(new Date(day))}
                    </span>
                    <strong>{Number(day.slice(-2))}</strong>
                    <i className={n ? "has-items" : ""} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <ul className="db-dates">
              {upcoming
                .filter((item) => !focusDay || item.date === focusDay)
                .slice(0, 4)
                .map((item) => (
                  <li key={item.id}>
                    <Link href={item.href}>
                      <time dateTime={item.date}>
                        <small>{shortDate(item.date).split(" ")[0]}</small>
                        {Number(item.date.slice(-2))}
                      </time>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.label} · {dueLabel(item.date, today)}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              {!upcoming.some(
                (item) => !focusDay || item.date === focusDay,
              ) && (
                <li className="db-empty-line">
                  <Clock3 size={17} />
                  {focusDay
                    ? "No dates on this day."
                    : "Upcoming deadlines from saved universities, awards and tasks appear here."}
                </li>
              )}
            </ul>
          </section>

          <section
            className="db-card db-pipeline"
            aria-labelledby="db-pipeline-title"
          >
            <header className="db-card-head">
              <h2 id="db-pipeline-title">
                <GraduationCap size={18} /> Application pipeline
              </h2>
              <button className="db-link" onClick={() => openTab("Universities")}>
                Manage <ArrowRight size={14} />
              </button>
            </header>
            {data.saved.length ? (
              <div className="db-stages">
                {pipeline.map((stage) => {
                  const rows = data.saved.filter((v) =>
                    stage.match.includes(v.status),
                  );
                  return (
                    <div key={stage.label} className="db-stage">
                      <span className="db-stage-label">
                        {stage.label}
                        <b>{rows.length}</b>
                      </span>
                      {rows.slice(0, 3).map((v) => {
                        const u = universityOf(v.university_id);
                        return u ? (
                          <Link key={v.id} href={"/university/" + u.slug}>
                            <UniversityLogo university={u} size="sm" />
                            <span>{u.name}</span>
                          </Link>
                        ) : null;
                      })}
                      {rows.length > 3 && (
                        <small className="db-muted">+{rows.length - 3} more</small>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="db-empty">
                <BookmarkPlus size={22} />
                <p>
                  Save universities to track each one from research to
                  decision.
                </p>
                <Link className="db-btn db-btn-quiet" href="/universities">
                  Explore universities
                </Link>
              </div>
            )}
          </section>

          <section className="db-card db-recent" aria-labelledby="db-recent-title">
            <header className="db-card-head">
              <h2 id="db-recent-title">
                <HistoryIcon size={18} /> Pick up where you left off
              </h2>
            </header>
            {recent.length ? (
              <ul>
                {recent.map((u) => (
                  <li key={u.id}>
                    <Link href={"/university/" + u.slug}>
                      <UniversityLogo university={u} size="sm" />
                      <span>
                        <strong>{u.name}</strong>
                        <small>{u.city}</small>
                      </span>
                      <ArrowRight size={15} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="db-empty">
                <Scale size={22} />
                <p>Universities you open appear here so you can return quickly.</p>
              </div>
            )}
          </section>
        </div>
      )}

      <section className="db-library" ref={library} aria-label="Your saved research">
        <nav className="db-tabs" aria-label="Saved research">
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              aria-pressed={tab === name}
              onClick={() => setTab(name)}
            >
              <Icon size={16} />
              {name === "Checklist" ? "Tasks" : name}
              <b>{counts[name]}</b>
            </button>
          ))}
        </nav>

        {tab === "Universities" && (
          <>
            {data.lists.length > 0 && (
              <div className="db-toolbar">
                <Choice
                  label="Research list"
                  value={list}
                  onChange={setList}
                  options={[
                    { value: "all", label: "All universities" },
                    ...data.lists.map((l) => ({ value: l.id, label: l.name })),
                  ]}
                />
              </div>
            )}
            <div className="db-rows">
              {shown.map((saved) => {
                const u = universityOf(saved.university_id);
                if (!u) return null;
                const note =
                  data.notes.find((n) => n.university_id === u.id)?.body || "";
                return (
                  <article
                    className="db-row db-uni"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", u.id)}
                    key={saved.id}
                  >
                    <div className="db-uni-main">
                      <UniversityLogo university={u} />
                      <div>
                        <Link href={"/university/" + u.slug}>
                          <h3>{u.name}</h3>
                        </Link>
                        <p>{u.city}</p>
                      </div>
                      <Choice
                        label={"Application status for " + u.name}
                        value={saved.status}
                        onChange={(v) =>
                          void write(
                            "saved_universities",
                            { university_id: u.id, status: v },
                            "user_id,university_id",
                          )
                        }
                        options={statuses}
                      />
                    </div>
                    <textarea
                      key={note || u.id}
                      defaultValue={note}
                      aria-label={"Notes for " + u.name}
                      placeholder="Private notes: what matters, what to check next…"
                      onBlur={(e) => {
                        const body = e.target.value;
                        if (body !== note)
                          void write(
                            "user_notes",
                            { university_id: u.id, body },
                            "user_id,university_id",
                          );
                      }}
                    />
                    <div className="db-uni-meta">
                      <label>
                        Target date
                        <input
                          type="date"
                          defaultValue={saved.deadline || ""}
                          onBlur={(e) =>
                            void write(
                              "saved_universities",
                              {
                                university_id: u.id,
                                status: saved.status,
                                deadline: e.target.value || null,
                              },
                              "user_id,university_id",
                            )
                          }
                        />
                      </label>
                      {data.lists.length > 0 && (
                        <Choice
                          label={"List for " + u.name}
                          value="none"
                          onChange={(v) =>
                            void write(
                              "user_list_items",
                              {
                                list_id: v,
                                university_id: u.id,
                                position: data.items.filter(
                                  (i) => i.list_id === v,
                                ).length,
                              },
                              "list_id,university_id",
                            )
                          }
                          options={[
                            { value: "none", label: "Add to a list" },
                            ...data.lists.map((l) => ({
                              value: l.id,
                              label: l.name,
                            })),
                          ]}
                        />
                      )}
                      <button
                        className="db-link db-danger"
                        onClick={() => s.toggleSaved(u.id)}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {!shown.length && (
              <LibraryEmpty
                title="Your shortlist is empty."
                text="Save a university from the explorer, then track its status, notes and target date here."
                href="/universities"
                action="Explore universities"
              />
            )}
          </>
        )}

        {tab === "Scholarships" &&
          (s.savedScholarships.length ? (
            <div className="db-rows">
              {s.scholarships
                .filter((a) => s.savedScholarships.includes(a.id))
                .map((a) => (
                  <div className="db-row db-line" key={a.id}>
                    <div>
                      <h3>{a.name}</h3>
                      <p>
                        {a.deadline
                          ? "Closes " + shortDate(a.deadline)
                          : "Deadline not published"}
                      </p>
                    </div>
                    <Link
                      className="db-link"
                      href={a.slug ? "/scholarships/" + a.slug : "/scholarships"}
                    >
                      Review award <ArrowRight size={14} />
                    </Link>
                  </div>
                ))}
            </div>
          ) : (
            <LibraryEmpty
              title="No saved scholarships yet."
              text="Save a sourced award and its deadline joins your calendar."
              href="/scholarships"
              action="Explore scholarships"
            />
          ))}

        {tab === "Comparisons" &&
          (data.comparisons.length ? (
            <div className="db-rows">
              {data.comparisons.map((c) => (
                <div className="db-row db-line" key={c.id}>
                  <div>
                    <h3>{c.name}</h3>
                    <p>{c.university_ids.length} universities</p>
                  </div>
                  <Link
                    className="db-link"
                    href={"/compare?ids=" + c.university_ids.join(",")}
                  >
                    Open <ArrowRight size={14} />
                  </Link>
                  <button
                    className="db-icon-btn"
                    aria-label={"Remove " + c.name}
                    onClick={() => remove("comparison_lists", c.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <LibraryEmpty
              title="No saved comparisons."
              text="Build a comparison, then choose Save comparison to return to it here."
              href="/compare"
              action="Start comparing"
            />
          ))}

        {tab === "Searches" &&
          (data.searches.length ? (
            <div className="db-rows">
              {data.searches.map((v) => (
                <div className="db-row db-line" key={v.id}>
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
                    className="db-link"
                    href={
                      "/universities?" +
                      new URLSearchParams(
                        Object.entries(v.filters).map(([k, v]) => [k, String(v)]),
                      ).toString()
                    }
                  >
                    Run search <ArrowRight size={14} />
                  </Link>
                  <button
                    className="db-icon-btn"
                    aria-label={"Remove " + v.name}
                    onClick={() => remove("saved_searches", v.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <LibraryEmpty
              title="No saved searches."
              text="Choose Save search in the explorer to rerun your filters with one click."
              href="/universities"
              action="Open the explorer"
            />
          ))}

        {tab === "Checklist" && (
          <div className="db-rows">
            {taskForm}
            {data.checklist.map((t) => (
              <div className={"db-row db-line" + (t.done ? " is-done" : "")} key={t.id}>
                <Checkbox
                  aria-label={"Complete " + t.title}
                  checked={t.done}
                  onCheckedChange={(v) => void setDone(t.id, !!v)}
                />
                <div>
                  <h3>{t.title}</h3>
                  {validPlanDate(t.due_at) && (
                    <p
                      className={
                        !t.done && t.due_at < today ? "is-overdue" : undefined
                      }
                    >
                      {t.done ? "Completed" : dueLabel(t.due_at, today)}
                    </p>
                  )}
                </div>
                <input
                  className="db-date-input"
                  type="date"
                  aria-label={"Due date for " + t.title}
                  defaultValue={t.due_at || ""}
                  key={t.id + (t.due_at || "")}
                  onChange={async (e) => {
                    const { error } = await getSupabase()!
                      .from("user_checklist")
                      .update({ due_at: e.target.value || null })
                      .eq("id", t.id)
                      .eq("user_id", s.user!.id);
                    if (error) toast.error("Could not save date");
                    else await reload();
                  }}
                />
                <button
                  className="db-icon-btn"
                  aria-label={"Remove " + t.title}
                  onClick={() => remove("user_checklist", t.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {!data.checklist.length && (
              <p className="db-empty-line">
                <ListChecks size={17} /> Tasks you add appear here and on your
                calendar.
              </p>
            )}
          </div>
        )}

        {tab === "Lists" && (
          <div className="db-rows">
            <form
              className="db-task-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (listName.trim()) {
                  void write("user_lists", { name: listName.trim() });
                  setListName("");
                }
              }}
            >
              <input
                placeholder="New list: Dream, Affordable, Europe…"
                aria-label="New list name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                maxLength={100}
              />
              <button className="db-btn db-btn-primary" disabled={!listName.trim()}>
                Create list
              </button>
            </form>
            <div className="db-list-grid">
              {data.lists.map((l) => {
                const items = data.items
                  .filter((i) => i.list_id === l.id)
                  .sort((a, b) => a.position - b.position);
                return (
                  <section
                    className="db-card db-list"
                    key={l.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      if (data.saved.some((v) => v.university_id === id))
                        void write(
                          "user_list_items",
                          {
                            list_id: l.id,
                            university_id: id,
                            position: items.length,
                          },
                          "list_id,university_id",
                        );
                    }}
                  >
                    <header className="db-card-head">
                      <h2>
                        <FolderOpen size={17} /> {l.name}
                      </h2>
                      <button
                        className="db-icon-btn"
                        aria-label={"Delete list " + l.name}
                        onClick={() => remove("user_lists", l.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </header>
                    <ul>
                      {items.map((item) => (
                        <li key={item.id}>
                          {universityOf(item.university_id)?.name || "University"}
                          <button
                            className="db-icon-btn"
                            aria-label="Remove university from list"
                            onClick={() => remove("user_list_items", item.id)}
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {!items.length && (
                      <p className="db-muted">
                        Use “Add to a list” on a saved university, or drag one
                        here.
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function LibraryEmpty({
  title,
  text,
  href,
  action,
}: {
  title: string;
  text: string;
  href: string;
  action: string;
}) {
  return (
    <div className="db-empty db-empty-lg">
      <Search size={24} />
      <h3>{title}</h3>
      <p>{text}</p>
      <Link className="db-btn db-btn-primary" href={href}>
        {action} <ArrowRight size={16} />
      </Link>
    </div>
  );
}

function DashboardGate() {
  return (
    <div className="db db-gate">
      <div className="db-gate-copy">
        <span className="db-date">Your personal dashboard</span>
        <h1>Every deadline, shortlist and note in one calm place.</h1>
        <p>
          Track each university from research to decision, plan dated tasks and
          see what to do next. Free, and private to your account.
        </p>
        <div className="db-head-actions">
          <Link className="db-btn db-btn-primary" href="/auth/sign-up?next=/dashboard">
            Create a free account <ArrowRight size={17} />
          </Link>
          <Link className="db-btn db-btn-quiet" href="/auth/sign-in?next=/dashboard">
            Sign in
          </Link>
        </div>
      </div>
      <div className="db-gate-preview" aria-hidden="true">
        <div className="db-card">
          <header className="db-card-head">
            <h2>
              <ListChecks size={18} /> Next steps
            </h2>
            <span className="db-muted">1/3 done</span>
          </header>
          <div className="db-bar">
            <span style={{ width: "33%" }} />
          </div>
          <ul className="db-task-list">
            {[
              ["Request transcript", "Done", false, true],
              ["Draft personal statement", "In 6 days", false, false],
              ["Book language test", "2 days overdue", true, false],
            ].map(([t, d, late, done]) => (
              <li key={String(t)} className={done ? "is-done" : ""}>
                <span className="db-fake-check">
                  {done && <Check size={12} />}
                </span>
                <span className="db-task-title">{t}</span>
                <small className={"db-due" + (late ? " is-overdue" : "")}>{d}</small>
              </li>
            ))}
          </ul>
        </div>
        <div className="db-card db-gate-stages">
          {[
            ["Researching", 4],
            ["Applying", 2],
            ["Submitted", 1],
          ].map(([label, n]) => (
            <span key={String(label)}>
              {label}
              <b>{n}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
