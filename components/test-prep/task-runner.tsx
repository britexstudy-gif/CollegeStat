"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, RotateCcw, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAttempt } from "@/lib/exam-score";
import { recordActivity } from "@/lib/progress-store";
import { parseCTest, typedAccuracy } from "@/lib/test-prep/scoring";
import type { BuildItem, CTest, ReadSelect, SentenceSet } from "@/lib/test-prep/types";
import { useT } from "@/components/college/i18n";
import { canSpeak, clock, useCountdown, useNarrator } from "./speech";
import "@/components/college/exam-runner.css";
import "./test-prep.css";

export type ShortTask =
  | { type: "ctest"; exam: "toefl" | "duolingo"; set: CTest }
  | { type: "build"; exam: "toefl"; id: string; title: string; items: BuildItem[] }
  | { type: "select"; exam: "duolingo"; id: string; title: string; sets: ReadSelect[] }
  | { type: "listen"; exam: "duolingo"; set: SentenceSet };

const BADGE = { toefl: "TOEFL", duolingo: "DET" } as const;
const seconds = (task: ShortTask) =>
  task.type === "ctest" ? task.set.minutes * 60 : task.type === "build" ? task.items.length * 35 : task.type === "select" ? task.sets.length * 60 : task.set.sentences.length * 60;

const shuffle = <T,>(list: T[], seed: number) => {
  const a = [...list];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Short timed task types from TOEFL iBT (2026) and the Duolingo English Test,
 * each in its own on-screen format, checked instantly with a review. */
export function TaskRunner({ task, onExit }: { task: ShortTask; onExit: () => void }) {
  const t = useT();
  const [phase, setPhase] = useState<"run" | "done">("run");
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);
  const finishRef = useRef<() => void>(() => {});
  const [left] = useCountdown(seconds(task), phase === "run", () => finishRef.current());
  const title = task.type === "ctest" || task.type === "listen" ? task.set.title : task.title;
  const id = task.type === "ctest" || task.type === "listen" ? task.set.id : task.id;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const done = (correct: number, total: number, answers: Record<string, string | number>) => {
    setScore({ correct, total });
    setPhase("done");
    saveAttempt(task.exam, {
      mock_id: id,
      ref: id,
      kind: "task",
      title,
      date: new Date().toISOString(),
      correct: Math.round(correct * 10) / 10,
      total,
      seconds: seconds(task) - left,
      scaled: null,
      by_domain: {},
      answers,
    });
    void recordActivity("practice", id);
  };

  return (
    <div className="ex ex-screen" role="dialog" aria-modal="true" aria-label={title}>
      <div className="tp-report">
        <header className="ex-report-head">
          <div>
            <span className="ex-badge">{BADGE[task.exam]}</span>
            <h1>{title}</h1>
          </div>
          <div className="tp-head-r">
            {phase === "run" ? (
              <span className={"tp-clock" + (left <= 20 ? " is-rec" : "")} aria-label={t("pr.ie.left", { time: clock(left) })}>
                {clock(left)}
              </span>
            ) : (
              score && <strong className="tp-score">{Math.round((score.correct / Math.max(1, score.total)) * 100)}%</strong>
            )}
            <Button variant="outline" onClick={onExit}>
              <X aria-hidden="true" /> {phase === "done" ? t("ct.run.done") : t("ct.ex.exit")}
            </Button>
          </div>
        </header>
        {task.type === "ctest" && <CTestTask set={task.set} phase={phase} finishRef={finishRef} onDone={done} />}
        {task.type === "build" && <BuildTask items={task.items} phase={phase} finishRef={finishRef} onDone={done} />}
        {task.type === "select" && <SelectTask sets={task.sets} phase={phase} finishRef={finishRef} onDone={done} />}
        {task.type === "listen" && <ListenTask set={task.set} phase={phase} finishRef={finishRef} onDone={done} />}
        <p className="ex-fine">{t("pr.original")}</p>
      </div>
    </div>
  );
}

type Sub = { phase: "run" | "done"; finishRef: React.MutableRefObject<() => void>; onDone: (correct: number, total: number, answers: Record<string, string | number>) => void };

