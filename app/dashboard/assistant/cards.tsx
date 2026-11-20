"use client";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, BarChart3, Check, CalendarDays, CircleCheck, CircleX, ListTodo, Plus, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UniversityLogo } from "@/components/college/primitives";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { useCollege } from "@/components/college/provider";
import { useMyColleges, fitLabel } from "@/components/college/my-colleges";
import { useT, type Translate } from "@/components/college/i18n";
import { updateWorkspaceTask, writeWorkspace } from "@/services/workspace-mutations";
import { markAiTasks } from "@/lib/plan-source";
import { recordActivity } from "@/lib/progress-store";
import { countryName } from "@/lib/domain";
import type { MessageKey } from "@/lib/i18n/messages";
import { scholarshipHref, universityHref, type AssistantCard, type CardStat, type UniversityCardItem } from "@/lib/ai-assistant";

/** Rich results the counsellor's tools return. Proposal cards (add / plan)
 * write only after the student presses Confirm, through the same client save
 * paths as the rest of the workspace. */

export type CardState = "confirmed" | "dismissed" | undefined;

const STAT: Record<CardStat["k"], MessageKey> = {
  rank: "ai.stat.rank",
  tuition: "ai.stat.tuition",
  admission: "ai.stat.admission",
  ielts: "ai.stat.ielts",
  sat: "ai.stat.sat",
};
const CHANCE: Record<string, MessageKey> = {
  reach: "ai.chance.reach",
  target: "ai.chance.target",
  likely: "ai.chance.likely",
  unknown: "ai.chance.unknown",
};
const fmtDate = (iso: string, lang?: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(+d) ? iso : d.toLocaleDateString(lang || undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

function Chance({ value, t }: { value?: string; t: Translate }) {
  if (!value || value === "unknown") return null;
  return <span className={"asx-chance is-" + value}>{t(CHANCE[value])}</span>;
}

function UniversityMini({ u }: { u: UniversityCardItem }) {
  const t = useT();
  const s = useCollege();
  const { setFit } = useMyColleges();
  const [busy, setBusy] = useState(false);
  const saved = s.saved.includes(u.id);
  const add = async () => {
    setBusy(true);
    try {
      const fit = u.chance === "reach" ? "reach" : u.chance === "likely" ? "safety" : u.chance === "target" ? "target" : null;
      if (fit) await setFit(u.id, fit);
      else await s.toggleSaved(u.id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="asx-uni">
      <Link href={universityHref(u.slug)} className="asx-uni-head">
        <UniversityLogo university={u} size="sm" />
        <span>
          <strong>{u.name}</strong>
          <small>{u.place}</small>
        </span>
      </Link>
      {u.stats.length > 0 && (
        <dl className="asx-stats">
          {u.stats.map((st) => (
            <div key={st.k}>
              <dt>{t(STAT[st.k])}</dt>
              <dd title={st.note}>{st.v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="asx-uni-foot">
        <Chance value={u.chance} t={t} />
        <Button size="sm" variant={saved ? "ghost" : "outline"} className="asx-add" disabled={busy || saved} onClick={() => void add()}>
          {saved ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          {saved ? t("ai.added") : t("ai.add")}
        </Button>
      </div>
    </li>
  );
}

function AddProposal({ card, state, onState }: { card: Extract<AssistantCard, { kind: "add" }>; state: CardState; onState: (s: CardState) => void }) {
  const t = useT();
  const s = useCollege();
  const { setFit } = useMyColleges();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!s.user) return s.openAuth();
    setBusy(true);
    try {
      await setFit(card.university.id, card.fit);
      onState("confirmed");
    } catch {
      toast.error(t("ai.prop.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="asx-card asx-proposal">
      <div className="asx-proposal-row">
        <UniversityLogo university={card.university} size="sm" />
        <p>{t("ai.prop.add", { name: card.university.name, fit: fitLabel(t, card.fit) })}</p>
      </div>
      <Actions state={state} busy={busy} onConfirm={() => void confirm()} onDismiss={() => onState("dismissed")} done={t("ai.prop.done")} />
    </div>
  );
}

function Actions({ state, busy, onConfirm, onDismiss, done, label }: { state: CardState; busy: boolean; onConfirm: () => void; onDismiss: () => void; done: string; label?: string }) {
  const t = useT();
  if (state === "confirmed")
    return (
      <p className="asx-state is-done" role="status">
        <Check size={14} aria-hidden="true" /> {done}
      </p>
    );
  if (state === "dismissed") return <p className="asx-state">{t("ai.prop.dismissed")}</p>;
  return (
    <div className="asx-actions">
      <Button size="sm" onClick={onConfirm} disabled={busy}>
        {label || t("ai.confirm")}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
        {t("ai.dismiss")}
      </Button>
    </div>
  );
}

function PlanProposal({ card, state, onState, lang }: { card: Extract<AssistantCard, { kind: "plan" }>; state: CardState; onState: (s: CardState) => void; lang: string }) {
  const t = useT();
  const s = useCollege();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!s.user) return s.openAuth();
    setBusy(true);
    try {
      const token = s.accountScope.capture();
      const ids: string[] = [];
      for (const item of card.items) {
        const id = crypto.randomUUID();
        await writeWorkspace(
          s.accountScope,
          "user_checklist",
          { id, title: item.title.slice(0, 300), due_at: item.date || null, ...(item.university_id ? { university_id: item.university_id } : {}) },
          undefined,
          token,
        );
        ids.push(id);
      }
      markAiTasks(s.user.id, ids);
      onState("confirmed");
      void s.refreshAccount();
    } catch {
      toast.error(t("ai.prop.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="asx-card">
      <p className="asx-card-title">
        {card.items.some((x) => x.kind === "deadline") ? (
          <>
            <CalendarDays size={15} aria-hidden="true" /> {t("ai.plan.title")}
          </>
        ) : (
          <>
            <ListTodo size={15} aria-hidden="true" /> {t("ai.tasks.title")}
          </>
        )}
      </p>
      <ol className="asx-timeline">
        {card.items.map((it, i) => (
          <li key={i} className={"is-" + it.kind}>
            {it.date ? <time dateTime={it.date}>{fmtDate(it.date, lang)}</time> : <time className="asx-nodate">—</time>}
            <span>
              {it.title}
              {it.source_url && (
                <a href={it.source_url} target="_blank" rel="noreferrer noopener" className="asx-src" aria-label={t("ai.source")}>
                  <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
      {card.missing.length > 0 && <p className="asx-muted">{t("ai.plan.missing", { names: card.missing.join(", ") })}</p>}
      <Actions
        state={state}
        busy={busy}
        onConfirm={() => void confirm()}
        onDismiss={() => onState("dismissed")}
        done={t("ai.plan.done")}
        label={t("ai.plan.confirm", { n: card.items.length })}
      />
    </div>
  );
}

function TaskEditProposal({ card, state, onState, lang }: { card: Extract<AssistantCard, { kind: "task_edit" }>; state: CardState; onState: (s: CardState) => void; lang: string }) {
  const t = useT();
  const s = useCollege();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!s.user) return s.openAuth();
    setBusy(true);
    try {
      const token = s.accountScope.capture();
      for (const it of card.items) {
        const payload: Record<string, unknown> = {};
        if (it.newTitle) payload.title = it.newTitle.slice(0, 300);
        if (it.due !== undefined) payload.due_at = it.due;
        if (it.done !== undefined) payload.done = it.done;
        await updateWorkspaceTask(s.accountScope, it.id, payload, token);
        if (it.done === true) void recordActivity("task", it.id);
      }
      onState("confirmed");
      void s.refreshAccount();
    } catch {
      toast.error(t("ai.prop.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="asx-card">
      <p className="asx-card-title">
        <ListTodo size={15} aria-hidden="true" /> {t("ai.edit.title")}
      </p>
      <ol className="asx-timeline">
        {card.items.map((it) => (
          <li key={it.id} className="is-prep">
            {it.due ? <time dateTime={it.due}>{fmtDate(it.due, lang)}</time> : <time className="asx-nodate">—</time>}
            <span>
              {it.newTitle ? (
                <>
                  <s className="asx-muted">{it.title}</s> {it.newTitle}
                </>
              ) : (
                it.title
              )}
              {it.done !== undefined && <span className="asx-muted"> · {t(it.done ? "ai.edit.markdone" : "ai.edit.reopen")}</span>}
              {it.due === null && <span className="asx-muted"> · {t("ai.edit.nodate")}</span>}
            </span>
          </li>
        ))}
      </ol>
      <Actions state={state} busy={busy} onConfirm={() => void confirm()} onDismiss={() => onState("dismissed")} done={t("ai.edit.done")} label={t("ai.edit.confirm", { n: card.items.length })} />
    </div>
  );
}

const CMP_ROW: Record<string, MessageKey> = {
  rank: "ai.stat.rank",
  tuition: "ai.stat.tuition",
  admission: "ai.stat.admission",
  ielts: "ai.stat.ielts",
  sat: "ai.stat.sat",
  deadline: "ai.stat.deadline",
  chance: "ai.stat.chance",
};

const CRIT: Record<string, MessageKey> = {
  length: "ai.crit.length",
  structure: "ai.crit.structure",
  specificity: "ai.crit.specificity",
  clarity: "ai.crit.clarity",
  voice: "ai.crit.voice",
  originality: "ai.crit.originality",
};

function OpenCard({ card }: { card: Extract<AssistantCard, { kind: "open" }> }) {
  return (
    <Link href={card.href} className="asx-open">
      <span>{card.label}</span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}

function ChartCard({ card }: { card: Extract<AssistantCard, { kind: "chart" }> }) {
  const max = Math.max(...card.items.map((x) => Math.abs(x.value)), 1);
  const fmt = (v: number) => (Math.abs(v) >= 10000 ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v) : new Intl.NumberFormat().format(v));
  return (
    <figure className="asx-card asx-chart">
      <p className="asx-card-title">
        <BarChart3 size={15} aria-hidden="true" /> {card.title} <span className="asx-muted">· {card.unit}</span>
      </p>
      {card.type === "column" ? (
        <div className="asx-cols" role="img" aria-label={card.items.map((x) => `${x.label}: ${x.value} ${card.unit}`).join(", ")}>
          {card.items.map((x, i) => (
            <div key={i} title={x.note}>
              <b className="dk-num">{fmt(x.value)}</b>
              <span className="asx-col">
                <i style={{ height: Math.max(3, (Math.abs(x.value) / max) * 100) + "%" }} />
              </span>
              <small>{x.label}</small>
            </div>
          ))}
        </div>
      ) : (
        <ul className="asx-hbars">
          {card.items.map((x, i) => (
            <li key={i} title={x.note}>
              <span className="asx-hbar-label">{x.label}</span>
              <span className="asx-hbar">
                <i style={{ width: Math.max(2, (Math.abs(x.value) / max) * 100) + "%" }} />
              </span>
              <span className="asx-hbar-val dk-num">{fmt(x.value)}</span>
            </li>
          ))}
        </ul>
      )}
      {card.source && <figcaption className="asx-muted">{card.source}</figcaption>}
    </figure>
  );
}

function QuizCard({ card }: { card: Extract<AssistantCard, { kind: "quiz" }> }) {
  const t = useT();
  const [picked, setPicked] = useState<Record<number, number>>({});
  const answered = Object.keys(picked).length;
  const right = card.questions.filter((q, i) => picked[i] === q.answer).length;
  return (
    <div className="asx-card asx-quiz">
      <p className="asx-card-title">
        <Sparkles size={15} aria-hidden="true" /> {card.title}
        <span className="asx-muted dk-num">
          · {answered}/{card.questions.length}
        </span>
      </p>
      <ol>
        {card.questions.map((q, i) => {
          const p = picked[i];
          const done = p !== undefined;
          return (
            <li key={i}>
              <p className="asx-q">{q.q}</p>
              <div className="asx-opts">
                {q.options.map((o, j) => (
                  <button
                    key={j}
                    type="button"
                    disabled={done}
                    onClick={() => setPicked((x) => ({ ...x, [i]: j }))}
                    className={done ? (j === q.answer ? "is-right" : j === p ? "is-wrong" : "is-dim") : undefined}
                  >
                    {done && j === q.answer && <CircleCheck size={15} aria-hidden="true" />}
                    {done && j === p && j !== q.answer && <CircleX size={15} aria-hidden="true" />}
                    {o}
                  </button>
                ))}
              </div>
              {done && <p className="asx-why">{q.why}</p>}
            </li>
          );
        })}
      </ol>
      {answered === card.questions.length && <p className="asx-score">{t("ai.quiz.score", { n: right, total: card.questions.length })}</p>}
    </div>
  );
}

export function ResultCard({ card, state, onState, lang }: { card: AssistantCard; state: CardState; onState: (s: CardState) => void; lang: string }) {
  const t = useT();
  switch (card.kind) {
    case "universities":
      return (
        <ul className={"asx-unis" + (card.items.length === 1 ? " is-one" : "")}>
          {card.items.map((u) => (
            <UniversityMini key={u.id} u={u} />
          ))}
        </ul>
      );
    case "compare":
      return (
        <div className="asx-card asx-compare">
          <div className="asx-table">
            <table>
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  {card.columns.map((c) => (
                    <th key={c.id} scope="col">
                      <Link href={universityHref(c.slug)} className="asx-cmp-head">
                        <UniversityLogo university={c} size="sm" />
                        <span>{c.short_name || c.name}</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.rows.map((r) => (
                  <tr key={r.k}>
                    <th scope="row">{t(CMP_ROW[r.k] || "ai.stat.rank")}</th>
                    {r.values.map((v, i) => (
                      <td key={i}>{v == null ? <span className="asx-muted">–</span> : r.k === "chance" ? <Chance value={v} t={t} /> : r.k === "deadline" ? fmtDate(v, lang) : v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "scholarships":
      return (
        <ul className="asx-sch">
          {card.items.map((s) => (
            <li key={s.slug}>
              <Link href={scholarshipHref(s.slug)}>
                <strong>{s.name}</strong>
                <small>
                  {[s.provider, s.country ? countryName(s.country) : null].filter(Boolean).join(" · ")}
                </small>
              </Link>
              <div className="asx-sch-meta">
                <span className={"asx-pill" + (s.funding === "full" ? " is-full" : "")}>{t(s.funding === "full" ? "ai.sch.full" : "ai.sch.partial")}</span>
                {s.deadline && <span className="asx-muted">{t("ai.sch.deadline", { date: fmtDate(s.deadline, lang) })}</span>}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="asx-ext">
                    {t("ai.sch.apply")} <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      );
    case "chance":
      return (
        <div className="asx-card asx-chance-card">
          <div className="asx-proposal-row">
            <UniversityLogo university={card.university} size="sm" />
            <p>
              <Link href={universityHref(card.university.slug)} className="asx-link">
                {card.university.name}
              </Link>
            </p>
            <Chance value={card.category} t={t} />
          </div>
          <ul className="asx-facts">
            {card.rate != null && <li>{t("ai.chance.rate", { rate: Math.round(card.rate) })}</li>}
            {card.sat && <li>{t("ai.chance.sat", { low: card.sat.low, high: card.sat.high })}</li>}
            {card.english && (
              <li>
                {t("ai.chance.english", { test: card.english.test, min: card.english.minimum })}
                {card.english.meets != null && <> · {t(card.english.meets ? "ai.chance.meets" : "ai.chance.below")}</>}
              </li>
            )}
            {card.overBudget && <li>{t("ai.chance.budget")}</li>}
          </ul>
          {card.missing.filter((m) => m !== "admission_rate").length > 0 && (
            <p className="asx-muted">
              {t("ai.chance.missing")}{" "}
              <Link href="/dashboard/profile" className="asx-link">
                {t("ai.chance.profile")}
              </Link>
            </p>
          )}
          <p className="asx-muted">{t("ai.chance.note")}</p>
        </div>
      );
    case "add":
      return <AddProposal card={card} state={state} onState={onState} />;
    case "plan":
      return <PlanProposal card={card} state={state} onState={onState} lang={lang} />;
    case "task_edit":
      return <TaskEditProposal card={card} state={state} onState={onState} lang={lang} />;
    case "open":
      return <OpenCard card={card} />;
    case "chart":
      return <ChartCard card={card} />;
    case "quiz":
      return <QuizCard card={card} />;
    case "essay":
      return (
        <div className="asx-card">
          <p className="asx-card-title">
            {t("ai.essay.title")} <span className="asx-muted">· {t("ai.essay.words", { n: card.words })}</span>
          </p>
          <ul className="asx-bars">
            {card.criteria.map((c) => (
              <li key={c.id}>
                <span>{t(CRIT[c.id] || "ai.crit.clarity")}</span>
                <span className="asx-bar" aria-label={`${c.score}/5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={n <= c.score ? "is-on" : ""} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {card.strengths.length > 0 && (
            <>
              <p className="asx-sub">{t("ai.essay.strengths")}</p>
              <ul className="asx-facts">
                {card.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {card.improvements.length > 0 && (
            <>
              <p className="asx-sub">{t("ai.essay.improve")}</p>
              <ul className="asx-facts">
                {card.improvements.map((s, i) => (
                  <li key={i}>
                    <strong>{s.issue}</strong> {s.suggestion}
                  </li>
                ))}
              </ul>
            </>
          )}
          {card.prompt_fit && (
            <>
              <p className="asx-sub">{t("ai.essay.fit")}</p>
              <p>{card.prompt_fit}</p>
            </>
          )}
        </div>
      );
    case "scam":
      return (
        <div className="asx-card asx-scam">
          <p className="asx-card-title">
            {card.flags.length ? <ShieldAlert size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />} {t("ai.scam.title")}
          </p>
          {card.flags.length ? (
            <ul className="asx-flags">
              {card.flags.map((f) => (
                <li key={f.id}>
                  <strong>{t(("ai.scam.flag." + f.id) as MessageKey)}</strong>
                  <q>{f.quote}</q>
                </li>
              ))}
            </ul>
          ) : (
            <p className="asx-muted">{t("ai.scam.clean")}</p>
          )}
          {card.universities.length > 0 && (
            <>
              <p className="asx-sub">{t("ai.scam.universities")}</p>
              <ul className="asx-facts">
                {card.universities.map((u) => (
                  <li key={u.name}>
                    {u.found && u.slug ? (
                      <>
                        <Link href={universityHref(u.slug)} className="asx-link">
                          {u.name}
                        </Link>{" "}
                        <span className="asx-ok">· {t("ai.scam.found")}</span>
                      </>
                    ) : (
                      <>
                        {u.name} <span className="asx-warn">· {t("ai.scam.missing")}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      );
  }
}
