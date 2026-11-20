"use client";
/* The practice form, laid out like the portal it copies (our own design, no
 * logos): Common App's tab row and section list with check circles, the UCAS
 * Hub with "section completed" ticks, a step wizard for uni-assist and other
 * European portals, or a plain section list. Every layout ends on a review
 * step that lists what is missing before the practice "Submit". */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Eraser, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { countText } from "@/lib/essay-types";
import { useI18n, type Translate } from "../i18n";
import { cn } from "@/lib/utils";
import "./simulator.css";
import { AICheck, FieldInput, issueText } from "./field-input";
import {
  feeFor,
  filled,
  itemKey,
  portalStyle,
  sectionDone,
  sectionProgress,
  sectionsFor,
  sectionText,
  shownValue,
  valueKey,
  validate,
  type FieldDef,
  type FormContext,
  type SectionDef,
  type Values,
} from "./forms";

const SUBMITTED = "review.submitted";
const DECLARED = "review.declare";
const HUB = "hub";
/** Problems that only show once the student has tried to move on. */
const LATE = new Set(["required", "too_short", "incomplete_item", "min_items", "choose"]);

type Group = { key: string; title: string; sections: SectionDef[] };
function groupsOf(sections: SectionDef[], t: Translate): Group[] {
  const out: Group[] = [];
  for (const s of sections) {
    const title = s.groupName || (s.group ? t(s.group) : "");
    const last = out[out.length - 1];
    if (last && last.title === title) last.sections.push(s);
    else out.push({ key: s.id, title, sections: [s] });
  }
  return out;
}

function Mark({ done, n, warn }: { done: boolean; n?: number; warn?: boolean }) {
  return <span className={cn("pt-mark", done && "is-done", warn && !done && "is-warn")} aria-hidden="true">{done ? <Check /> : n ?? null}</span>;
}

