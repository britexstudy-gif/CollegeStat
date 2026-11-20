"use client";
/* Dashboard home, v6 prototype (Nov 18). Built around the two things a student checks daily:
 * "when is everything due" (a deadline timeline with university logos pinned on it) and
 * "how ready am I" (one readiness ring). Then the universities as cards, and this week's work.
 * Same props as HomeView, so it can replace it in one line if the owner keeps it. */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarClock, Check, Flame, ListChecks, Plus } from "lucide-react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useI18n } from "./i18n";
import { UniversityLogo } from "./primitives";
import { DateText } from "./dash-ui";
import { flagOf } from "./scholarship-format";
import { gapHref, gapText, groupLabel, groupOf, type CollegeRow, type HomeView } from "./workspace-oneprep-overview";
import { daysUntil } from "@/lib/date-label";
import { validPlanDate } from "@/lib/workspace-planner";
import type { MessageKey } from "@/lib/i18n/messages";
import { AskBar, AIRecs, RecentlyViewed, ScholarshipsForYou } from "./home-foryou";
import "./home-v6.css";

type Props = Parameters<typeof HomeView>[0];

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Months from today's month to the last deadline's month (at least four), with each pin's position. */
function timeline(colleges: CollegeRow[], today: string, lang: string, gap: number) {
  const dated = colleges.filter((c) => c.deadline && c.deadline >= today).sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  const t0 = Date.parse(today.slice(0, 8) + "01");
  const last = dated.length ? Date.parse(dated[dated.length - 1].deadline!) : t0;
  const lastMonth = new Date(last);
  let end = Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 1);
  const min = new Date(t0);
  end = Math.max(end, Date.UTC(min.getUTCFullYear(), min.getUTCMonth() + 4, 1));
  const span = end - t0;
  const at = (ms: number) => ((ms - t0) / span) * 100;
  const fmt = new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" });
  const months: { key: string; left: number; label: string }[] = [];
  for (let d = new Date(t0); d.getTime() < end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    months.push({ key: iso(d.getTime()), left: at(d.getTime()), label: fmt.format(d) });
  }
  // Pins closer than one logo apart are spread out (a few days off at most), so logos never overlap.
  const GAP = gap;
  const pins = dated.map((c) => ({ c, left: at(Date.parse(c.deadline!)), lane: 0 }));
  for (let i = 1; i < pins.length; i++) pins[i].left = Math.max(pins[i].left, pins[i - 1].left + GAP);
  const over = pins.length ? pins[pins.length - 1].left - 97 : 0;
  if (over > 0) for (let i = pins.length - 1; i >= 0; i--) pins[i].left = Math.min(pins[i].left, (i === pins.length - 1 ? 97 : pins[i + 1].left - GAP));
  return { months, pins, now: at(Date.parse(today)) };
}

function Ring({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg className="h6-ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r={r} className="h6-ring-track" />
      <circle cx="60" cy="60" r={r} className="h6-ring-fill" strokeDasharray={`${(value / 100) * c} ${c}`} />
    </svg>
  );
}