function CTestTask({ set, phase, finishRef, onDone }: Sub & { set: CTest }) {
  const t = useT();
  const parts = useMemo(() => parseCTest(set.text), [set.text]);
  const blanks = parts.filter((p) => p.type === "blank") as Extract<(typeof parts)[number], { type: "blank" }>[];
  const [v, setV] = useState<Record<number, string>>({});
  const ok = (b: (typeof blanks)[number]) => (v[b.i] || "").trim().toLowerCase() === b.missing.toLowerCase();
  const finish = () => onDone(blanks.filter(ok).length, blanks.length, Object.fromEntries(Object.entries(v)));
  useEffect(() => {
    finishRef.current = finish;
  });
  const sentences = set.text.includes(" ¶ ");
  return (
    <section className="tp-card">
      <p className="tp-instr">{set.exam === "toefl" ? t("pr.task.ctw") : sentences ? t("pr.task.fib") : t("pr.task.rc")}</p>
      <div className={"tp-ctest" + (sentences ? " is-list" : "")}>
        {parts.map((p, k) =>
          p.type === "text" ? (
            <Fragment key={k}>{sentences ? p.text.split(" ¶ ").map((s, j, arr) => (j < arr.length - 1 ? <Fragment key={j}>{s}<br /></Fragment> : s)) : p.text}</Fragment>
          ) : (
            <span key={k} className={"tp-blank" + (phase === "done" ? (ok(p) ? " is-right" : " is-wrong") : "")}>
              {p.shown}
              <input
                aria-label={t("pr.task.blank", { n: p.i + 1 })}
                value={v[p.i] || ""}
                readOnly={phase === "done"}
                style={{ width: `${Math.max(2, p.missing.length) + 0.6}ch` }}
                maxLength={p.missing.length + 2}
                onChange={(e) => setV((x) => ({ ...x, [p.i]: e.target.value.replace(/\s/g, "") }))}
                autoComplete="off"
                spellCheck={false}
              />
              {phase === "done" && !ok(p) && <em>{p.shown + p.missing}</em>}
            </span>
          ),
        )}
      </div>
      {phase === "run" && (
        <Button className="ct-fit" onClick={finish}>
          {t("ct.run.check")}
        </Button>
      )}
    </section>
  );
}

