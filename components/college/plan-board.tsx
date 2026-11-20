"use client";
/* Plan (Nov 19): a quiet task planner. Tasks group by when they are due, the AI can be asked to
 * plan (opens the assistant with the prompt filled in) and it adds, re-dates and completes tasks
 * through confirm cards that write to the same `user_checklist` store this page reads. */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { validPlanDate } from "@/lib/workspace-planner";
import { aiTaskIds } from "@/lib/plan-source";
import type { University } from "@/lib/domain";
import type { ChecklistItem } from "@/services/workspace";
import type { OverviewDate } from "./workspace-oneprep-overview";
import { Page, PageHeader } from "./dash-ui";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { UniversityLogo } from "./primitives";
import { AIMark } from "./ai-mark";
import { PlanCalendar } from "./plan-calendar";
import "./plan-board.css";

type GroupId = "overdue" | "week" | "month" | "later";
const GROUPS: { id: GroupId; key: "pl.g.overdue" | "pl.g.week" | "pl.g.month" | "pl.g.later" }[] = [
  { id: "overdue", key: "pl.g.overdue" },
  { id: "week", key: "pl.g.week" },
  { id: "month", key: "pl.g.month" },
  { id: "later", key: "pl.g.later" },
];

const utc = (day: string) => new Date(day + "T00:00:00Z");
const daysBetween = (a: string, b: string) => Math.round((+utc(b) - +utc(a)) / 86400000);

/** Overdue, then this week (to Sunday), this month, later (and undated). */
export function groupOf(due: string | null, today: string): GroupId {
  if (!validPlanDate(due)) return "later";
  if (due < today) return "overdue";
  const dow = (utc(today).getUTCDay() + 6) % 7;
  if (daysBetween(today, due) <= 6 - dow) return "week";
  return due.slice(0, 7) === today.slice(0, 7) ? "month" : "later";
}

