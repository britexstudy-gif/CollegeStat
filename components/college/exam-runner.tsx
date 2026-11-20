"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  Bookmark,
  Calculator as CalcIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Flag,
  Highlighter,
  Info,
  X,
} from "lucide-react";
import type { Exam, Mock, Question } from "@/lib/certificates";
import { LETTERS, isCorrect, math } from "@/lib/exam-text";
import { evaluate, formatResult } from "@/lib/calculator";
import { saveAttempt, scoreAttempt, type MockAttempt } from "@/lib/exam-score";
import { ROUTE_CUT, estimateSection, type SatTest } from "@/lib/test-prep/sat-adaptive";
import { HighlightButton, Marked, useHighlighter } from "@/components/test-prep/highlight";
import { ListenButton } from "@/components/test-prep/listen-button";
import { recordActivity } from "@/lib/progress-store";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "./i18n";
import "./exam-runner.css";

type Phase = "intro" | "module" | "review" | "between" | "results";
type Answers = Record<string, string | number>;

const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;

/** A full-screen, timed test laid out like Bluebook: section and module in
 * the top bar, the clock in the middle, tools on the right, a question map
 * along the bottom. With `sat`, the second module adapts to Module 1, as on
 * the Digital SAT. `review` reopens a saved attempt at its score report. */