export function Simulator({ ctx, values, setValues, section, setSection, title }: { ctx: FormContext; values: Values; setValues: (update: (v: Values) => Values) => void; section: string; setSection: (id: string) => void; title: string }) {
  const { t } = useI18n();
  const style = portalStyle(ctx);
  const sections = useMemo(() => sectionsFor(ctx), [ctx]);
  const issues = useMemo(() => validate(sections, values), [sections, values]);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState(false);
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [opened, setOpened] = useState<Record<string, string[]>>({});
  const [caTab, setCaTab] = useState<"dashboard" | null>(null);
  const atHub = style === "hub" && (section === "" || section === HUB);
  const index = Math.max(0, sections.findIndex((s) => s.id === section));
  const current = sections[index];
  const submitted = values[SUBMITTED] === true;
  const done = (s: SectionDef) => sectionDone(s, values, issues);
  const content = sections.filter((s) => !s.review);
  const doneCount = content.filter(done).length;

  const set = (key: string, v: string | boolean) => setValues((prev) => ({ ...prev, [key]: v, [SUBMITTED]: false }));
  const go = (id: string) => {
    setCaTab(null);
    setSection(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("sim-top")?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };
  const leave = (next: string) => {
    setTouched((s) => new Set(s).add(current.id));
    go(next);
  };
  const reviewing = current.review && !atHub;
  const issueFor = (key: string) => issues.find((i) => i.field === key && (!LATE.has(i.problem) || touched.has(i.section) || reviewing));
  const statusOf = (s: SectionDef) => {
    const p = sectionProgress(s, values, issues);
    return done(s) ? "done" : p.done > 0 ? "progress" : "empty";
  };

  /* ---------- one section's fields ---------- */
  const grid = (fields: FieldDef[], key: (f: FieldDef) => string) => (
    <div className="pt-grid">
      {fields.map((f, n) => (
        <Fragment key={key(f)}>
          {f.group && f.group !== fields[n - 1]?.group && <h4 className="pt-subhead is-group">{f.group}</h4>}
          <FieldInput field={f} name={key(f)} values={values} set={set} issue={issueFor(key(f))} />
        </Fragment>
      ))}
    </div>
  );

  const repeatBlock = (s: SectionDef) => {
    const r = s.repeat!;
    const derived = Math.max(1, ...Array.from({ length: r.count }, (_, i) => (r.fields.some((f) => values[itemKey(s.id, i, f.id)]) ? i + 1 : 0)));
    const visible = Math.min(r.count, Math.max(derived, extra[s.id] || 0));
    const nameOf = (i: number) =>
      ["position", "title", "role", "course", "name", "extra_name", "employer", "org"]
        .map((id) => (r.fields.some((f) => f.id === id) ? String(values[itemKey(s.id, i, id)] || "") : ""))
        .filter(Boolean)
        .slice(0, 2)
        .join(" · ");
    return (
      <div className="pt-repeat">
        <Accordion type="multiple" value={opened[s.id] ?? ["0"]} onValueChange={(v) => setOpened((o) => ({ ...o, [s.id]: v }))}>
          {Array.from({ length: visible }, (_, i) => {
            const complete = r.complete.every((id) => filled(r.fields.find((f) => f.id === id)!, values[itemKey(s.id, i, id)]));
            const label = nameOf(i);
            return (
              <AccordionItem key={i} value={String(i)} className="pt-item">
                <AccordionTrigger className="pt-item-head hover:no-underline">
                  <span className="pt-item-title">
                    <Mark done={complete} n={i + 1} />
                    <strong>
                      {t(r.item)} {i + 1}
                    </strong>
                    {label && <span>{label}</span>}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {grid(r.fields, (f) => itemKey(s.id, i, f.id))}
                  <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setValues((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${s.id}.${i}.`))))}>
                    <Eraser />
                    {t("app.sim.clear")}
                  </Button>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
        <div className="pt-repeat-foot">
          {visible < r.count && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setExtra((e) => ({ ...e, [s.id]: visible + 1 }));
                setOpened((o) => ({ ...o, [s.id]: [...(o[s.id] ?? ["0"]), String(visible)] }));
              }}
            >
              {t("imk.add_another", { item: t(r.item).toLowerCase() })}
            </Button>
          )}
          <span className="pt-count">{t("app.sim.of_max", { n: visible, max: r.count })}</span>
        </div>
      </div>
    );
  };

  const body = (s: SectionDef) => {
    const statementTotal = s.total ? (s.fields || []).reduce((n, f) => n + countText(String(values[valueKey(s.id, f.id)] || ""), s.total!.unit), 0) : 0;
    const lines = s.total?.lines ? (s.fields || []).reduce((n, f) => n + (String(values[valueKey(s.id, f.id)] || "").trim() ? String(values[valueKey(s.id, f.id)]).trim().split("\n").reduce((a, line) => a + Math.max(1, Math.ceil(line.length / 95)), 0) : 0), 0) : 0;
    const answered = s.choose ? (s.fields || []).filter((f) => filled(f, values[valueKey(s.id, f.id)])).length : 0;
    return (
      <>
        {s.total && (
          <div className={cn("pt-total", statementTotal > s.total.max && "is-over")} aria-live="polite">
            <span>{t("app.sim.total", { n: statementTotal.toLocaleString(), max: s.total.max.toLocaleString() })}</span>
            {s.total.lines ? <span>{t("imk.lines", { n: lines, max: s.total.lines })}</span> : null}
            <span className="pt-total-bar"><i style={{ width: Math.min(100, (statementTotal / s.total.max) * 100) + "%" }} /></span>
          </div>
        )}
        {s.choose && (
          <div className={cn("pt-total", answered > s.choose && "is-over")} aria-live="polite">
            <span>{t("imk.answered", { n: answered, max: s.choose })}</span>
          </div>
        )}
        {s.repeat && repeatBlock(s)}
        {(s.fields || []).length > 0 && grid(s.fields!, (f) => valueKey(s.id, f.id))}
      </>
    );
  };

  /* ---------- review and submit ---------- */
  const review = () => {
    const blocking = issues.length > 0;
    const fee = feeFor(ctx);
    const all = content.map((s) => `## ${t(s.title)}\n${sectionText(s, values, t)}`).join("\n\n");
    return (
      <div className="pt-review">
        <p className="pt-intro">{t(blocking ? "imk.review.missing" : "imk.review.ready", { n: issues.length })}</p>
        <ul className="pt-checklist">
          {content.map((s) => {
            const own = issues.filter((i) => i.section === s.id);
            return (
              <li key={s.id} className={cn(own.length && "has-issues")}>
                <div className="pt-check-row">
                  <Mark done={done(s)} warn={own.length > 0} />
                  <span className="pt-check-title">
                    {s.groupName && <small>{s.groupName}</small>}
                    {t(s.title)}
                  </span>
                  <span className="pt-check-state">{own.length ? t("ws.sim.to_fix", { n: own.length }) : t("imk.status.done")}</span>
                  <button type="button" className="pt-link" onClick={() => go(s.id)}>
                    {t("imk.edit")}
                  </button>
                </div>
                {own.length > 0 && (
                  <ul className="pt-issues">
                    {own.slice(0, 6).map((i) => (
                      <li key={i.field + i.problem}>
                        {t(i.label)}
                        {i.item ? ` ${i.item}` : ""} — {issueText(i, t)}
                      </li>
                    ))}
                    {own.length > 6 && <li>{t("imk.more", { n: own.length - 6 })}</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {fee && (
          <div className="pt-fee">
            <span>{t("imk.fee")}</span>
            <strong>{fee.amount}</strong>
            {fee.note && <small>{t(fee.note)}</small>}
          </div>
        )}
        {submitted ? (
          <p className="pt-done" role="status">
            <Check aria-hidden="true" />
            {t("app.sim.submitted")}
          </p>
        ) : (
          <>
            <label className="pt-declare">
              <Checkbox checked={values[DECLARED] === true} onCheckedChange={(c) => setValues((p) => ({ ...p, [DECLARED]: c === true }))} />
              <span>{t("imk.declare")}</span>
            </label>
            <div className="pt-actions">
              <Button type="button" variant="ghost" onClick={() => setPreview(true)}>
                <FileText />
                {t("ws.sim.preview")}
              </Button>
              <Button
                type="button"
                className="pt-submit"
                disabled={blocking || values[DECLARED] !== true}
                onClick={() => {
                  setValues((p) => ({ ...p, [SUBMITTED]: true }));
                  toast.success(t("app.sim.submitted"));
                }}
              >
                {t("imk.submit")}
              </Button>
            </div>
            {blocking && <p className="pt-hint">{t("imk.review.locked")}</p>}
          </>
        )}
        <div className="pt-ai">
          <AICheck mode="application_review" text={all} />
        </div>
      </div>
    );
  };

  /* ---------- main panel ---------- */
  const nextId = sections[index + 1]?.id;
  const main = (
    <section className="pt-main" aria-labelledby="sim-section-title">
      {style === "hub" && (
        <button type="button" className="pt-crumb" onClick={() => go(HUB)}>
          <ArrowLeft aria-hidden="true" />
          {t("imk.hub.back")}
        </button>
      )}
      <header className="pt-head">
        {current.groupName && <small>{current.groupName}</small>}
        <h3 id="sim-section-title">{t(current.title)}</h3>
        {current.intro && <p>{t(current.intro)}</p>}
        {!current.review && <span className="pt-legend">{t("imk.required_legend")}</span>}
      </header>
      {current.review ? review() : body(current)}
      {!current.review && (
        <div className="pt-nav-foot">
          {style === "hub" ? (
            <Button type="button" className="ml-auto" onClick={() => leave(HUB)}>
              {t("imk.hub.save")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => go(sections[index - 1].id)} disabled={index === 0}>
                <ArrowLeft />
                {t("app.sim.back")}
              </Button>
              {nextId && (
                <Button type="button" className="ml-auto" onClick={() => leave(nextId)}>
                  {t(style === "common-app" ? "imk.continue" : "ws.sim.save_next")}
                  <ArrowRight />
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );

  /* ---------- section navigation ---------- */
  const navList = (list: SectionDef[]) => (
    <nav className="pt-side" aria-label={t("app.sim.sections")}>
      {groupsOf(list, t).map((grp) => {
        const all = grp.sections.filter((s) => !s.review);
        const groupDone = all.length > 0 && all.every(done);
        // As in the portal, only the open group lists its pages.
        const open = !grp.title || grp.sections.some((s) => s.id === current.id) || grp.sections.every((s) => s.review);
        return (
          <div key={grp.key} className={cn("pt-side-group", open && "is-open")}>
            {grp.title && (
              <button type="button" className="pt-side-head" aria-expanded={open} onClick={() => go(grp.sections[0].id)}>
                {all.length > 0 ? <Mark done={groupDone} /> : null}
                <span>{grp.title}</span>
              </button>
            )}
            {(open ? grp.sections : []).map((s) => (
              <button key={s.id} type="button" className={cn("pt-side-item", grp.title && "is-sub", s.id === current.id && !atHub && "is-on")} aria-current={s.id === current.id ? "step" : undefined} onClick={() => go(s.id)}>
                {!s.review ? <Mark done={done(s)} warn={touched.has(s.id) && issues.some((i) => i.section === s.id)} /> : <ChevronRight className="pt-side-chev" aria-hidden="true" />}
                <span>{t(s.title)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
  const phonePicker = (list: SectionDef[]) => (
    <div className="pt-phone">
      <select className="pt-phone-select" value={current.id} onChange={(e) => go(e.target.value)} aria-label={t("app.sim.sections")}>
        {groupsOf(list, t).map((grp) => {
          const options = grp.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {(done(s) ? "✓ " : "") + t(s.title)}
            </option>
          ));
          return grp.title ? (
            <optgroup key={grp.key} label={grp.title}>
              {options}
            </optgroup>
          ) : (
            <Fragment key={grp.key}>{options}</Fragment>
          );
        })}
      </select>
    </div>
  );
  const progress = (
    <div className="pt-progress">
      <span className="pt-progress-bar" role="progressbar" aria-valuenow={Math.round(content.length ? (doneCount / content.length) * 100 : 0)} aria-valuemin={0} aria-valuemax={100} aria-label={t("app.sim.progress")}>
        <i style={{ width: (content.length ? (doneCount / content.length) * 100 : 0) + "%" }} />
      </span>
      <span className="pt-progress-text">{t("imk.progress", { n: doneCount, max: content.length })}</span>
    </div>
  );

  let layout: ReactNode;
  if (style === "common-app") {
    const tab = caTab ?? current.tab ?? "common";
    const inTab = sections.filter((s) => (s.tab ?? "common") === tab);
    const firstOf = (x: "common" | "colleges") => sections.find((s) => s.tab === x)!.id;
    const colleges = ctx.universities;
    layout = (
      <>
        <div className="pt-tabs" role="tablist">
          {(
            [
              ["dashboard", "imk.ca.tab.dashboard"],
              ["colleges", "imk.ca.tab.colleges"],
              ["common", "imk.ca.tab.common"],
            ] as const
          ).map(([id, key]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={cn("pt-tab", tab === id && "is-on")} onClick={() => (id === "dashboard" ? setCaTab("dashboard") : go(firstOf(id)))}>
              {t(key)}
            </button>
          ))}
        </div>
        {tab === "dashboard" ? (
          <div className="pt-dash">
            <div className="pt-dash-row is-head">
              <span>{t("imk.ca.dash.college")}</span>
              <span>{t("imk.ca.dash.common")}</span>
              <span>{t("imk.ca.dash.questions")}</span>
              <span>{t("imk.ca.dash.status")}</span>
            </div>
            {colleges.map((u) => {
              const own = sections.filter((s) => s.groupName === u.name);
              const ownDone = own.filter(done).length;
              const commonDone = sections.filter((s) => s.tab === "common").every(done);
              return (
                <button key={u.id} type="button" className="pt-dash-row" onClick={() => go(own[0]?.id || firstOf("colleges"))}>
                  <strong>{u.name}</strong>
                  <span><Mark done={commonDone} /> {commonDone ? t("imk.status.done") : t("imk.status.progress")}</span>
                  <span className="pt-num">{ownDone} / {own.length}</span>
                  <span className={cn("pt-chip", submitted && "is-ok")}>{submitted ? t("imk.status.submitted") : t("imk.status.not_submitted")}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            {progress}
            {phonePicker(inTab)}
            <div className="pt-body">
              {navList(inTab)}
              {main}
            </div>
          </>
        )}
      </>
    );
  } else if (style === "hub") {
    layout = atHub ? (
      <div className="pt-hub">
        <header className="pt-head">
          <h3 id="sim-section-title">{t("imk.hub.title")}</h3>
          <p>{t("imk.hub.lead")}</p>
        </header>
        {progress}
        <ul className="pt-hub-list">
          {sections.map((s) => {
            const st = s.review ? null : statusOf(s);
            const locked = s.review && doneCount < content.length;
            return (
              <li key={s.id}>
                <button type="button" className={cn("pt-hub-row", s.review && "is-pay")} onClick={() => go(s.id)}>
                  <span className="pt-hub-title">{t(s.title)}</span>
                  {st && <span className={cn("pt-chip", st === "done" && "is-ok")}>{st === "done" && <Check aria-hidden="true" />}{t(st === "done" ? "imk.status.completed" : st === "progress" ? "imk.status.progress" : "imk.status.empty")}</span>}
                  {s.review && <span className="pt-chip">{t(locked ? "imk.hub.locked" : "imk.hub.ready")}</span>}
                  <ChevronRight className="pt-hub-chev" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : (
      main
    );
  } else if (style === "wizard") {
    layout = (
      <>
        <ol className="pt-steps" aria-label={t("app.sim.sections")}>
          {sections.map((s, n) => (
            <li key={s.id} className={cn(s.id === current.id && "is-on", done(s) && "is-done")}>
              <button type="button" onClick={() => go(s.id)} aria-current={s.id === current.id ? "step" : undefined}>
                <Mark done={done(s)} n={n + 1} warn={touched.has(s.id) && issues.some((i) => i.section === s.id)} />
                <span>{t(s.title)}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="pt-steps-phone">
          <span>{t("imk.step", { n: index + 1, max: sections.length })}</span>
          <strong>{t(current.title)}</strong>
          <span className="pt-progress-bar"><i style={{ width: ((index + 1) / sections.length) * 100 + "%" }} /></span>
        </div>
        {main}
      </>
    );
  } else {
    layout = (
      <>
        {progress}
        {phonePicker(sections)}
        <div className="pt-body">
          {navList(sections)}
          {main}
        </div>
      </>
    );
  }

  return (
    <div className={"pt pt--" + style} id="sim-top">
      {layout}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("ws.sim.preview.title")}</DialogTitle>
            <DialogDescription className="sr-only">{t("ws.sim.preview.note")}</DialogDescription>
          </DialogHeader>
          <ApplicationPreview sections={content} values={values} title={title} />
          <div className="flex justify-end">
            <Button type="button" onClick={() => window.print()}>
              <Printer />
              {t("ws.sim.print")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A document-style copy of every answer, for reading through before
 * "submitting" and for printing or saving as PDF. */
function ApplicationPreview({ sections, values, title }: { sections: SectionDef[]; values: Values; title: string }) {
  const { t } = useI18n();
  const row = (f: FieldDef, key: string) => {
    if (f.id === "complete") return null;
    const v = shownValue(f, values[key], t);
    const long = f.type === "essay" || f.type === "textarea";
    return (
      <div key={key} className={cn("sim-doc-row", long && "is-long")}>
        <dt>{t(f.label)}</dt>
        <dd className={v ? undefined : "is-blank"}>{v ?? t("ws.sim.blank")}</dd>
      </div>
    );
  };
  const used = (s: SectionDef) => Array.from({ length: s.repeat!.count }, (_, i) => i).filter((i) => s.repeat!.fields.some((f) => values[itemKey(s.id, i, f.id)]));
  return (
    <article className="sim-print sim-doc">
      <header>
        <strong>{title}</strong>
        <small>{t("ws.sim.preview.note")}</small>
      </header>
      {sections.map((s) => (
        <section key={s.id}>
          <h3>{(s.groupName ? s.groupName + " · " : "") + t(s.title)}</h3>
          {s.repeat &&
            (used(s).length ? (
              used(s).map((i) => (
                <dl key={i} className="sim-doc-item">
                  <p>
                    {t(s.repeat!.item)} {i + 1}
                  </p>
                  {s.repeat!.fields.map((f) => row(f, itemKey(s.id, i, f.id)))}
                </dl>
              ))
            ) : (
              <p className="sim-doc-empty">{t("ws.sim.blank")}</p>
            ))}
          {(s.fields || []).some((f) => f.id !== "complete") && (
            <dl>
              {(s.fields || []).map((f, n, all) => (
                <Fragment key={f.id}>
                  {f.group && f.group !== all[n - 1]?.group && <p className="sim-doc-group">{f.group}</p>}
                  {row(f, valueKey(s.id, f.id))}
                </Fragment>
              ))}
            </dl>
          )}
        </section>
      ))}
    </article>
  );
}