export function HomeViewV6({ displayName, today, dataReady, tasks, colleges, gaps, steps, streak, onCompleteTask, pendingTaskIds = new Set<string>() }: Props) {
  const { t, lang } = useI18n();
  const first = (displayName || "").split(" ")[0] || "";
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const dateLine = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(today + "T12:00:00Z"));

  const items = colleges.reduce((a, c) => ({ done: a.done + c.ready.done, total: a.total + c.ready.total }), { done: 0, total: 0 });
  const readiness = Math.round((items.done / Math.max(1, items.total)) * 100);
  // Pins keep one logo (48px) apart at any width, measured from the track itself.
  const track = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(600);
  useEffect(() => {
    const el = track.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setTrackW(e.contentRect.width || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tl = timeline(colleges, today, lang, Math.max(6, (48 / trackW) * 100));
  const focus = tl.pins[0]?.c;

  const open = tasks
    .filter((x) => !x.done)
    .sort((a, b) => (a.due_at && validPlanDate(a.due_at) ? a.due_at : "9999").localeCompare(b.due_at && validPlanDate(b.due_at) ? b.due_at : "9999"))
    .slice(0, 5);
  const fill = gaps.slice(0, Math.max(0, 4 - open.length)).map((g) => ({ key: g.id, text: gapText(g, t), href: gapHref(g) }));

  const n = { reach: 0, target: 0, likely: 0 };
  for (const r of colleges) {
    const g = groupOf(r);
    if (g) n[g] += 1;
  }
  const sorted = n.reach + n.target + n.likely;
  // A first visit (nothing saved yet): one clear "Start here" list instead of empty charts.
  const fresh = colleges.length === 0;
  const start = (
    <section className="h6-card h6-start" aria-labelledby="h6-start">
      <div className="h6-start-head">
        <h2 id="h6-start">{t("d6.start")}</h2>
        <p className="h6-faint">{t("d6.start.sub", { done, total: steps.length })}</p>
        <span className="h6-bar" aria-hidden="true">
          <i style={{ width: (done / Math.max(1, steps.length)) * 100 + "%" }} />
        </span>
      </div>
      <ol className="h6-steps">
        {steps.map((s, i) => (
          <li key={s.id} className={cn(s.done && "is-done", s === next && "is-next")}>
            <span className="h6-step-n" aria-hidden="true">
              {s.done ? <Check /> : i + 1}
            </span>
            <div className="h6-grow">
              <strong>{t(`d2.step.${s.id}` as MessageKey)}</strong>
              <p>{t(`d6.why.${s.id}` as MessageKey)}</p>
            </div>
            {!s.done && (
              <Link className={cn("h6-step-go", s === next && "is-primary")} href={s.href} aria-label={t(`d2.step.${s.id}` as MessageKey)}>
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
  const cards = [...colleges].sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));

  // Until the list has loaded, show quiet placeholders, never the empty "Start here" state.
  if (!dataReady)
    return (
      <div className="h6" aria-busy="true">
        <header className="h6-head">
          <div className="h6-greet">
            <span className="h6-mascot" aria-hidden="true" />
            <div>
              <p className="h6-date">{dateLine}</p>
              <h1>{first ? t("d2.home.hi", { name: first }) : t("d2.home.hi_plain")}</h1>
            </div>
          </div>
        </header>
        <div className="h6-top">
          <div className="h6-card h6-skel" style={{ height: 260 }} />
          <div className="h6-card h6-skel" style={{ height: 260 }} />
        </div>
        <div className="h6-unis h6-skel-row">
          <div className="h6-card h6-skel" style={{ height: 170 }} />
          <div className="h6-card h6-skel" style={{ height: 170 }} />
          <div className="h6-card h6-skel" style={{ height: 170 }} />
        </div>
      </div>
    );

  return (
    <div className="h6">
      <header className="h7-hero">
        <div className="h7-hero-top">
          <div className="h6-grow">
            <p className="h6-date">{dateLine}</p>
            <h1>{first ? t("d2.home.hi", { name: first }) : t("d2.home.hi_plain")}</h1>
            {focus && (
              <p className="h6-sub">
                {t("d6.sub", { p: Math.round((focus.ready.done / Math.max(1, focus.ready.total)) * 100), name: focus.name, n: daysUntil(focus.deadline!, today) })}
              </p>
            )}
          </div>
          {next && (
            <Link className="h6-btn" href={next.href}>
              {t(`d2.step.${next.id}` as MessageKey)} <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>
        <AskBar />
        {!fresh && (
          <dl className="h7-stats">
            <div className="h7-stat">
              <span className="h7-mini" aria-hidden="true">
                <Ring value={readiness} />
              </span>
              <div>
                <dt>{t("d6.readiness")}</dt>
                <dd className="h6-num">{readiness}%</dd>
              </div>
            </div>
            <div className="h7-stat">
              <span className="h7-ico" aria-hidden="true">
                <CalendarClock />
              </span>
              <div>
                <dt>{focus ? focus.name : t("d6.timeline")}</dt>
                <dd className={cn("h6-num", focus && daysUntil(focus.deadline!, today) <= 14 && "is-soon")}>{focus ? t("d5.in", { n: daysUntil(focus.deadline!, today) }) : "—"}</dd>
              </div>
            </div>
            <div className="h7-stat">
              <span className="h7-ico" aria-hidden="true">
                <ListChecks />
              </span>
              <div>
                <dt>{t("d6.items")}</dt>
                <dd className="h6-num">
                  {items.done}
                  <span className="h6-faint">/{items.total}</span>
                </dd>
              </div>
            </div>
            <div className="h7-stat">
              <span className={cn("h7-ico", streak > 0 && "is-hot")} aria-hidden="true">
                <Flame />
              </span>
              <div>
                <dt>{t("d4.home.streak")}</dt>
                <dd className="h6-num">{streak}</dd>
              </div>
            </div>
          </dl>
        )}
      </header>

      {fresh ? (
        start
      ) : (
      <div className="h6-top is-wide">
        <section className="h6-card h6-timeline" aria-labelledby="h6-tl">
          <div className="h6-card-head">
            <h2 id="h6-tl">{t("d6.timeline")}</h2>
            <span className="h6-faint">{t("d6.timeline.n", { n: tl.pins.length })}</span>
          </div>
          <div className="h6-track" ref={track}>
            <div className="h6-axis" aria-hidden="true">
              {tl.months.map((m) => (
                <span key={m.key} className="h6-month" style={{ left: m.left + "%" }}>
                  {m.label}
                </span>
              ))}
              <span className="h6-elapsed" style={{ width: tl.now + "%" }} />
              <span className="h6-now" style={{ left: tl.now + "%" }}>
                <b>{t("d6.today")}</b>
              </span>
            </div>
            <ol className="h6-pins">
              {tl.pins.map(({ c, left, lane }) => {
                const days = daysUntil(c.deadline!, today);
                return (
                  <li key={c.id} className={cn("h6-pin", lane && "is-up", days <= 14 && "is-soon")} style={{ left: left + "%" }}>
                    <Link href={c.href} className="h6-pin-link" aria-label={`${c.name}: ${days}`}>
                      <span className="h6-pin-logo">{c.university && <UniversityLogo university={c.university} size="sm" />}</span>
                      <span className="h6-pin-days h6-num">{t("d5.in", { n: days })}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
          {focus && (
            <Link className="h6-next" href={focus.href}>
              <span className="h6-next-dot" aria-hidden="true" />
              <span className="h6-grow">
                <strong>{focus.name}</strong>
                <span className="h6-faint">
                  {" · "}
                  <DateText date={focus.deadline!} />
                  {focus.apply?.name ? " · " + focus.apply.name : ""}
                </span>
              </span>
              <span className="h6-num h6-next-n">{t("d5.in", { n: daysUntil(focus.deadline!, today) })}</span>
              <ArrowRight className="h6-chev" aria-hidden="true" />
            </Link>
          )}
        </section>

      </div>
      )}

      {!fresh && (
      <section aria-labelledby="h6-unis">
        <div className="h6-sec-head">
          <h2 id="h6-unis">
            {t("d5.colleges")} <span className="h6-faint h6-num">{colleges.length}</span>
          </h2>
          <Link href="/dashboard?section=Universities" className="h6-link">
            {t("d5.all")} <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
        <ul className="h6-unis">
          {cards.map((c) => {
            const g = groupOf(c);
            const days = c.deadline ? daysUntil(c.deadline, today) : null;
            const pct = Math.round((c.ready.done / Math.max(1, c.ready.total)) * 100);
            const cc = (c.university as { country_code?: string } | undefined)?.country_code;
            return (
              <li key={c.id}>
                <Link className="h6-uni" href={c.href}>
                  <div className="h6-uni-top">
                    {c.university && <UniversityLogo university={c.university} size="md" />}
                    <span className={cn("h6-tag", g ? "is-" + g : "is-none")}>{g ? groupLabel(t, g) : t("d6.unsorted")}</span>
                  </div>
                  <h3>{c.name}</h3>
                  <p className="h6-faint h6-uni-meta">
                    {cc && <span aria-hidden="true">{flagOf(cc)} </span>}
                    {c.apply?.name ?? ""}
                  </p>
                  <div className="h6-uni-due">
                    {c.deadline ? (
                      <>
                        <span>
                          <DateText date={c.deadline} />
                        </span>
                        <span className={cn("h6-num", days !== null && days <= 14 && "is-soon", days !== null && days < 0 && "is-late")}>
                          {days !== null && days >= 0 ? t("d5.in", { n: days }) : "—"}
                        </span>
                      </>
                    ) : (
                      <span className="h6-faint">{t("d6.nodate")}</span>
                    )}
                  </div>
                  <div className="h6-uni-ready">
                    <span className="h6-bar" aria-hidden="true">
                      <i style={{ width: pct + "%" }} className={pct === 100 ? "is-full" : undefined} />
                    </span>
                    <span className="h6-faint h6-num">
                      {c.ready.done}/{c.ready.total}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
          <li>
            <Link className="h6-uni h6-add" href="/universities">
              <Plus aria-hidden="true" />
              <span>{t("d6.add")}</span>
            </Link>
          </li>
        </ul>
      </section>
      )}

      <RecentlyViewed />

      <div className={cn("h6-bottom", sorted === 0 && "is-single")}>
        <section className="h6-card" aria-labelledby="h6-todo">
          <div className="h6-card-head">
            <h2 id="h6-todo">{t("d6.week")}</h2>
            <Link href="/dashboard?section=Checklist" className="h6-link">
              {t("d5.all")} <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
          <ul className="h6-list">
            {open.map((x) => {
              const due = x.due_at && validPlanDate(x.due_at) ? x.due_at : null;
              const d = due ? daysUntil(due, today) : null;
              return (
                <li key={x.id}>
                  <Checkbox checked={false} disabled={pendingTaskIds.has(x.id)} onCheckedChange={() => onCompleteTask(x.id, true)} aria-label={x.title} />
                  <span className="h6-grow">{x.title}</span>
                  {due && d !== null && (
                    <span className={cn("h6-chip", d < 0 && "is-late", d >= 0 && d <= 3 && "is-soon")}>
                      {d < 0 ? t("db.late", { n: -d }) : <DateText date={due} />}
                    </span>
                  )}
                </li>
              );
            })}
            {fill.map((f) => (
              <li key={f.key}>
                <span className="h6-dashed" aria-hidden="true" />
                <Link className="h6-grow h6-row-link" href={f.href}>
                  {f.text}
                </Link>
                <ArrowRight className="h6-chev" aria-hidden="true" />
              </li>
            ))}
            {open.length + fill.length === 0 && (
              <li className="h6-empty">
                <Check aria-hidden="true" /> {t("d5.clear")}
              </li>
            )}
          </ul>
        </section>

        <div className="h6-side">

          {sorted > 0 && (
          <section className="h6-card" aria-labelledby="h6-bal">
            <div className="h6-card-head">
              <h2 id="h6-bal">{t("d5.balance")}</h2>
              <span className="h6-faint">{sorted === 0 ? t("d5.balance.empty") : n.likely === 0 ? t("d5.balance.safety") : n.target === 0 ? t("d5.balance.target") : t("d5.balance.ok")}</span>
            </div>
            <div className="h6-mix" aria-hidden="true">
              {(["reach", "target", "likely"] as const).map((g) => (n[g] ? <i key={g} className={"is-" + g} style={{ flex: n[g] }} /> : null))}
            </div>
            <ul className="h6-mix-key">
              {(["reach", "target", "likely"] as const).map((g) => (
                <li key={g}>
                  <i className={"is-" + g} aria-hidden="true" />
                  <span className="h6-num">{n[g]}</span> {groupLabel(t, g)}
                </li>
              ))}
            </ul>
          </section>
          )}

        </div>
      </div>

      <div className="fy-row">
        <AIRecs saved={colleges.flatMap((c) => [c.university?.slug || "", c.name.toLowerCase()]).filter(Boolean)} />
        <ScholarshipsForYou today={today} />
      </div>
    </div>
  );
}
