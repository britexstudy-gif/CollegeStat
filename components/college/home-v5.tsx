"use client";
/* Dashboard home, v5 proposal (Nov 17): calmer and more minimal than HomeView.
 * One focus card (the next deadline and how ready it is), one quiet line of numbers,
 * then two plain lists: what to do and the universities. No tables, no boxed stats.
 * Same props as HomeView, so it can replace it in one line if the owner keeps it. */
import { ArrowRight, ArrowUpRight, Check, Flame } from "lucide-react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useI18n } from "./i18n";
import { UniversityLogo } from "./primitives";
import { DateText } from "./dash-ui";
import { gapHref, gapText, groupLabel, groupOf, type HomeView } from "./workspace-oneprep-overview";
import { daysUntil } from "@/lib/date-label";
import { validPlanDate } from "@/lib/workspace-planner";
import type { MessageKey } from "@/lib/i18n/messages";
import "./home-v5.css";

type Props = Parameters<typeof HomeView>[0];

export function HomeViewV5({ displayName, today, dataReady, tasks, colleges, gaps, steps, streak, activeToday, week, onCompleteTask, pendingTaskIds = new Set<string>() }: Props) {
  const { t, lang } = useI18n();
  const first = (displayName || "").split(" ")[0] || "";
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const dated = colleges.filter((c) => c.deadline && c.deadline >= today).sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  const focus = dated[0];
  const dateLine = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(today + "T12:00:00Z"));

  const open = tasks
    .filter((x) => !x.done)
    .sort((a, b) => (a.due_at && validPlanDate(a.due_at) ? a.due_at : "9999").localeCompare(b.due_at && validPlanDate(b.due_at) ? b.due_at : "9999"))
    .slice(0, 5);
  const fill = gaps.slice(0, Math.max(0, 5 - open.length)).map((g) => ({ key: g.id, text: gapText(g, t), href: gapHref(g) }));

  const n = { reach: 0, target: 0, likely: 0 };
  for (const r of colleges) {
    const g = groupOf(r);
    if (g) n[g] += 1;
  }

  return (
    <div className={cn("h5", !dataReady && "is-busy")}>
      <header className="h5-head">
        <div>
          <p className="h5-date">{dateLine}</p>
          <h1>{first ? t("d2.home.hi", { name: first }) : t("d2.home.hi_plain")}</h1>
        </div>
        {next && (
          <Link className="h5-btn is-primary" href={next.href}>
            {t(`d2.step.${next.id}` as MessageKey)} <ArrowRight aria-hidden="true" />
          </Link>
        )}
      </header>

      {focus && (
        <Link className="h5-focus" href={focus.href}>
          <div className="h5-focus-id">
            {focus.university && <UniversityLogo university={focus.university} size="lg" />}
            <div>
              <p className="h5-kicker">{t("d3.home.deadline")}</p>
              <h2>{focus.name}</h2>
              <p className="h5-muted">
                <DateText date={focus.deadline!} />
                {focus.apply?.name ? " · " + focus.apply.name : ""}
              </p>
            </div>
          </div>
          <div className="h5-focus-ready">
            <div className="h5-ready-row">
              <span>{t("d5.ready", { done: focus.ready.done, total: focus.ready.total })}</span>
              <span className="h5-num">{Math.round((focus.ready.done / Math.max(1, focus.ready.total)) * 100)}%</span>
            </div>
            <span className="h5-bar" aria-hidden="true">
              <i style={{ width: (focus.ready.done / Math.max(1, focus.ready.total)) * 100 + "%" }} />
            </span>
          </div>
          <div className="h5-focus-days">
            <strong className="h5-num">{daysUntil(focus.deadline!, today)}</strong>
            <span>{t("d5.daysleft")}</span>
          </div>
        </Link>
      )}

      <dl className="h5-line">
        <div>
          <dt>{t("d4.home.plan")}</dt>
          <dd>
            <span className="h5-num">{done}</span>
            <span className="h5-faint">/{steps.length}</span>
            <span className="h5-pips" aria-hidden="true">
              {steps.map((s) => (
                <i key={s.id} className={s.done ? "is-on" : undefined} />
              ))}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t("d5.balance")}</dt>
          <dd className="h5-mix">
            {(["reach", "target", "likely"] as const).map((g) => (
              <span key={g}>
                <i className={"is-" + g} aria-hidden="true" />
                <span className="h5-num">{n[g]}</span>
                <span className="h5-faint">{groupLabel(t, g)}</span>
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>
            <Flame aria-hidden="true" className={streak > 0 ? "is-hot" : undefined} /> {t("d4.home.streak")}
          </dt>
          <dd>
            <span className="h5-num">{streak}</span>
            <span className="h5-week" aria-label={activeToday ? t("d2.streak.kept") : t("d2.streak.keep")}>
              {week.map((d) => (
                <i key={d.day} className={cn(d.xp > 0 && "is-on", d.today && "is-today", d.future && "is-future")} />
              ))}
            </span>
          </dd>
        </div>
      </dl>

      <div className="h5-cols">
        <section aria-labelledby="h5-todo">
          <div className="h5-sec-head">
            <h3 id="h5-todo">{t("d5.todo")}</h3>
            <Link href="/dashboard?section=Checklist" className="h5-link">
              {t("d5.all")} <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
          <ul className="h5-list">
            {open.map((x) => {
              const due = x.due_at && validPlanDate(x.due_at) ? x.due_at : null;
              const late = due ? daysUntil(due, today) < 0 : false;
              return (
                <li key={x.id}>
                  <Checkbox
                    checked={false}
                    disabled={pendingTaskIds.has(x.id)}
                    onCheckedChange={() => onCompleteTask(x.id, true)}
                    aria-label={x.title}
                  />
                  <span className="h5-grow">{x.title}</span>
                  {due && <span className={cn("h5-due", late && "is-late")}>{late ? t("db.late", { n: -daysUntil(due, today) }) : <DateText date={due} />}</span>}
                </li>
              );
            })}
            {fill.map((f) => (
              <li key={f.key}>
                <span className="h5-dot" aria-hidden="true" />
                <Link className="h5-grow h5-row-link" href={f.href}>
                  {f.text}
                </Link>
                <ArrowRight className="h5-chev" aria-hidden="true" />
              </li>
            ))}
            {open.length + fill.length === 0 && (
              <li className="h5-empty">
                <Check aria-hidden="true" /> {t("d5.clear")}
              </li>
            )}
          </ul>
        </section>

        <section aria-labelledby="h5-unis">
          <div className="h5-sec-head">
            <h3 id="h5-unis">
              {t("d5.colleges")} <span className="h5-faint h5-num">{colleges.length}</span>
            </h3>
            <Link href="/dashboard?section=Universities" className="h5-link">
              {t("d5.all")} <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
          <ul className="h5-list">
            {[...colleges]
              .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
              .slice(0, 6)
              .map((c) => {
                const g = groupOf(c);
                const days = c.deadline ? daysUntil(c.deadline, today) : null;
                return (
                  <li key={c.id}>
                    {c.university && <UniversityLogo university={c.university} size="sm" />}
                    <Link className="h5-grow h5-row-link" href={c.href}>
                      {c.name}
                    </Link>
                    {g && (
                      <span className={"h5-tag is-" + g}>
                        <i aria-hidden="true" />
                        {groupLabel(t, g)}
                      </span>
                    )}
                    <span className={cn("h5-due h5-num", days !== null && days <= 14 && "is-soon")}>{days !== null && days >= 0 ? t("d5.in", { n: days }) : "—"}</span>
                  </li>
                );
              })}
          </ul>
        </section>
      </div>
    </div>
  );
}
