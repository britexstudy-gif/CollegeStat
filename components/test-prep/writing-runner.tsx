"use client";
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { saveAttempt } from "@/lib/exam-score";
import { recordActivity } from "@/lib/progress-store";
import { wordCount } from "@/lib/test-prep/scoring";
import type { WritingTask } from "@/lib/test-prep/types";
import { useT } from "@/components/college/i18n";
import { AiFeedback, buildFeedbackRequest } from "./ai-feedback";
import { TaskChartView } from "./task-chart";
import { clock, useCountdown } from "./speech";
import "@/components/college/exam-runner.css";
import "./test-prep.css";

const BADGE = { ielts: "IELTS", toefl: "TOEFL", duolingo: "DET" } as const;

/** Writing in the exam's own screen: the prompt on the left, the answer box with
 * a live word count on the right, one clock. IELTS can run Task 1 and Task 2
 * together (60 minutes) with part tabs, as on test day. */
export function WritingRunner({ tasks, onExit }: { tasks: WritingTask[]; onExit: () => void }) {
  const t = useT();
  const exam = tasks[0].exam;
  const minutes = tasks.reduce((s, x) => s + x.minutes + (x.followUp ? 3 : 0), 0);
  const [phase, setPhase] = useState<"intro" | "write" | "done">("intro");
  const [part, setPart] = useState(0);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [follow, setFollow] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const started = useRef(0);

  const finish = () => {
    const seconds = Math.round((Date.now() - started.current) / 1000);
    for (const task of tasks) {
      const text = texts[task.id] || "";
      if (!text.trim()) continue;
      saveAttempt(exam, {
        mock_id: task.id,
        ref: task.id,
        kind: "writing",
        title: task.title,
        date: new Date().toISOString(),
        correct: 0,
        total: 0,
        seconds,
        scaled: null,
        by_domain: {},
        text: text.slice(0, 6000),
      });
    }
    void recordActivity("practice", tasks.map((x) => x.id).join("+"));
    setPhase("done");
  };
  const [left] = useCountdown(minutes * 60, phase === "write", finish);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const task = tasks[part];
  const text = texts[task.id] || "";
  const words = wordCount(text);

  if (phase === "intro")
    return (
      <div className="ex ex-screen" role="dialog" aria-modal="true" aria-label={task.title}>
        <div className="ex-intro">
          <span className="ex-badge">{BADGE[exam]}</span>
          <h1>{tasks.length > 1 ? t("pr.wr.full") : task.title}</h1>
          <dl className="ex-facts">
            <div>
              <dt>{t("pr.wr.tasks")}</dt>
              <dd>{tasks.length}</dd>
            </div>
            <div>
              <dt>{t("ct.ex.time")}</dt>
              <dd>{t("ct.min", { n: minutes })}</dd>
            </div>
            <div>
              <dt>{t("pr.wr.min_words")}</dt>
              <dd>{tasks.map((x) => x.minWords).join(" + ")}</dd>
            </div>
          </dl>
          <ul className="ex-rules">
            <li>{t("pr.wr.rule_count")}</li>
            {exam === "ielts" && tasks.length > 1 && <li>{t("pr.wr.rule_weight")}</li>}
            <li>{t("pr.wr.rule_ai")}</li>
          </ul>
          <p className="ex-fine">{t("pr.original")}</p>
          <div className="ex-intro-actions">
            <Button variant="outline" onClick={onExit}>
              {t("ct.ex.not_now")}
            </Button>
            <Button
              onClick={() => {
                started.current = Date.now();
                setPhase("write");
              }}
            >
              {t("ct.ex.start")}
            </Button>
          </div>
        </div>
      </div>
    );

  if (phase === "done")
    return (
      <div className="ex ex-screen" role="dialog" aria-modal="true" aria-label={t("pr.wr.done")}>
        <div className="tp-report">
          <header className="ex-report-head">
            <div>
              <span className="ex-badge">{BADGE[exam]}</span>
              <h1>{t("pr.wr.done")}</h1>
            </div>
            <Button onClick={onExit}>{t("ct.run.done")}</Button>
          </header>
          {tasks.map((x) => {
            const body = texts[x.id] || "";
            const n = wordCount(body);
            return (
              <section key={x.id} className="tp-card">
                <h2>{x.title}</h2>
                <p className={"tp-count" + (n < x.minWords ? " is-low" : "")}>
                  {n >= x.minWords ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}{" "}
                  {t("pr.wr.count", { n, min: x.minWords })}
                </p>
                {body.trim() ? <blockquote className="tp-answer">{body}</blockquote> : <p className="tp-quiet">{t("pr.wr.empty")}</p>}
                {body.trim().length >= 10 && (
                  <AiFeedback
                    exam={exam}
                    request={() => buildFeedbackRequest(exam, "writing", x.title, [x.prompt, ...(x.posts || []).map((p) => `${p.who}: ${p.text}`), x.followUp || ""].join("\n"), body, n)}
                  />
                )}
              </section>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="ex tp-ie" role="dialog" aria-modal="true" aria-label={task.title}>
      <header className="ex-top">
        <div className="ex-top-l">
          <span className="ex-badge">{BADGE[exam]}</span>
          <strong>{t("pr.wr.writing")}</strong>
        </div>
        <div className={"ex-timer" + (left <= 300 ? " is-low" : "")}>
          <span>{t("pr.ie.left", { time: clock(left) })}</span>
        </div>
        <div className="ex-top-r">
          <Button size="sm" onClick={() => setConfirm(true)}>
            {t("pr.ie.submit")}
          </Button>
          <button type="button" className="ex-tool" onClick={() => setLeaving(true)}>
            <X size={18} aria-hidden="true" />
            <span>{t("ct.ex.exit")}</span>
          </button>
        </div>
      </header>
      <div className="tp-ie-part">
        <strong>{tasks.length > 1 ? t("pr.wr.part", { n: part + 1 }) : task.title}</strong>
        <span>{t("pr.wr.part_hint", { m: task.minutes, w: task.minWords })}</span>
      </div>
      <main className="tp-ie-main has-pane">
        <section className="tp-pane" aria-label={t("pr.wr.prompt")}>
          {task.posts ? (
            <>
              <p className="tp-instr">{task.prompt}</p>
              <ul className="tp-posts">
                {task.posts.map((p, i) => (
                  <li key={i} className={i === 0 ? "is-prof" : undefined}>
                    <b>{p.who}</b>
                    <p>{p.text}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            task.prompt.split(/\n{2,}/).map((p, i) => (
              <p key={i} className={i === 0 ? "tp-lead" : undefined}>
                {p}
              </p>
            ))
          )}
          {task.chart && <TaskChartView chart={task.chart} />}
          {task.followUp && follow[task.id] && (
            <div className="tp-follow">
              <b>{t("pr.wr.follow")}</b>
              <p>{task.followUp}</p>
            </div>
          )}
        </section>
        <section className="tp-write" aria-label={t("pr.wr.answer")}>
          <Textarea
            value={text}
            onChange={(e) => setTexts((x) => ({ ...x, [task.id]: e.target.value }))}
            spellCheck={false}
            autoCorrect="off"
            aria-label={t("pr.wr.answer")}
            placeholder={t("pr.wr.placeholder")}
          />
          <div className="tp-write-bar">
            <span className={words < task.minWords ? "tp-quiet" : "tp-ok"}>{t("pr.wr.words", { n: words })}</span>
            {task.followUp && !follow[task.id] && (
              <Button size="sm" variant="outline" disabled={words < 10} onClick={() => setFollow((f) => ({ ...f, [task.id]: true }))}>
                {t("pr.wr.next_q")}
              </Button>
            )}
          </div>
        </section>
      </main>
      <footer className="tp-ie-foot">
        <nav className="tp-parts" aria-label={t("pr.wr.tasks")}>
          {tasks.map((x, i) => (
            <div key={x.id} className={"tp-partnav" + (i === part ? " is-on" : "")}>
              <button type="button" className="tp-partname" onClick={() => setPart(i)}>
                {tasks.length > 1 ? t("pr.wr.part", { n: i + 1 }) : x.title}
                <small>{t("pr.wr.words", { n: wordCount(texts[x.id] || "") })}</small>
              </button>
            </div>
          ))}
        </nav>
        <span />
      </footer>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pr.ie.submit_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pr.wr.submit_body")}</AlertDialogDescription>
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
