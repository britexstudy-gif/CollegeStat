"use client";
import { useMemo } from "react";
import "./plan-calendar.css";
import { EventManager, type Event } from "@/components/ui/event-manager";
import { validPlanDate } from "@/lib/workspace-planner";
import type { ChecklistItem } from "@/services/workspace";
import type { OverviewDate } from "./workspace-oneprep-overview";
import { CalendarDays, X } from "lucide-react";
import { Btn, List, ListRow, Page, PageHeader, ProgressBar, Section, Stat, StatGroup } from "./dash-ui";
import { useI18n } from "./i18n";

/** Date-only plan items live in `user_checklist.due_at` (YYYY-MM-DD). */
const toDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 9);
};
const toDay = (date: Date) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");

/** Brand tokens only: accent for tasks, muted for done, amber when late, ink for fixed deadlines. */
const COLORS = [
  { name: "Task", value: "blue", bg: "bg-[var(--cs-accent)]", text: "text-[var(--cs-accent-text)]" },
  { name: "Done", value: "green", bg: "bg-[var(--cs-faint)]", text: "text-[var(--cs-muted)]" },
  { name: "Overdue", value: "orange", bg: "bg-[var(--cs-warning)]", text: "text-[var(--cs-warning)]" },
  { name: "Deadline", value: "red", bg: "bg-[var(--cs-danger)]", text: "text-[var(--cs-danger)]" },
];

/** Calendar over the application plan: tasks are editable, saved
 * university and scholarship deadlines are read-only. */
