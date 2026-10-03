/* eslint-disable @next/next/no-img-element -- Local, pre-sized WebP artwork. */
"use client";
import { filterLabel } from "@/lib/filter-labels";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  LayoutDashboard,
  GraduationCap,
  Sparkles,
  Columns2,
  Search,
  ListChecks,
  FolderOpen,
  Settings,
  ArrowRight,
  CalendarDays,
  Plus,
  ShieldCheck,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { deadlineDate } from "@/lib/application-dates";
import { useCollege } from "@/components/college/provider";
import {
  EmptyState,
  Choice,
  UniversityLogo,
} from "@/components/college/primitives";
import { University } from "@/lib/domain";
import { getSupabase } from "@/lib/supabase/client";
import { universitiesByIds } from "@/lib/supabase/catalogue";
import { loadWorkspace, emptyWorkspace, Workspace } from "@/services/workspace";
import { STAFF_PATH } from "@/lib/staff-route";
import { PlannerWeek } from "@/components/college/planner-week";
import {
  dueLabel,
  prioritizeTasks,
  validPlanDate,
  localPlanDate,
} from "@/lib/workspace-planner";
export default function WorkspacePage() {
  const s = useCollege(),
    dashboard = usePathname() === "/dashboard";
  const [storedData, setData] = useState<Workspace>(emptyWorkspace),
    [storedUniversities, setUniversities] = useState<University[]>([]),
    [owner, setOwner] = useState<string | undefined>(),
    [loading, setLoading] = useState(false),
    [tab, setTab] = useState("Universities"),
    [list, setList] = useState("all"),
    [listName, setListName] = useState(""),
    [task, setTask] = useState(""),
    [taskDue, setTaskDue] = useState(""),
    [taskBusy, setTaskBusy] = useState(false),
    [error, setError] = useState(""),
    [focusDay, setFocusDay] = useState("");
  const userId = s.user?.id;
  const revision = useRef(0);
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
  if (!s.authReady)
    return (
      <div className="research-page">
        <p role="status">Opening your workspace…</p>
      </div>
    );
  if (!s.user)
    return (
      <div className="workspace-gate">
        <div>
          <span className="section-caption">Your personal dashboard</span>
          <h1>
            Your future.
            <br />A plan of your own.
          </h1>
          <p>
            Keep your shortlist, application steps and deadlines in one place.
            Sign in to pick up where you left off.
          </p>
          <div className="gate-actions">
            <Link
              className="button button-primary"
              href="/auth/sign-in?next=/dashboard"
            >
              Sign in <ArrowRight size={17} />
            </Link>
            <Link href="/auth/sign-up?next=/dashboard">Create an account</Link>
          </div>
        </div>
        <img
          src="/images/study-planner.webp"
          alt="A blue planner and compass for your university journey"
          width="1200"
          height="675"
        />
      </div>
    );
  const today = localPlanDate();
  const upcoming = [
    ...data.saved.flatMap((v) =>
      v.deadline
        ? [
            {
              id: v.id,
              label: "Your application target",
              name:
                universities.find((u) => u.id === v.university_id)?.name ||
                "Saved university",
              date: v.deadline,
              href: universities.find((u) => u.id === v.university_id)
                ? "/university/" +
                  universities.find((u) => u.id === v.university_id)!.slug
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
  return (
    <div className="student-workspace">
      <aside className="student-sidebar" aria-label="Your workspace">
        <span className="section-caption">Your workspace</span>
        {[
          ["Universities", GraduationCap],
          ["Scholarships", Sparkles],
          ["Comparisons", Columns2],
          ["Searches", Search],
          ["Checklist", ListChecks],
          ["Lists", FolderOpen],
        ].map(([name, I]) => {
          const Icon = I as typeof LayoutDashboard;
          return (
            <button
              key={String(name)}
              className={tab === name ? "active" : ""}
              aria-pressed={tab === name}
              onClick={() => setTab(String(name))}
            >
              <Icon size={17} />
              {String(name)}
            </button>
          );
        })}
        <Link href="/universities">
          <Search size={17} />
          Explore universities
        </Link>
        <Link className="sidebar-settings" href="/profile">
          <Settings size={17} />
          My profile
        </Link>
        {s.profile?.role === "admin" && (
          <Link className="workspace-admin-link" href={STAFF_PATH}>
            <ShieldCheck size={17} /> Admin console
          </Link>
        )}
      </aside>
      <div className="student-content">
        <header className="page-intro workspace-intro">
          <div>
            <div className="section-caption">Let’s make progress</div>
            <h1>
              {dashboard
                ? `Hello, ${s.profile?.display_name?.split(" ")[0] || "you"}.`
                : "Your shortlist."}
            </h1>
            <p>
              Your saved options and application plan. Choose one next step and
              keep moving.
            </p>
          </div>
          <Link className="button button-secondary" href="/universities">
            <Plus size={16} /> Find a university
          </Link>
        </header>
        {loading && (
          <p className="workspace-loading" role="status">
            Updating your workspace…
          </p>
        )}
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={reload}>Retry</button>
          </div>
        )}
        <div className="stats-row">
          {[
            ["Saved universities", data.saved.length],
            ["Saved scholarships", s.savedScholarships.length],
            ["Open tasks", data.checklist.filter((t) => !t.done).length],
            ["Research lists", data.lists.length],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        {dashboard && (
          <PlannerWeek
            today={today}
            dates={[
              ...upcoming.map((v) => v.date),
              ...priorityTasks
                .filter((t) => validPlanDate(t.due_at) && t.due_at < today)
                .map((t) => t.due_at!),
            ]}
            selected={focusDay}
            onSelect={setFocusDay}
          />
        )}
        {dashboard && (
          <section className="student-summary">
            <div className="planner-progress">
              <div className="planner-heading">
                <span>
                  <ListChecks size={18} />{" "}
                  {focusDay ? "Scheduled tasks" : "Your next steps"}
                </span>
                <strong>{progress}%</strong>
              </div>
              <p>
                {completed} of {data.checklist.length} tasks completed
                {overdue > 0 && (
                  <span className="planner-overdue"> · {overdue} overdue</span>
                )}
              </p>
              <div
                className="student-progress-track"
                role="progressbar"
                aria-label="Application checklist progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <span
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>
              <div className="planner-priorities">
                {focusDay && (
                  <button className="text-link" onClick={() => setFocusDay("")}>
                    Show all upcoming tasks
                  </button>
                )}
                {focusedTasks.slice(0, 4).map((t) => (
                  <div key={t.id}>
                    <Checkbox
                      aria-label={"Complete " + t.title}
                      checked={t.done}
                      onCheckedChange={async (v) => {
                        const { error } = await getSupabase()!
                          .from("user_checklist")
                          .update({ done: !!v })
                          .eq("id", t.id)
                          .eq("user_id", s.user!.id);
                        if (error) toast.error("Could not update task");
                        else await reload();
                      }}
                    />
                    <span>
                      {t.title}
                      {validPlanDate(t.due_at) && (
                        <small
                          className={
                            t.due_at < today ? "planner-overdue" : undefined
                          }
                        >
                          {dueLabel(t.due_at, today)}
                        </small>
                      )}
                    </span>
                  </div>
                ))}
                {!focusedTasks.length && (
                  <p>
                    <CheckCircle2 size={17} />{" "}
                    {focusDay
                      ? "No open tasks scheduled for this day."
                      : data.checklist.length
                        ? "All tasks complete. Ready for the next step?"
                        : "Add a task to start your application plan."}
                  </p>
                )}
              </div>
              <form className="planner-add-task" onSubmit={addTask}>
                <input
                  aria-label="Next application task"
                  placeholder="What needs to happen next?"
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
                  className="button button-primary"
                  disabled={taskBusy || !task.trim()}
                >
                  <Plus size={16} /> Add
                </button>
              </form>
              <button className="text-link" onClick={() => setTab("Checklist")}>
                Open all tasks <ArrowRight size={14} />
              </button>
            </div>
            <div className="planner-calendar">
              <h2>
                <CalendarDays size={18} /> Upcoming dates
              </h2>
              {upcoming
                .filter((item) => !focusDay || item.date === focusDay)
                .slice(0, 4)
                .map((item) => (
                  <Link key={item.id} href={item.href}>
                    <span className="planner-date">
                      <time dateTime={item.date}>
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(item.date))}
                      </time>
                    </span>
                    <span>
                      {item.name}
                      <small>
                        {item.label} · {dueLabel(item.date, today)}
                      </small>
                    </span>
                    <ArrowRight size={14} />
                  </Link>
                ))}
              {!upcoming.some(
                (item) => !focusDay || item.date === focusDay,
              ) && (
                <p>
                  Save a university or award, or add a dated checklist item to
                  start your plan.
                </p>
              )}
              <Link className="text-link" href="/scholarships">
                Explore funding
                <ArrowRight size={15} />
              </Link>
            </div>
          </section>
        )}
        <nav className="workspace-tabs">
          {[
            "Universities",
            "Scholarships",
            "Comparisons",
            "Searches",
            "Checklist",
            "Lists",
          ].map((v) => (
            <button
              className={tab === v ? "active" : ""}
              aria-pressed={tab === v}
              key={v}
              onClick={() => setTab(v)}
            >
              {v}
            </button>
          ))}
        </nav>
        {tab === "Universities" && (
          <>
            <div className="control-row">
              <Choice
                label="Research list"
                value={list}
                onChange={setList}
                options={[
                  { value: "all", label: "All universities" },
                  ...data.lists.map((l) => ({ value: l.id, label: l.name })),
                ]}
              />
              <Link href="/universities" className="text-link">
                Add universities →
              </Link>
            </div>
            {shown.map((saved) => {
              const u = universities.find((u) => u.id === saved.university_id);
              if (!u) return null;
              return (
                <article
                  className="workspace-row"
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", u.id)
                  }
                  key={saved.id}
                >
                  <UniversityLogo university={u} />
                  <div>
                    <Link href={"/university/" + u.slug}>
                      <h3>{u.name}</h3>
                    </Link>
                    <p>{u.city} · Private notes</p>
                    <textarea
                      key={
                        data.notes.find((n) => n.university_id === u.id)
                          ?.body || u.id
                      }
                      defaultValue={
                        data.notes.find((n) => n.university_id === u.id)
                          ?.body || ""
                      }
                      aria-label={"Notes for " + u.name}
                      placeholder="What matters? What do you still need to check?"
                      onBlur={(e) => {
                        const body = e.target.value;
                        if (
                          body !==
                          (data.notes.find((n) => n.university_id === u.id)
                            ?.body || "")
                        )
                          void write(
                            "user_notes",
                            { university_id: u.id, body },
                            "user_id,university_id",
                          );
                      }}
                    />
                    <div className="control-row" style={{ marginTop: 10 }}>
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
                      <label className="caption">
                        Deadline{" "}
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
                    </div>
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
                    options={[
                      "Researching",
                      "Considering",
                      "Applying",
                      "Submitted",
                      "Accepted",
                      "Rejected",
                      "Waitlisted",
                    ]}
                  />
                  <button
                    className="text-link"
                    onClick={() => s.toggleSaved(u.id)}
                  >
                    Remove
                  </button>
                </article>
              );
            })}
            {!shown.length && (
              <EmptyState
                title="Your shortlist starts with a question."
                description="Save a university from the explorer, then add your notes, application status, and next steps."
                action={
                  <Link className="button button-primary" href="/universities">
                    Explore universities
                  </Link>
                }
              />
            )}
          </>
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
                  <Link className="button button-primary" href="/scholarships">
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
                      Object.entries(v.filters).map(([k, v]) => [k, String(v)]),
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
        {tab === "Checklist" && (
          <section className="panel">
            <h2>
              <ListChecks size={19} /> Application checklist
            </h2>
            <form className="assistant-form" onSubmit={addTask}>
              <input
                aria-label="New checklist task"
                placeholder="Request transcript, check funding deadline…"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                maxLength={300}
                required
                disabled={taskBusy}
              />
              <input
                type="date"
                aria-label="New task due date (optional)"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                disabled={taskBusy}
              />
              <button
                className="button button-primary"
                disabled={taskBusy || !task.trim()}
              >
                <Plus size={16} /> Add task
              </button>
            </form>
            {data.checklist.map((t) => (
              <div className="workspace-row" key={t.id}>
                <Checkbox
                  aria-label={"Complete " + t.title}
                  checked={t.done}
                  onCheckedChange={(v) => {
                    const db = getSupabase();
                    void db
                      ?.from("user_checklist")
                      .update({ done: !!v })
                      .eq("id", t.id)
                      .then(async ({ error }) => {
                        if (error) toast.error("Could not update task");
                        else await reload();
                      });
                  }}
                />
                <div
                  className="task-description"
                  style={{ textDecoration: t.done ? "line-through" : "" }}
                >
                  {t.title}
                  {validPlanDate(t.due_at) && (
                    <small
                      className={
                        !t.done && t.due_at < today
                          ? "planner-overdue"
                          : undefined
                      }
                    >
                      <Clock3 size={12} />{" "}
                      {t.done ? "Completed" : dueLabel(t.due_at, today)}
                    </small>
                  )}
                </div>
                <input
                  className="task-due-input"
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
                <button onClick={() => remove("user_checklist", t.id)}>
                  Remove
                </button>
              </div>
            ))}
          </section>
        )}
        {tab === "Lists" && (
          <>
            <form
              className="assistant-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (listName.trim()) {
                  void write("user_lists", { name: listName.trim() });
                  setListName("");
                }
              }}
            >
              <input
                placeholder="Dream, Affordable, Europe, Application shortlist…"
                aria-label="New list name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                maxLength={100}
              />
              <button className="button button-primary">Create list</button>
            </form>
            <div className="resource-grid">
              {data.lists.map((l) => (
                <section
                  className="panel"
                  key={l.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    if (data.saved.some((s) => s.university_id === id))
                      void write(
                        "user_list_items",
                        {
                          list_id: l.id,
                          university_id: id,
                          position: data.items.filter((i) => i.list_id === l.id)
                            .length,
                        },
                        "list_id,university_id",
                      );
                  }}
                >
                  <h2>{l.name}</h2>
                  <p className="caption">
                    {data.items.filter((i) => i.list_id === l.id).length}{" "}
                    universities · Use “Add to a list” on a saved university, or
                    drag one here.
                  </p>
                  {data.items
                    .filter((i) => i.list_id === l.id)
                    .sort((a, b) => a.position - b.position)
                    .map((item) => (
                      <div className="workspace-row" key={item.id}>
                        <div>
                          {universities.find((u) => u.id === item.university_id)
                            ?.name || "University"}
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
                    onClick={() => remove("user_lists", l.id)}
                  >
                    Delete list
                  </button>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