export function PlanBoard({
  tasks,
  deadlines,
  today,
  universities,
  onCreate,
  onUpdate,
  onDelete,
}: {
  tasks: ChecklistItem[];
  deadlines: OverviewDate[];
  today: string;
  universities: Map<string, University>;
  onCreate: (title: string, due: string | null) => void;
  onUpdate: (id: string, payload: { title?: string; due_at?: string | null; done?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const s = useCollege();
  const view = "calendar" as "list" | "calendar";
  const [showDone, setShowDone] = useState(false);
  // Ids ticked in this session: they show as done at once and fold away while the save lands.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [ai, setAi] = useState<Set<string>>(new Set());
  useEffect(() => setAi(aiTaskIds(s.user?.id)), [s.user?.id, tasks.length]);

  const open = tasks.filter((x) => !x.done);
  const done = tasks.filter((x) => x.done);
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const grouped = useMemo(() => {
    const by: Record<GroupId, ChecklistItem[]> = { overdue: [], week: [], month: [], later: [] };
    for (const x of open) by[groupOf(x.due_at, today)].push(x);
    for (const g of Object.values(by))
      g.sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999") || a.title.localeCompare(b.title));
    return by;
  }, [open, today]);

  const toggle = (x: ChecklistItem, value: boolean) => {
    setTicked((cur) => {
      const next = new Set(cur);
      if (value) next.add(x.id);
      else next.delete(x.id);
      return next;
    });
    onUpdate(x.id, { done: value });
  };

  const row = (x: ChecklistItem) => (
    <TaskRow
      key={x.id}
      task={x}
      today={today}
      lang={lang}
      university={x.university_id ? universities.get(x.university_id) : undefined}
      byAI={ai.has(x.id)}
      leaving={ticked.has(x.id) && !x.done}
      onToggle={(v) => toggle(x, v)}
      onRename={(title) => onUpdate(x.id, { title })}
      onDate={(due) => onUpdate(x.id, { due_at: due })}
      onDelete={() => onDelete(x.id)}
    />
  );

  return (
    <Page className="pl">
      <PageHeader
        title={t("dash.plan")}
        description={t("pl.sub")}
      />
      <div className="pl-progress">
        <span className="pl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("pl.progress", { done: done.length, total: tasks.length })}>
          <i style={{ width: pct + "%" }} />
        </span>
        <span className="pl-count">{tasks.length ? t("pl.progress", { done: done.length, total: tasks.length }) : t("pl.progress.none")}</span>
      </div>
      {view === "calendar" ? (
        <PlanCalendar
          embedded
          tasks={tasks}
          deadlines={deadlines}
          today={today}
          onCreate={(title, due) => onCreate(title, due)}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ) : (
        <>
          <div className="pl-progress">
            <span className="pl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("pl.progress", { done: done.length, total: tasks.length })}>
              <i style={{ width: pct + "%" }} />
            </span>
            <span className="pl-count">{tasks.length ? t("pl.progress", { done: done.length, total: tasks.length }) : t("pl.progress.none")}</span>
          </div>
          {tasks.length === 0 && <Empty />}
          {GROUPS.map(
            (g) =>
              grouped[g.id].length > 0 && (
                <section key={g.id} className={cn("pl-group", g.id === "overdue" && "is-overdue")} aria-label={t(g.key)}>
                  <h2>
                    {t(g.key)} <span>{grouped[g.id].length}</span>
                  </h2>
                  <ul>{grouped[g.id].map(row)}</ul>
                </section>
              ),
          )}
          {tasks.length > 0 && open.length === 0 && <p className="pl-clear">{t("pl.clear")}</p>}
          <AddRow onAdd={(title) => onCreate(title, null)} />
          {done.length > 0 && (
            <section className="pl-group pl-done" aria-label={t("pl.g.done")}>
              <button type="button" className="pl-fold" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                <ChevronRight aria-hidden="true" />
                {t("pl.g.done")} <span>{done.length}</span>
              </button>
              {showDone && <ul>{done.map(row)}</ul>}
            </section>
          )}
        </>
      )}
    </Page>
  );
}

function Empty() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className="pl-empty">
      <strong>{t("pl.empty.title")}</strong>
      <p>{t("pl.empty.text")}</p>
      <button type="button" onClick={() => router.push("/dashboard/assistant?ask=" + encodeURIComponent(t("pl.empty.cta")))}>
        {t("pl.empty.cta")} <ArrowRight aria-hidden="true" />
      </button>
    </div>
  );
}

function AddRow({ onAdd }: { onAdd: (title: string) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const title = v.trim().slice(0, 300);
    if (!title) return;
    onAdd(title);
    setV("");
  };
  return (
    <form className="pl-add" onSubmit={submit}>
      <span className="pl-box is-ghost" aria-hidden="true" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={t("pl.add.ph")} aria-label={t("pl.add.label")} maxLength={300} />
      {v.trim() && <kbd>{t("pl.add.hint")}</kbd>}
    </form>
  );
}

function dueChip(due: string | null, today: string, lang: string, t: ReturnType<typeof useI18n>["t"]) {
  if (!validPlanDate(due)) return { text: t("pl.due.none"), tone: "none" as const };
  const d = daysBetween(today, due);
  if (d < 0) return { text: t("pl.due.late", { n: -d }), tone: "late" as const };
  if (d === 0) return { text: t("pl.due.today"), tone: "today" as const };
  if (d === 1) return { text: t("pl.due.tomorrow"), tone: "soon" as const };
  const text = utc(due).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  return { text, tone: d <= 7 ? ("soon" as const) : ("far" as const) };
}

function TaskRow({
  task,
  today,
  lang,
  university,
  byAI,
  leaving,
  onToggle,
  onRename,
  onDate,
  onDelete,
}: {
  task: ChecklistItem;
  today: string;
  lang: string;
  university?: University;
  byAI: boolean;
  leaving: boolean;
  onToggle: (done: boolean) => void;
  onRename: (title: string) => void;
  onDate: (due: string | null) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const dateRef = useRef<HTMLInputElement>(null);
  const checked = task.done || leaving;
  const chip = dueChip(task.due_at, today, lang, t);
  const commit = () => {
    setEditing(false);
    const title = draft.trim().slice(0, 300);
    if (title && title !== task.title) onRename(title);
    else setDraft(task.title);
  };
  return (
    <li className={cn("pl-row", checked && "is-done", leaving && "is-leaving")}>
      <div className="pl-row-in">
        <label className="pl-check">
          <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} aria-label={t("pl.done.toggle", { title: task.title })} />
          <span className="pl-box" aria-hidden="true">
            <Check strokeWidth={3} />
          </span>
        </label>
        {editing ? (
          <input
            className="pl-title-edit"
            autoFocus
            value={draft}
            maxLength={300}
            aria-label={t("pl.rename", { title: task.title })}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(task.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button type="button" className="pl-title" onClick={() => !task.done && setEditing(true)} title={task.title}>
            {task.title}
          </button>
        )}
        <span className="pl-meta">
          {university && (
            <span className="pl-uni" title={university.name}>
              <UniversityLogo university={university} size="sm" />
            </span>
          )}
          <span className={cn("pl-src", byAI && "is-ai")} title={t("pl.src.title") + " " + t(byAI ? "pl.src.ai" : "pl.src.you")}>
            {byAI && <AIMark size={11} />}
            {t(byAI ? "pl.src.ai" : "pl.src.you")}
          </span>
          <label className={cn("pl-due", "is-" + chip.tone)}>
            {chip.text}
            <input
              ref={dateRef}
              type="date"
              value={validPlanDate(task.due_at) ? task.due_at : ""}
              aria-label={t("pl.due.set", { title: task.title })}
              onChange={(e) => onDate(e.target.value || null)}
            />
          </label>
          <button type="button" className="pl-x" aria-label={t("pl.remove", { title: task.title })} onClick={onDelete}>
            <X aria-hidden="true" />
          </button>
        </span>
      </div>
    </li>
  );
}