export function ExamRunner({
  exam,
  mock,
  questions: given,
  sat,
  review,
  onExit,
  onAnswer,
}: {
  exam: Exam;
  mock: Mock;
  questions: Question[];
  sat?: SatTest;
  review?: MockAttempt;
  onExit: () => void;
  onAnswer?: (results: { id: string; correct: boolean }[]) => void;
}) {
  const t = useT();
  const [leaving, setLeaving] = useState(false);
  const [route, setRoute] = useState<"hard" | "easy" | null>(review?.route ?? null);
  const modules = useMemo(() => {
    if (sat) return [sat.modules.m1, route === "easy" ? sat.modules.easy : sat.modules.hard];
    if (exam.slug === "sat" && mock.kind === "full" && given.length >= 20) {
      const half = Math.ceil(given.length / 2);
      return [given.slice(0, half), given.slice(half)];
    }
    return [given];
  }, [sat, route, exam.slug, mock.kind, given]);
  const questions = useMemo(() => (sat ? modules.flat() : given), [sat, modules, given]);
  const perModule = sat ? sat.perModule : Math.round((mock.minutes * 60) / modules.length);
  const isMath = questions.some((q) => q.section === "math" || /quant|math|calculus|statistic/i.test(q.section || ""));
  const isRW = questions[0]?.section === "reading_writing";
  const sectionName =
    questions[0]?.section === "reading_writing"
      ? t("ct.sec.reading_writing")
      : questions[0]?.section === "math"
        ? t("ct.sec.math")
        : mock.title;
  const sectionNo = isMath && sat ? 2 : 1;
  const hl = useHighlighter();

  const [phase, setPhase] = useState<Phase>(review ? "results" : "intro");
  const [mod, setMod] = useState(0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(review?.answers || {});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [crossed, setCrossed] = useState<Record<string, number[]>>({});
  const [eliminate, setEliminate] = useState(false);
  const [left, setLeft] = useState(perModule);
  const [hideTimer, setHideTimer] = useState(false);
  const [tool, setTool] = useState<null | "calc" | "ref" | "nav" | "help" | "annotate">(null);
  const [attempt, setAttempt] = useState<MockAttempt | null>(review ?? null);
  const started = useRef(0);

  const list = modules[mod];
  const q = list[index];
  const finishRef = useRef<() => void>(() => {});

  const finishModule = useCallback(() => {
    setTool(null);
    hl.dismiss();
    if (mod < modules.length - 1) {
      if (sat && mod === 0) {
        // Route Module 2 the way the Digital SAT does: on Module 1 performance.
        const right = sat.modules.m1.filter((x) => isCorrect(x, answers[x.id])).length;
        setRoute(right >= ROUTE_CUT[sat.section] ? "hard" : "easy");
      }
      setPhase("between");
      return;
    }
    const seconds = Math.round((Date.now() - started.current) / 1000);
    const scored = scoreAttempt(exam.slug, mock, questions, answers, seconds);
    const result: MockAttempt = sat
      ? { ...scored, ref: sat.id, kind: "test", route: route ?? "hard", scaled: estimateSection(route ?? "hard", scored.correct, scored.total), answers }
      : { ...scored, answers };
    saveAttempt(exam.slug, result);
    onAnswer?.(
      questions
        .filter((x) => answers[x.id] !== undefined && answers[x.id] !== "")
        .map((x) => ({ id: x.id, correct: isCorrect(x, answers[x.id]) })),
    );
    void recordActivity("practice", mock.id);
    setAttempt(result);
    setPhase("results");
  }, [mod, modules.length, exam.slug, mock, questions, answers, onAnswer, sat, route, hl]);
  useEffect(() => {
    finishRef.current = finishModule;
  }, [finishModule]);

  // One clock per module; when it runs out the module is submitted.
  useEffect(() => {
    if (phase !== "module" && phase !== "review") return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if ((phase === "module" || phase === "review") && left <= 0) queueMicrotask(() => finishRef.current());
  }, [left, phase]);

  // Keyboard: A–D choose, ←/→ move.
  useEffect(() => {
    if (phase !== "module") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(list.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (q?.options && /^[a-d]$/i.test(e.key)) {
        const n = e.key.toLowerCase().charCodeAt(0) - 97;
        if (n < q.options.length) setAnswers((a) => ({ ...a, [q.id]: n }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, list.length, q]);

  // Lock page scroll behind the exam.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const answered = (x: Question) => answers[x.id] !== undefined && answers[x.id] !== "";
  const toggleCross = (n: number) =>
    setCrossed((c) => {
      const cur = c[q.id] || [];
      return { ...c, [q.id]: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n] };
    });

  if (phase === "intro")
    return (
      <div className="ex ex-screen" role="dialog" aria-modal="true" aria-label={mock.title}>
        <div className="ex-intro">
          <span className="ex-badge">{exam.short}</span>
          <h1>{mock.title}</h1>
          <dl className="ex-facts">
            <div>
              <dt>{t("ct.ex.questions")}</dt>
              <dd>{questions.length}</dd>
            </div>
            <div>
              <dt>{t("ct.ex.time")}</dt>
              <dd>{t("ct.min", { n: mock.minutes })}</dd>
            </div>
            <div>
              <dt>{t("ct.ex.modules")}</dt>
              <dd>{modules.length}</dd>
            </div>
          </dl>
          <ul className="ex-rules">
            <li>{t("ct.ex.rule_timer")}</li>
            <li>{t("ct.ex.rule_mark")}</li>
            <li>{t("ct.ex.rule_abc")}</li>
            {isMath && <li>{exam.slug === "sat" ? t("ct.ex.rule_calc_ref") : t("ct.ex.rule_calc")}</li>}
            <li>{t("ct.ex.rule_keys")}</li>
          </ul>
          <p className="ex-fine">{t("ct.ex.fine")}</p>
          <div className="ex-intro-actions">
            <Button variant="outline" onClick={onExit}>
              {t("ct.ex.not_now")}
            </Button>
            <Button
              onClick={() => {
                started.current = Date.now();
                setLeft(perModule);
                setPhase("module");
              }}
            >
              {t("ct.ex.start")}
            </Button>
          </div>
        </div>
      </div>
    );

  if (phase === "between")
    return (
      <div className="ex ex-screen" role="dialog" aria-modal="true" aria-label={t("ct.ex.mod_done", { n: mod + 1 })}>
        <div className="ex-intro">
          <span className="ex-check">
            <Check size={26} aria-hidden="true" />
          </span>
          <h1>{t("ct.ex.mod_done", { n: mod + 1 })}</h1>
          <p>{t("ct.ex.mod_next", { n: mod + 2, q: modules[mod + 1].length, m: Math.round(perModule / 60), prev: mod + 1 })}</p>
          {sat && route && <p className="ex-fine">{route === "hard" ? t("pr.sat.route_hard") : t("pr.sat.route_easy")}</p>}
          <div className="ex-intro-actions">
            <Button
              onClick={() => {
                setMod((m) => m + 1);
                setIndex(0);
                setLeft(perModule);
                setPhase("module");
              }}
            >
              {t("ct.ex.start_mod", { n: mod + 2 })}
            </Button>
          </div>
        </div>
      </div>
    );

  if (phase === "results" && attempt)
    return <ExamResults exam={exam} mock={mock} questions={questions} answers={answers} attempt={attempt} onExit={onExit} />;

  const low = left <= 300;
  const hasPane = !!(q?.passage || q?.table);

  return (
    <div className="ex" role="dialog" aria-modal="true" aria-label={mock.title}>
      <header className="ex-top">
        <div className="ex-top-l">
          <strong>
            {sat ? `${t("pr.sat.section", { n: sectionNo })}, ` : ""}
            {modules.length > 1 ? `${t("ct.ex.module", { n: mod + 1 })}: ` : ""}
            {sectionName}
          </strong>
          <button type="button" className="ex-link" onClick={() => setTool(tool === "help" ? null : "help")}>
            {t("ct.ex.directions")} <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
        <div className={"ex-timer" + (low ? " is-low" : "")} aria-live={low ? "polite" : "off"}>
          {hideTimer ? <Clock size={18} aria-label={t("ct.ex.timer_hidden")} /> : <span>{fmtTime(left)}</span>}
          <button type="button" className="ex-mini" onClick={() => setHideTimer((h) => !h)}>
            {hideTimer ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
            {hideTimer ? t("ct.ex.show") : t("ct.ex.hide")}
          </button>
        </div>
        <div className="ex-top-r">
          {isRW && (
            <button
              type="button"
              className={"ex-tool" + (tool === "annotate" ? " is-on" : "")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (hl.pending ? hl.add() : setTool(tool === "annotate" ? null : "annotate"))}
            >
              <Highlighter size={18} aria-hidden="true" />
              <span>{t("pr.sat.annotate")}</span>
            </button>
          )}
          {isMath && (
            <button
              type="button"
              className={"ex-tool" + (tool === "calc" ? " is-on" : "")}
              onClick={() => setTool(tool === "calc" ? null : "calc")}
            >
              <CalcIcon size={18} aria-hidden="true" />
              <span>{t("ct.ex.calculator")}</span>
            </button>
          )}
          {isMath && exam.slug === "sat" && (
            <button
              type="button"
              className={"ex-tool" + (tool === "ref" ? " is-on" : "")}
              onClick={() => setTool(tool === "ref" ? null : "ref")}
            >
              <BookMarked size={18} aria-hidden="true" />
              <span>{t("ct.ex.reference")}</span>
            </button>
          )}
          <button type="button" className="ex-tool" onClick={() => setLeaving(true)}>
            <X size={18} aria-hidden="true" />
            <span>{t("ct.ex.exit")}</span>
          </button>
        </div>
      </header>
      <div className="ex-dash" aria-hidden="true" />

      {tool === "help" && (
        <div className="ex-pop ex-help" role="dialog" aria-label={t("ct.ex.directions")}>
          <p>{isMath ? t("ct.ex.help_math") : t("ct.ex.help_read")}</p>
          <Button variant="outline" size="sm" onClick={() => setTool(null)}>
            {t("ct.ex.close")}
          </Button>
        </div>
      )}
      {tool === "annotate" && (
        <div className="ex-pop ex-help" role="dialog" aria-label={t("pr.sat.annotate")}>
          <p>{t("pr.sat.annotate_help")}</p>
          <Button variant="outline" size="sm" onClick={() => setTool(null)}>
            {t("ct.ex.close")}
          </Button>
        </div>
      )}
      {tool === "calc" && <ExamCalculator onClose={() => setTool(null)} graphing={exam.slug === "sat"} />}
      {tool === "ref" && <ReferenceSheet onClose={() => setTool(null)} />}

      {phase === "review" ? (
        <main className="ex-review">
          <h2>{t("ct.ex.review_title")}</h2>
          <p>{modules.length > 1 ? t("ct.ex.review_mod", { n: mod + 1 }) : t("ct.ex.review_test")}</p>
          <QuestionMap list={list} answered={answered} flags={flags} current={-1} onPick={(i) => { setIndex(i); setPhase("module"); }} />
        </main>
      ) : (
        <main className={"ex-main" + (hasPane ? " has-pane" : "")} onMouseUp={hl.onMouseUp}>
          {hasPane && (
            <section className="ex-pane" aria-label={t("ct.ex.passage")}>
              {q.passage && /^Transcript:/i.test(q.passage) ? (
                <ListenButton key={q.id} text={q.passage} />
              ) : q.passage && <Marked as="div" className="ex-passage" id={q.id} text={q.passage.replace(/\s(Text 2)\b/, "\n\n$1")} marks={hl.marks[q.id]} onRemove={hl.remove} />}
              {q.table && (
                <table className="ex-table">
                  {q.table.caption && <caption>{q.table.caption}</caption>}
                  <thead>
                    <tr>
                      {q.table.columns.map((c, i) => (
                        <th key={i} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.table.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td key={j}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          <section className="ex-q" aria-label={t("ct.ex.question", { n: index + 1 })}>
            <div className="ex-qbar">
              <span className="ex-num">{index + 1}</span>
              <button
                type="button"
                className={"ex-flag" + (flags[q.id] ? " is-on" : "")}
                aria-pressed={!!flags[q.id]}
                onClick={() => setFlags((f) => ({ ...f, [q.id]: !f[q.id] }))}
              >
                <Bookmark size={15} aria-hidden="true" fill={flags[q.id] ? "currentColor" : "none"} />
                {t("ct.ex.mark")}
              </button>
              {q.options && (
                <button
                  type="button"
                  className={"ex-abc" + (eliminate ? " is-on" : "")}
                  aria-pressed={eliminate}
                  title={t("ct.ex.cross_out")}
                  onClick={() => setEliminate((v) => !v)}
                >
                  <s>ABC</s>
                </button>
              )}
            </div>
            <Marked className="ex-prompt" id={q.id + ":q"} text={math(q.prompt)} marks={hl.marks[q.id + ":q"]} onRemove={hl.remove} />
            {q.options ? (
              <ol className="ex-options">
                {q.options.map((opt, n) => {
                  const out = (crossed[q.id] || []).includes(n);
                  const chosen = answers[q.id] === n;
                  return (
                    <li key={n} className={(chosen ? "is-chosen " : "") + (out ? "is-out" : "")}>
                      <button
                        type="button"
                        className="ex-option"
                        aria-pressed={chosen}
                        onClick={() => {
                          setAnswers((a) => ({ ...a, [q.id]: n }));
                          if (out) toggleCross(n);
                        }}
                      >
                        <span className="ex-letter">{LETTERS[n]}</span>
                        <span>{math(opt)}</span>
                      </button>
                      {eliminate && (
                        <button
                          type="button"
                          className="ex-strike"
                          aria-label={out ? t("ct.ex.undo_cross", { l: LETTERS[n] }) : t("ct.ex.cross", { l: LETTERS[n] })}
                          onClick={() => toggleCross(n)}
                        >
                          {out ? t("ct.ex.undo") : <s>{LETTERS[n]}</s>}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <label className="ex-grid">
                <span>{t("ct.run.your_answer")}</span>
                <input
                  inputMode="decimal"
                  maxLength={7}
                  value={String(answers[q.id] ?? "")}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value.replace(/[^0-9./-]/g, "") }))}
                  placeholder={t("ct.ex.grid_hint")}
                />
                <small>{t("ct.ex.preview", { a: String(answers[q.id] ?? "") || "—" })}</small>
              </label>
            )}
          </section>
        </main>
      )}

      {tool === "nav" && phase === "module" && (
        <div className="ex-pop ex-navpop" role="dialog" aria-label={t("ct.ex.map")}>
          <header>
            <strong>{modules.length > 1 ? `${t("ct.ex.module", { n: mod + 1 })}: ` : ""}{sectionName}</strong>
            <button type="button" className="ex-mini" onClick={() => setTool(null)} aria-label={t("ct.ex.close")}>
              <X size={14} aria-hidden="true" />
            </button>
          </header>
          <QuestionMap
            list={list}
            answered={answered}
            flags={flags}
            current={index}
            onPick={(i) => {
              setIndex(i);
              setTool(null);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => { setTool(null); setPhase("review"); }}>
            {t("ct.ex.go_review")}
          </Button>
        </div>
      )}

      <HighlightButton pending={hl.pending} onAdd={hl.add} />
      <footer className="ex-foot">
        <span className="ex-name">{exam.name}</span>
        {phase === "module" ? (
          <button type="button" className="ex-qnav" onClick={() => setTool(tool === "nav" ? null : "nav")}>
            {t("ct.ex.q_of", { n: index + 1, total: list.length })} <ChevronDown size={14} aria-hidden="true" />
          </button>
        ) : (
          <span />
        )}
        <div className="ex-foot-r">
          {phase === "review" ? (
            <>
              <Button variant="outline" onClick={() => setPhase("module")}>
                <ChevronLeft aria-hidden="true" /> {t("ct.run.back")}
              </Button>
              <Button onClick={finishModule}>{modules.length > 1 ? t("ct.ex.submit_mod", { n: mod + 1 }) : t("ct.ex.submit")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                {t("ct.run.back")}
              </Button>
              <Button onClick={() => (index < list.length - 1 ? setIndex((i) => i + 1) : setPhase("review"))}>
                {t("ct.run.next")} <ChevronRight aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </footer>

      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ct.ex.leave_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("ct.ex.leave_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("ct.ex.stay")}</AlertDialogCancel>
            <AlertDialogAction onClick={onExit}>{t("ct.ex.leave")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuestionMap({
  list,
  answered,
  flags,
  current,
  onPick,
}: {
  list: Question[];
  answered: (q: Question) => boolean;
  flags: Record<string, boolean>;
  current: number;
  onPick: (i: number) => void;
}) {
  const t = useT();
  return (
    <>
      <div className="ex-legend" aria-hidden="true">
        <span><i className="is-cur" /> {t("ct.ex.current")}</span>
        <span><i /> {t("ct.ex.unanswered")}</span>
        <span><i className="is-done" /> {t("ct.ex.answered")}</span>
        <span><Flag size={12} /> {t("ct.ex.for_review")}</span>
      </div>
      <ol className="ex-map">
        {list.map((x, i) => (
          <li key={x.id}>
            <button
              type="button"
              className={(answered(x) ? "is-done " : "") + (i === current ? "is-cur" : "")}
              onClick={() => onPick(i)}
              aria-label={`${t("ct.ex.question", { n: i + 1 })}, ${answered(x) ? t("ct.ex.answered") : t("ct.ex.unanswered")}${flags[x.id] ? `, ${t("ct.ex.for_review")}` : ""}`}
            >
              {i + 1}
              {flags[x.id] && <Flag size={10} className="ex-mapflag" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "^", "+", "(", ")", "π", "√("];

/** Bluebook embeds the Desmos graphing calculator; Desmos publishes the same
 * calculator for College Board practice at this public address. */
const DESMOS = "https://www.desmos.com/testing/collegeboard/graphing";

function ExamCalculator({ onClose, graphing }: { onClose: () => void; graphing?: boolean }) {
  const t = useT();
  const [mode, setMode] = useState<"graph" | "basic">(graphing ? "graph" : "basic");
  if (graphing && mode === "graph")
    return (
      <div className="ex-pop ex-calc is-desmos" role="dialog" aria-label={t("ct.ex.calculator")}>
        <header>
          <strong>{t("ct.ex.calculator")}</strong>
          <div className="ex-seg">
            <button type="button" aria-pressed onClick={() => setMode("graph")}>{t("pr.sat.graphing")}</button>
            <button type="button" aria-pressed={false} onClick={() => setMode("basic")}>{t("pr.sat.basic")}</button>
          </div>
          <button type="button" className="ex-mini" onClick={onClose} aria-label={t("ct.ex.close")}>
            <X size={14} aria-hidden="true" />
          </button>
        </header>
        <iframe src={DESMOS} title="Desmos" className="ex-desmos" loading="lazy" referrerPolicy="no-referrer" />
        <a className="ex-fine" href={DESMOS} target="_blank" rel="noreferrer">
          {t("pr.sat.desmos_open")}
        </a>
      </div>
    );
  return <BasicCalculator onClose={onClose} onGraph={graphing ? () => setMode("graph") : undefined} />;
}

function BasicCalculator({ onClose, onGraph }: { onClose: () => void; onGraph?: () => void }) {
  const t = useT();
  const [expr, setExpr] = useState("");
  const [deg, setDeg] = useState(false);
  const [history, setHistory] = useState<{ e: string; r: string }[]>([]);
  const [error, setError] = useState("");
  const run = () => {
    try {
      const r = formatResult(evaluate(expr, { degrees: deg }));
      setHistory((h) => [{ e: expr, r }, ...h].slice(0, 6));
      setExpr(r);
      setError("");
    } catch {
      setError(t("ct.ex.calc_error"));
    }
  };
  return (
    <div className="ex-pop ex-calc" role="dialog" aria-label={t("ct.ex.calculator")}>
      <header>
        <strong>{t("ct.ex.calculator")}</strong>
        {onGraph && (
          <div className="ex-seg">
            <button type="button" aria-pressed={false} onClick={onGraph}>{t("pr.sat.graphing")}</button>
            <button type="button" aria-pressed>{t("pr.sat.basic")}</button>
          </div>
        )}
        <div className="ex-seg">
          <button type="button" aria-pressed={!deg} onClick={() => setDeg(false)}>Rad</button>
          <button type="button" aria-pressed={deg} onClick={() => setDeg(true)}>Deg</button>
        </div>
        <button type="button" className="ex-mini" onClick={onClose} aria-label={t("ct.ex.close")}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      <ul className="ex-calc-hist" aria-label={t("ct.ex.history")}>
        {history.map((h, i) => (
          <li key={i}>
            <button type="button" onClick={() => setExpr(h.r)}>
              <span>{h.e}</span> = <b>{h.r}</b>
            </button>
          </li>
        ))}
      </ul>
      <input
        className="ex-calc-in"
        value={expr}
        autoFocus
        aria-label={t("ct.ex.expression")}
        onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && run()}
      />
      {error && <p className="ex-calc-err">{error}</p>}
      <div className="ex-keys">
        {["sin(", "cos(", "tan(", "ln("].map((k) => (
          <button key={k} type="button" className="is-fn" onClick={() => setExpr((x) => x + k)}>
            {k.replace("(", "")}
          </button>
        ))}
        {KEYS.map((k) => (
          <button key={k} type="button" className={/[÷×−+^]/.test(k) ? "is-op" : undefined} onClick={() => setExpr((x) => x + k)}>
            {k === "√(" ? "√" : k}
          </button>
        ))}
        <button type="button" className="is-fn" onClick={() => setExpr("")}>AC</button>
        <button type="button" className="is-fn" onClick={() => setExpr((x) => x.slice(0, -1))}>⌫</button>
        <button type="button" className="is-eq" onClick={run}>=</button>
      </div>
    </div>
  );
}

function ReferenceSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const items: [string, string][] = [
    [t("ct.ref.circle"), "A = πr²,  C = 2πr"],
    [t("ct.ref.rectangle"), "A = ℓw"],
    [t("ct.ref.triangle"), "A = ½bh"],
    [t("ct.ref.pythagoras"), "c² = a² + b²"],
    [t("ct.ref.special"), "30°-60°-90°: x, x√3, 2x   ·   45°-45°-90°: s, s, s√2"],
    [t("ct.ref.prism"), "V = ℓwh"],
    [t("ct.ref.cylinder"), "V = πr²h"],
    [t("ct.ref.sphere"), "V = 4⁄3 πr³"],
    [t("ct.ref.cone"), "V = 1⁄3 πr²h"],
    [t("ct.ref.pyramid"), "V = 1⁄3 ℓwh"],
  ];
  return (
    <div className="ex-pop ex-ref" role="dialog" aria-label={t("ct.ex.reference")}>
      <header>
        <strong>{t("ct.ex.reference")}</strong>
        <button type="button" className="ex-mini" onClick={onClose} aria-label={t("ct.ex.close")}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      <dl>
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p>{t("ct.ref.note")}</p>
    </div>
  );
}

function ExamResults({
  exam,
  mock,
  questions,
  answers,
  attempt,
  onExit,
}: {
  exam: Exam;
  mock: Mock;
  questions: Question[];
  answers: Answers;
  attempt: MockAttempt;
  onExit: () => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<"all" | "wrong" | "right">("wrong");
  const pct = Math.round((attempt.correct / Math.max(1, attempt.total)) * 100);
  const shown = questions.filter((x) => {
    const ok = isCorrect(x, answers[x.id]);
    return filter === "all" || (filter === "right" ? ok : !ok);
  });
  return (
    <div className="ex ex-screen ex-results" role="dialog" aria-modal="true" aria-label={t("ct.ex.report")}>
      <div className="ex-report">
        <header className="ex-report-head">
          <div>
            <span className="ex-badge">{exam.short}</span>
            <h1>{t("ct.ex.report")}</h1>
            <p>{mock.title}</p>
          </div>
          <Button onClick={onExit}>{t("ct.run.done")}</Button>
        </header>

        <section className="ex-score-cards">
          <div className="ex-score-main">
            <small>{attempt.scaled ? t("ct.ex.est_score") : t("ct.ex.score")}</small>
            <strong>{attempt.scaled ?? `${pct}%`}</strong>
            <span>{attempt.scaled ? t("ct.ex.on_scale") : t("ct.chart.correct", { a: attempt.correct, b: attempt.total })}</span>
          </div>
          <div>
            <small>{t("ct.ex.right")}</small>
            <strong>
              {attempt.correct}/{attempt.total}
            </strong>
            <span>{pct}%</span>
          </div>
          <div>
            <small>{t("ct.ex.time_used")}</small>
            <strong>{fmtTime(attempt.seconds)}</strong>
            <span>{t("ct.ex.of_min", { n: mock.minutes })}</span>
          </div>
        </section>
        {attempt.scaled && <p className="ex-fine">{t("ct.ex.est_note")}</p>}

        <section className="ex-domains" aria-label={t("ct.ex.by_topic")}>
          <h2>{t("ct.ex.by_topic")}</h2>
          {Object.entries(attempt.by_domain).map(([d, v]) => {
            const p = Math.round((v.correct / v.total) * 100);
            return (
              <div key={d} className="ex-domain">
                <span>{d}</span>
                <span className="ex-bar">
                  <i style={{ width: `${p}%` }} className={p >= 75 ? "is-good" : p >= 50 ? "is-ok" : "is-low"} />
                </span>
                <b>
                  {v.correct}/{v.total}
                </b>
              </div>
            );
          })}
        </section>

        <section className="ex-answers" aria-label={t("ct.ex.review_answers")}>
          <header>
            <h2>{t("ct.ex.review_answers")}</h2>
            <div className="ex-seg">
              {(["wrong", "right", "all"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "wrong" ? t("ct.ex.incorrect") : f === "right" ? t("ct.ex.right") : t("ct.bank.all")}
                </button>
              ))}
            </div>
          </header>
          {shown.length === 0 && <p className="ex-fine">{t("ct.ex.nothing")}</p>}
          <ol>
            {shown.map((x) => {
              const n = questions.indexOf(x) + 1;
              const ok = isCorrect(x, answers[x.id]);
              const yours = answers[x.id];
              return (
                <li key={x.id} className={ok ? "is-right" : "is-wrong"}>
                  <details>
                    <summary>
                      <span className={"ex-dot" + (ok ? " ok" : "")}>{ok ? <Check size={12} /> : <X size={12} />}</span>
                      <span className="ex-ans-q">
                        {n}. {math(x.prompt)}
                      </span>
                      <small>{x.skill || x.domain}</small>
                    </summary>
                    {x.passage && <div className="ex-passage is-small">{x.passage}</div>}
                    <p>
                      <b>{t("ct.ex.your_answer")}</b>{" "}
                      {yours === undefined || yours === ""
                        ? t("ct.ex.not_answered")
                        : x.options
                          ? `${LETTERS[Number(yours)]}. ${math(x.options[Number(yours)] || "")}`
                          : String(yours)}
                    </p>
                    <p>
                      <b>{t("ct.run.correct_answer")}</b>{" "}
                      {x.options ? `${LETTERS[x.answer ?? 0]}. ${math(x.options[x.answer ?? 0])}` : x.answer_value}
                    </p>
                    <p className="ex-expl">
                      <Info size={14} aria-hidden="true" /> {math(x.explanation)}
                    </p>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