function BuildTask({ items, phase, finishRef, onDone }: Sub & { items: BuildItem[] }) {
  const t = useT();
  const [k, setK] = useState(0);
  const [placed, setPlaced] = useState<Record<string, number[]>>({});
  const item = items[k];
  const mine = placed[item.id] || [];
  const sentence = (_it: BuildItem, order: number[], pool: string[]) => order.map((n) => pool[n]).join(" ");
  const pools = useMemo(() => Object.fromEntries(items.map((it, i) => [it.id, shuffle([...it.words, ...(it.extra ? [it.extra] : [])], i * 7 + it.words.length)])), [items]);
  const tiles = pools[item.id];
  const right = (it: BuildItem) => sentence(it, placed[it.id] || [], pools[it.id]) === it.words.join(" ");
  const finish = () => onDone(items.filter(right).length, items.length, Object.fromEntries(items.map((it) => [it.id, sentence(it, placed[it.id] || [], pools[it.id])])));
  useEffect(() => {
    finishRef.current = finish;
  });
  if (phase === "done")
    return (
      <section className="tp-card">
        <ol className="tp-transcripts">
          {items.map((it) => (
            <li key={it.id} className={right(it) ? "is-right" : "is-wrong"}>
              <small>{it.message}</small>
              <p>
                {right(it) ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />} {[it.start, sentence(it, placed[it.id] || [], pools[it.id]) || "—", it.end].filter(Boolean).join(" ")}
              </p>
              {!right(it) && <b>{[it.start, it.words.join(" "), it.end].filter(Boolean).join(" ")}</b>}
            </li>
          ))}
        </ol>
      </section>
    );
  return (
    <section className="tp-card">
      <p className="tp-instr">{t("pr.task.build")}</p>
      <small>{t("pr.sp.q_of", { n: k + 1, total: items.length })}</small>
      <div className="tp-chat">
        <p className="tp-bubble">{item.message}</p>
        <p className="tp-bubble is-me">
          {item.start && <span>{item.start}</span>}
          {item.words.map((_, n) => (
            <button
              key={n}
              type="button"
              className={"tp-slot" + (mine[n] !== undefined ? " is-full" : "")}
              onClick={() => mine[n] !== undefined && setPlaced((p) => ({ ...p, [item.id]: mine.filter((_, j) => j !== n) }))}
            >
              {mine[n] !== undefined ? tiles[mine[n]] : " "}
            </button>
          ))}
          {item.end && <span>{item.end}</span>}
        </p>
      </div>
      <div className="tp-tiles">
        {tiles.map((w, n) => (
          <button key={n} type="button" className="tp-tile" disabled={mine.includes(n) || mine.length >= item.words.length} onClick={() => setPlaced((p) => ({ ...p, [item.id]: [...mine, n] }))}>
            {w}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setPlaced((p) => ({ ...p, [item.id]: [] }))}>
          <RotateCcw aria-hidden="true" /> {t("pr.task.reset")}
        </Button>
      </div>
      <div className="ct-actions">
        <Button variant="outline" disabled={k === 0} onClick={() => setK(k - 1)}>
          {t("ct.run.back")}
        </Button>
        {k < items.length - 1 ? <Button onClick={() => setK(k + 1)}>{t("ct.run.next")}</Button> : <Button onClick={finish}>{t("ct.run.check")}</Button>}
      </div>
    </section>
  );
}

function SelectTask({ sets, phase, finishRef, onDone }: Sub & { sets: ReadSelect[] }) {
  const t = useT();
  const [k, setK] = useState(0);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const words = useMemo(() => sets.map((s, i) => shuffle([...s.real, ...s.fake], i * 13 + 5)), [sets]);
  const all = sets.flatMap((s) => [...s.real.map((w) => ({ w, real: true })), ...s.fake.map((w) => ({ w, real: false }))]);
  const finish = () => onDone(all.filter((x) => !!picked[x.w] === x.real).length, all.length, Object.fromEntries(Object.entries(picked).map(([w, v]) => [w, v ? 1 : 0])));
  useEffect(() => {
    finishRef.current = finish;
  });
  const real = new Set(sets.flatMap((s) => s.real));
  return (
    <section className="tp-card">
      <p className="tp-instr">{t("pr.task.select")}</p>
      {phase === "run" && <small>{t("pr.sp.q_of", { n: k + 1, total: sets.length })}</small>}
      {(phase === "done" ? words : [words[k]]).map((list, i) => (
        <div key={i} className="tp-words">
          {list.map((w) => {
            const state = phase === "done" ? (!!picked[w] === real.has(w) ? " is-right" : " is-wrong") : "";
            return (
              <button key={w} type="button" aria-pressed={!!picked[w]} disabled={phase === "done"} className={"tp-word" + (picked[w] ? " is-on" : "") + state} onClick={() => setPicked((p) => ({ ...p, [w]: !p[w] }))}>
                {w}
                {phase === "done" && real.has(w) && <Check size={12} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      ))}
      {phase === "done" && <p className="tp-quiet">{t("pr.task.select_key")}</p>}
      {phase === "run" && (
        <div className="ct-actions">
          {k < sets.length - 1 ? <Button onClick={() => setK(k + 1)}>{t("ct.run.next")}</Button> : <Button onClick={finish}>{t("ct.run.check")}</Button>}
        </div>
      )}
    </section>
  );
}

function ListenTask({ set, phase, finishRef, onDone }: Sub & { set: SentenceSet }) {
  const t = useT();
  const narrator = useNarrator("en-US", 0.9);
  const [k, setK] = useState(0);
  const [plays, setPlays] = useState<Record<number, number>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});
  const acc = (i: number) => typedAccuracy(set.sentences[i], typed[i] || "");
  const finish = () => onDone(set.sentences.reduce((s, _, i) => s + acc(i), 0), set.sentences.length, Object.fromEntries(Object.entries(typed)));
  useEffect(() => {
    finishRef.current = finish;
  });
  if (phase === "done")
    return (
      <section className="tp-card">
        <ol className="tp-transcripts">
          {set.sentences.map((s, i) => (
            <li key={i}>
              <b>{s}</b>
              <p>{typed[i] || "—"}</p>
              <small className={acc(i) >= 0.9 ? "tp-ok" : "tp-quiet"}>{t("pr.sp.match", { n: Math.round(acc(i) * 100) })}</small>
            </li>
          ))}
        </ol>
      </section>
    );
  const used = plays[k] || 0;
  return (
    <section className="tp-card">
      <p className="tp-instr">{t("pr.task.listen")}</p>
      <small>{t("pr.sp.q_of", { n: k + 1, total: set.sentences.length })}</small>
      <div className="tp-audio">
        <button
          type="button"
          className="tp-audio-btn"
          disabled={!canSpeak() || used >= 3 || narrator.playing}
          onClick={() => {
            setPlays((p) => ({ ...p, [k]: used + 1 }));
            narrator.play([{ text: set.sentences[k] }]);
          }}
          aria-label={t("pr.audio.play")}
        >
          {narrator.playing ? <Volume2 size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
        <small>{canSpeak() ? t("pr.task.plays", { n: 3 - used }) : t("pr.ie.no_voice")}</small>
      </div>
      <Input value={typed[k] || ""} onChange={(e) => setTyped((x) => ({ ...x, [k]: e.target.value }))} placeholder={t("pr.task.type_here")} aria-label={t("pr.task.type_here")} autoComplete="off" spellCheck={false} />
      <div className="ct-actions">
        {k < set.sentences.length - 1 ? <Button onClick={() => setK(k + 1)}>{t("ct.run.next")}</Button> : <Button onClick={finish}>{t("ct.run.check")}</Button>}
      </div>
    </section>
  );
}
