"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flag, Pause, Play, Volume2, X } from "lucide-react";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { saveAttempt, type MockAttempt } from "@/lib/exam-score";
import { recordActivity } from "@/lib/progress-store";
import { ieltsBand, ieltsCorrect } from "@/lib/test-prep/scoring";
import type { IeltsGroup, IeltsItem, IeltsListeningTest, IeltsReadingTest } from "@/lib/test-prep/types";
import { useT } from "@/components/college/i18n";
import { HighlightButton, Marked, useHighlighter } from "./highlight";
import { canSpeak, clock, useCountdown, useNarrator } from "./speech";
import "@/components/college/exam-runner.css";
import "./test-prep.css";

type Section = { title: string; intro: string; paragraphs?: { label?: string; text: string }[]; transcript?: { who?: string; voice?: "a" | "b"; text: string }[]; groups: IeltsGroup[] };
type Props =
  | { kind: "reading"; test: IeltsReadingTest; onExit: () => void; review?: Record<string, string | number> }
  | { kind: "listening"; test: IeltsListeningTest; onExit: () => void; review?: Record<string, string | number> };

const TFNG = ["TRUE", "FALSE", "NOT GIVEN"];
const YNNG = ["YES", "NO", "NOT GIVEN"];
const LETTERS = ["A", "B", "C", "D", "E"];

/** Computer-delivered IELTS: passage and questions side by side, a part bar
 * with every question number along the bottom, a review flag, highlighting,
 * and a single clock for the whole test. */