export function PlanCalendar({
  tasks,
  deadlines,
  today,
  onCreate,
  onUpdate,
  onDelete,
  embedded,
}: {
  embedded?: boolean;
  tasks: ChecklistItem[];
  deadlines: OverviewDate[];
  today: string;
  onCreate: (title: string, due: string) => void;
  onUpdate: (id: string, payload: { title?: string; due_at?: string | null; done?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const undated = tasks.filter((x) => !validPlanDate(x.due_at));
  const done = tasks.filter((x) => x.done).length;
  const overdue = tasks.filter((x) => !x.done && validPlanDate(x.due_at) && x.due_at! < today).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const byId = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks]);
  const events = useMemo<Event[]>(() => {
    const planned = tasks
      .filter((t) => validPlanDate(t.due_at))
      .map((t) => {
        const start = toDate(t.due_at!);
        const overdue = !t.done && t.due_at! < today;
        return {
          id: t.id,
          title: t.title,
          startTime: start,
          endTime: new Date(start.getTime() + 3600000),
          allDay: true,
          category: t.done ? "Done" : "Task",
          color: t.done ? "green" : overdue ? "orange" : "blue",
          tags: overdue ? ["Overdue"] : [],
        };
      });
    const fixed = deadlines
      .filter((d) => validPlanDate(d.date))
      .map((d) => {
        const start = toDate(d.date);
        return {
          id: "deadline:" + d.label + ":" + d.id,
          title: d.name,
          startTime: start,
          endTime: new Date(start.getTime() + 3600000),
          allDay: true,
          category: "Deadline",
          color: "red",
          tags: [d.label],
          editable: false,
          href: d.href,
        };
      });
    return [...planned, ...fixed];
  }, [tasks, deadlines, today]);
  const tags = useMemo(
    () => [...new Set(["Overdue", ...deadlines.map((d) => d.label)])],
    [deadlines],
  );
  if (embedded)
    return (
      <EventManager
        className="plan-calendar"
        events={events}
        categories={["Task", "Done"]}
        colors={COLORS}
        availableTags={tags}
        defaultAllDay
        hiddenFields={["description", "color", "tags"]}
        locale={lang}
        labels={{
          newEvent: t("d3.plan.add"),
          searchPlaceholder: t("d3.plan.search"),
          empty: t("d3.plan.empty"),
          today: t("db.today"),
          month: t("d4.cal.month"),
          week: t("d4.cal.week"),
          day: t("d4.cal.day"),
          list: t("d4.cal.list"),
          tags: t("d4.cal.tags"),
          categories: t("d4.cal.categories"),
        }}
        onEventCreate={(e) => onCreate(e.title, toDay(e.startTime))}
        onEventUpdate={(id, e) => {
          const task = byId.get(id);
          if (!task) return;
          const payload: { title?: string; due_at?: string; done?: boolean } = {};
          if (e.category && (e.category === "Done") !== task.done) payload.done = e.category === "Done";
          if (e.title && e.title !== task.title) payload.title = e.title.trim().slice(0, 300);
          if (e.startTime && toDay(e.startTime) !== task.due_at) payload.due_at = toDay(e.startTime);
          if (Object.keys(payload).length) onUpdate(id, payload);
        }}
        onEventDelete={(id) => byId.has(id) && onDelete(id)}
      />
    );
  return (
    <Page>
      <PageHeader title={t("dash.plan")} description={t("d3.plan.sub")} />
      <StatGroup label={t("dash.plan")}>
        <Stat
          label={t("d3.plan.s.done")}
          value={
            <span className="dk-num">
              {done}
              <span className="dk-faint">/{tasks.length}</span>
            </span>
          }
          hint={<ProgressBar value={pct} label={t("d3.plan.done", { done, total: tasks.length })} className="mt-1.5 w-full min-w-24" />}
        />
        <Stat label={t("d3.plan.s.dates")} value={deadlines.length} />
        <Stat label={t("d3.plan.s.overdue")} value={overdue} tone={overdue ? "warning" : undefined} />
      </StatGroup>
      {undated.length > 0 && (
        <Section id="plan-undated" title={t("d3.plan.undated")} count={undated.length}>
          <List label={t("d3.plan.undated")}>
            {undated.map((x) => (
              <ListRow
                key={x.id}
                done={x.done}
                leading={<input type="checkbox" className="plan-check" checked={x.done} aria-label={x.title} onChange={(e) => onUpdate(x.id, { done: e.target.checked })} />}
                title={x.title}
                trailing={
                  <>
                    <label className="plan-date">
                      <CalendarDays aria-hidden="true" />
                      <input type="date" aria-label={t("d3.plan.schedule", { title: x.title })} onChange={(e) => e.target.value && onUpdate(x.id, { due_at: e.target.value })} />
                    </label>
                    <Btn icon size="sm" variant="ghost" aria-label={t("d3.plan.remove", { title: x.title })} onClick={() => onDelete(x.id)}>
                      <X aria-hidden="true" />
                    </Btn>
                  </>
                }
              />
            ))}
          </List>
        </Section>
      )}
      <EventManager
        className="plan-calendar"
        events={events}
        categories={["Task", "Done"]}
        colors={COLORS}
        availableTags={tags}
        defaultAllDay
        hiddenFields={["description", "color", "tags"]}
        locale={lang}
        labels={{
          newEvent: t("d3.plan.add"),
          searchPlaceholder: t("d3.plan.search"),
          empty: t("d3.plan.empty"),
          today: t("db.today"),
          month: t("d4.cal.month"),
          week: t("d4.cal.week"),
          day: t("d4.cal.day"),
          list: t("d4.cal.list"),
          tags: t("d4.cal.tags"),
          categories: t("d4.cal.categories"),
        }}
        onEventCreate={(e) => onCreate(e.title, toDay(e.startTime))}
        onEventUpdate={(id, e) => {
          const task = byId.get(id);
          if (!task) return;
          const payload: { title?: string; due_at?: string; done?: boolean } = {};
          if (e.category && (e.category === "Done") !== task.done) payload.done = e.category === "Done";
          if (e.title && e.title !== task.title) payload.title = e.title.trim().slice(0, 300);
          if (e.startTime && toDay(e.startTime) !== task.due_at) payload.due_at = toDay(e.startTime);
          if (Object.keys(payload).length) onUpdate(id, payload);
        }}
        onEventDelete={(id) => byId.has(id) && onDelete(id)}
      />
    </Page>
  );
}