export function IeltsRunner(props: Props) {
  const t = useT();
  const { kind, test, onExit } = props;
  const sections: Section[] = useMemo(
    () =>
      kind === "reading"
        ? (test as IeltsReadingTest).passages.map((p, i) => ({ title: p.title, intro: t("pr.ie.read_intro", { n: i + 1 }), paragraphs: p.paragraphs, groups: p.groups }))
        : (test as IeltsListeningTest).parts.map((p) => ({ title: p.context, intro: p.context, transcript: p.transcript, groups: p.groups })),
    [kind, test, t],
  );
  const items = useMemo(() => sections.flatMap((s, si) => s.groups.flatMap((g) => g.items.map((it) => ({ it, g, si })))), [sections]);
  const total = items.length;
  const minutes = kind === "reading" ? 60 : 30;

  const [checked, setChecked] = useState(!!props.review);
  const reviewing = checked;
  const [phase, setPhase] = useState<"intro" | "test" | "done">(reviewing ? "test" : "intro");
  const [answers, setAnswers] = useState<Record<number, string>>(() => Object.fromEntries(Object.entries(props.review || {}).map(([k, v]) => [Number(k), String(v)])));
  const [flags, setFlags] = useState<Record<number, boolean>>({});
  const [part, setPart] = useState(0);
  const [current, setCurrent] = useState(items[0]?.it.n ?? 1);
  const [leaving, setLeaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [attempt, setAttempt] = useState<MockAttempt | null>(null);
  const started = useRef(0);
  const hl = useHighlighter();
  const narrator = useNarrator("en-GB");

  const finish = useCallback(() => {
    narrator.stop();
    let correct = 0;
    const by_domain: MockAttempt["by_domain"] = {};
    items.forEach(({ it, g, si }) => {
      const key = kind === "reading" ? `Passage ${si + 1}` : `Part ${si + 1}`;
      by_domain[key] ||= { correct: 0, total: 0 };
      by_domain[key].total++;
      if (ieltsCorrect(g, it, answers[it.n])) {
        correct++;
        by_domain[key].correct++;
      }
    });
    const a: MockAttempt = {
      mock_id: test.id,
      ref: test.id,
      kind: "test",
      title: (kind === "reading" ? "Reading · " : "Listening · ") + test.title,
      date: new Date().toISOString(),
      correct,
      total,
      seconds: Math.round((Date.now() - started.current) / 1000),
      scaled: null,
      band: ieltsBand(kind, correct, total),
      by_domain,
      answers,
    };
    saveAttempt("ielts", a);
    void recordActivity("practice", test.id);
    setAttempt(a);
    setPhase("done");
  }, [narrator, items, kind, answers, test, total]);

  const [left] = useCountdown(minutes * 60, phase === "test" && !reviewing, finish);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const go = (n: number) => {
    const found = items.find((x) => x.it.n === n);
    if (!found) return;
    setPart(found.si);
    setCurrent(n);
    queueMicrotask(() => document.getElementById("tp-q-" + n)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  const idx = items.findIndex((x) => x.it.n === current);
  const set = (n: number, v: string) => !reviewing && setAnswers((a) => ({ ...a, [n]: v }));

  if (phase === "intro")
    return (
      <div className="ex ex-screen tp-ie" role="dialog" aria-modal="true" aria-label={test.title}>
        <div className="ex-intro">
          <span className="ex-badge">IELTS</span>
          <h1>{kind === "reading" ? t("pr.ie.reading") : t("pr.ie.listening")} · {test.title}</h1>
          <dl className="ex-facts">
            <div>
              <dt>{t("ct.ex.questions")}</dt>
              <dd>{total}</dd>
            </div>
            <div>
              <dt>{t("ct.ex.time")}</dt>
              <dd>{t("ct.min", { n: minutes })}</dd>
            </div>
            <div>
              <dt>{kind === "reading" ? t("pr.ie.passages") : t("pr.ie.parts")}</dt>
              <dd>{sections.length}</dd>
            </div>
          </dl>
          <ul className="ex-rules">
            {kind === "reading" ? (
              <>
                <li>{t("pr.ie.rule_split")}</li>
                <li>{t("pr.ie.rule_hl")}</li>
              </>
            ) : (
              <>
                <li>{t("pr.ie.rule_audio")}</li>
                <li>{t("pr.ie.rule_once")}</li>
                {!canSpeak() && <li>{t("pr.ie.no_voice")}</li>}
              </>
            )}
            <li>{t("pr.ie.rule_flag")}</li>
            <li>{t("pr.ie.rule_case")}</li>
          </ul>
          <p className="ex-fine">{t("pr.original")}</p>
          <div className="ex-intro-actions">
            <Button variant="outline" onClick={onExit}>
              {t("ct.ex.not_now")}
            </Button>
            <Button
              onClick={() => {
                started.current = Date.now();
                setPhase("test");
              }}
            >
              {t("ct.ex.start")}
            </Button>
          </div>
        </div>
      </div>
    );

  if (phase === "done" && attempt)
    return (
      <div className="ex ex-screen tp-ie" role="dialog" aria-modal="true" aria-label={t("ct.ex.report")}>
        <div className="ex-intro tp-result">
          <span className="ex-check">
            <Check size={26} aria-hidden="true" />
          </span>
          <h1>{t("pr.ie.band_est", { band: attempt.band!.toFixed(1) })}</h1>
          <p>{t("pr.ie.raw", { a: attempt.correct, b: attempt.total })}</p>
          <dl className="ex-facts">
            {Object.entries(attempt.by_domain).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  {v.correct}/{v.total}
                </dd>
              </div>
            ))}
          </dl>
          <p className="ex-fine">{t("pr.ie.band_note")}</p>
          <div className="ex-intro-actions">
            <Button variant="outline" onClick={onExit}>
              {t("ct.run.done")}
            </Button>
            <Button
              onClick={() => {
                setChecked(true);
                setCurrent(items[0].it.n);
                setPart(0);
                setPhase("test");
              }}
            >
              {t("pr.review")}
            </Button>
          </div>
        </div>
      </div>
    );

  const showKey = reviewing;
  const sec = sections[part];
  const partItems = (si: number) => items.filter((x) => x.si === si);
  const answered = (n: number) => !!answers[n]?.trim();

  return (
    <div className="ex tp-ie" role="dialog" aria-modal="true" aria-label={test.title}>
      <header className="ex-top">
        <div className="ex-top-l">
          <span className="ex-badge">IELTS</span>
          <strong>{kind === "reading" ? t("pr.ie.reading") : t("pr.ie.listening")}</strong>
        </div>
        <div className={"ex-timer" + (!showKey && left <= 300 ? " is-low" : "")}>
          {showKey ? <span className="tp-review-tag">{t("pr.review_mode")}</span> : <span>{t("pr.ie.left", { time: clock(left) })}</span>}
        </div>
        <div className="ex-top-r">
          {!showKey && (
            <Button size="sm" onClick={() => setConfirm(true)}>
              {t("pr.ie.submit")}
            </Button>
          )}
          <button type="button" className="ex-tool" onClick={() => (showKey ? onExit() : setLeaving(true))}>
            <X size={18} aria-hidden="true" />
            <span>{showKey ? t("ct.ex.close") : t("ct.ex.exit")}</span>
          </button>
        </div>
      </header>

      <div className="tp-ie-part">
        <strong>{kind === "reading" ? t("pr.ie.passage_n", { n: part + 1 }) : t("pr.ie.part_n", { n: part + 1 })}</strong>
        <span>{kind === "reading" ? sec.intro : `${sec.intro.replace(/^Part \d+\.\s*/, "")} ${t("pr.ie.listen_intro", { a: partItems(part)[0]?.it.n ?? "", b: partItems(part).at(-1)?.it.n ?? "" })}`}</span>
      </div>

      {kind === "listening" && (
        <div className="tp-audio">
          <button
            type="button"
            className="tp-audio-btn"
            onClick={() => (narrator.playing ? narrator.stop() : narrator.play([{ text: sec.intro }, ...(sec.transcript || [])]))}
            disabled={!canSpeak()}
            aria-label={narrator.playing ? t("pr.audio.stop") : t("pr.audio.play")}
          >
            {narrator.playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <Volume2 size={15} aria-hidden="true" />
          <span className="tp-audio-track">
            <i style={{ width: `${narrator.playing ? ((narrator.index + 1) / ((sec.transcript?.length || 0) + 1)) * 100 : 0}%` }} />
          </span>
          <small>{narrator.playing ? t("pr.audio.playing", { n: part + 1 }) : canSpeak() ? t("pr.audio.ready", { n: part + 1 }) : t("pr.ie.no_voice")}</small>
        </div>
      )}

      <main className={"tp-ie-main" + (kind === "reading" || showKey ? " has-pane" : "")} onMouseUp={hl.onMouseUp}>
        {kind === "reading" && (
          <section className="tp-pane" aria-label={t("ct.ex.passage")}>
            <h2>{sec.title}</h2>
            {sec.paragraphs!.map((p, i) => (
              <Marked
                key={i}
                id={`p${part}-${i}`}
                text={p.text}
                marks={hl.marks[`p${part}-${i}`]}
                onRemove={hl.remove}
                prefix={p.label ? <b className="tp-para">{p.label}</b> : undefined}
              />
            ))}
          </section>
        )}
        {kind === "listening" && showKey && (
          <section className="tp-pane" aria-label={t("pr.transcript")}>
            <h2>{t("pr.transcript")}</h2>
            {sec.transcript!.map((l, i) => (
              <p key={i} className={narrator.index === i + 1 ? "is-now" : undefined}>
                {l.who && <b>{l.who}: </b>}
                {l.text}
              </p>
            ))}
          </section>
        )}
        <section className="tp-qs" aria-label={t("pr.ie.questions")}>
          {sec.groups.map((g, gi) => (
            <Group key={gi} group={g} answers={answers} current={current} onFocus={setCurrent} onSet={set} showKey={showKey} hl={hl} gid={`g${part}-${gi}`} />
          ))}
        </section>
      </main>
      <HighlightButton pending={hl.pending} onAdd={hl.add} />

      <footer className="tp-ie-foot">
        <nav className="tp-parts" aria-label={t("pr.ie.parts")}>
          {sections.map((_, si) => {
            const list = partItems(si);
            const on = si === part;
            return (
              <div key={si} className={"tp-partnav" + (on ? " is-on" : "")}>
                <button type="button" className="tp-partname" onClick={() => go(list[0].it.n)}>
                  {kind === "reading" ? t("pr.ie.passage_n", { n: si + 1 }) : t("pr.ie.part_n", { n: si + 1 })}
                  {!on && <small>{t("pr.ie.of", { a: list.filter((x) => answered(x.it.n)).length, b: list.length })}</small>}
                </button>
                {on && (
                  <ol>
                    {list.map(({ it, g }) => {
                      const ok = showKey ? ieltsCorrect(g, it, answers[it.n]) : null;
                      return (
                        <li key={it.n}>
                          <button
                            type="button"
                            onClick={() => go(it.n)}
                            className={[answered(it.n) ? "is-done" : "", current === it.n ? "is-cur" : "", flags[it.n] ? "is-flag" : "", ok === true ? "is-right" : ok === false ? "is-wrong" : ""].join(" ")}
                            aria-label={t("ct.ex.question", { n: it.n })}
                          >
                            {it.n}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </nav>
        <div className="tp-foot-r">
          {!showKey && (
            <label className="tp-flag">
              <input type="checkbox" checked={!!flags[current]} onChange={(e) => setFlags((f) => ({ ...f, [current]: e.target.checked }))} />
              <Flag size={13} aria-hidden="true" /> {t("pr.ie.review_flag")}
            </label>
          )}
          <Button variant="outline" size="icon" aria-label={t("ct.run.back")} disabled={idx <= 0} onClick={() => go(items[idx - 1].it.n)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button size="icon" aria-label={t("ct.run.next")} disabled={idx >= items.length - 1} onClick={() => go(items[idx + 1].it.n)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </footer>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pr.ie.submit_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pr.ie.submit_body", { n: total - Object.values(answers).filter((v) => v.trim()).length })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("ct.ex.stay")}</AlertDialogCancel>
            <AlertDialogAction onClick={finish}>{t("pr.ie.submit")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function Group({
  group: g,
  answers,
  current,
  onFocus,
  onSet,
  showKey,
  hl,
  gid,
}: {
  group: IeltsGroup;
  answers: Record<number, string>;
  current: number;
  onFocus: (n: number) => void;
  onSet: (n: number, v: string) => void;
  showKey: boolean;
  hl: ReturnType<typeof useHighlighter>;
  gid: string;
}) {
  const t = useT();
  const first = g.items[0].n,
    last = g.items[g.items.length - 1].n;
  return (
    <div className="tp-group">
      <h3>{first === last ? t("ct.ex.question", { n: first }) : t("pr.ie.qs", { a: first, b: last })}</h3>
      <Marked id={gid} as="p" className="tp-instr" text={g.instructions} marks={hl.marks[gid]} onRemove={hl.remove} />
      {g.limit && (
        <p className="tp-limit">
          {t("pr.ie.write")} <b>{g.limit}</b>
        </p>
      )}
      {g.kind === "match" && g.options && (
        <ul className="tp-optlist">
          {g.options.map((o) => (
            <li key={o.key}>
              <b>{o.key}</b> {o.text}
            </li>
          ))}
        </ul>
      )}
      {g.title && <h4 className="tp-gtitle">{g.title}</h4>}
      <ol className="tp-items">
        {g.items.map((it) => (
          <ItemRow key={it.n} g={g} it={it} value={answers[it.n] || ""} cur={current === it.n} onFocus={onFocus} onSet={onSet} showKey={showKey} />
        ))}
      </ol>
    </div>
  );
}

function ItemRow({ g, it, value, cur, onFocus, onSet, showKey }: { g: IeltsGroup; it: IeltsItem; value: string; cur: boolean; onFocus: (n: number) => void; onSet: (n: number, v: string) => void; showKey: boolean }) {
  const t = useT();
  const ok = showKey ? ieltsCorrect(g, it, value) : null;
  const choices = g.kind === "tfng" ? TFNG : g.kind === "ynng" ? YNNG : null;
  const name = "tp-q" + it.n;
  let body: React.ReactNode;
  if (g.kind === "gap") {
    const [before, after] = it.prompt.includes("___") ? it.prompt.split("___") : [it.prompt + " ", ""];
    body = (
      <p className="tp-gap">
        {before}
        <input
          aria-label={t("ct.ex.question", { n: it.n })}
          value={value}
          readOnly={showKey}
          placeholder={String(it.n)}
          onFocus={() => onFocus(it.n)}
          onChange={(e) => onSet(it.n, e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        {after}
      </p>
    );
  } else if (g.kind === "match") {
    body = (
      <div className="tp-match">
        <span>{it.prompt}</span>
        <NativeSelect value={value} disabled={showKey} onFocus={() => onFocus(it.n)} onChange={(e) => onSet(it.n, e.target.value)} aria-label={t("ct.ex.question", { n: it.n })}>
          <NativeSelectOption value="">—</NativeSelectOption>
          {g.options!.map((o) => (
            <NativeSelectOption key={o.key} value={o.key}>
              {o.key}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    );
  } else {
    const opts = choices ? choices.map((c) => ({ key: c, text: c })) : (it.options || []).map((o, i) => ({ key: LETTERS[i], text: o }));
    body = (
      <fieldset className="tp-radio">
        <legend>{it.prompt}</legend>
        {opts.map((o) => (
          <label key={o.key} className={value === o.key ? "is-on" : undefined}>
            <input type="radio" name={name} value={o.key} checked={value === o.key} disabled={showKey} onFocus={() => onFocus(it.n)} onChange={() => onSet(it.n, o.key)} />
            {!choices && <b>{o.key}</b>}
            <span>{o.text}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <li id={"tp-q-" + it.n} className={"tp-item" + (cur ? " is-cur" : "") + (ok === true ? " is-right" : ok === false ? " is-wrong" : "")} onClick={() => onFocus(it.n)}>
      <span className="tp-n">{it.n}</span>
      <div>
        {body}
        {showKey && (
          <div className="tp-key">
            <strong>
              {ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />} {t("ct.run.correct_answer")} {it.answer[0]}
            </strong>
            <span>{it.expl}</span>
          </div>
        )}
      </div>
    </li>
  );
}
