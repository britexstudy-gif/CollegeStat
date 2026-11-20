"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Play, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveAttempt } from "@/lib/exam-score";
import { recordActivity } from "@/lib/progress-store";
import { typedAccuracy, wordCount } from "@/lib/test-prep/scoring";
import type { SpeakingTask } from "@/lib/test-prep/types";
import { useT } from "@/components/college/i18n";
import { AiFeedback, buildFeedbackRequest } from "./ai-feedback";
import { canSpeak, clock, useCountdown, useDictation, useNarrator } from "./speech";
import "@/components/college/exam-runner.css";
import "./test-prep.css";

const BADGE = { ielts: "IELTS", toefl: "TOEFL", duolingo: "DET" } as const;

/** Speaking practice: the question is read aloud, a preparation clock runs
 * when the format has one, then the answer clock. Spoken answers are
 * transcribed where the browser allows (typing works everywhere). */
export function SpeakingRunner({ task, onExit }: { task: SpeakingTask; onExit: () => void }) {
  const t = useT();
  const lang = task.exam === "ielts" ? "en-GB" : "en-US";
  const narrator = useNarrator(lang, 0.95);
  const dict = useDictation(lang);
  const [i, setI] = useState(-1);
  const [stage, setStage] = useState<"listen" | "prep" | "speak">("listen");
  const [answers, setAnswers] = useState<string[]>([]);
  const repeat = task.kind === "repeat";
  const done = i >= task.items.length;
  const q = task.items[i];
  const saved = useRef(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const startSpeak = () => {
    setStage("speak");
    dict.setText("");
    if (dict.supported) dict.start();
  };
  const next = () => {
    dict.stop();
    setAnswers((a) => {
      const copy = [...a];
      copy[i] = dict.text;
      return copy;
    });
    setI((n) => n + 1);
    setStage("listen");
  };

  const [prepLeft, setPrepLeft] = useCountdown(task.prepSeconds, stage === "prep" && !done, startSpeak);
  const [speakLeft, setSpeakLeft] = useCountdown(task.speakSeconds, stage === "speak" && !done, next);

  // Each question: read it aloud, then move on to preparation or answering.
  useEffect(() => {
    if (i < 0 || done) return;
    setPrepLeft(task.prepSeconds);
    setSpeakLeft(task.speakSeconds);
    const lines = [{ text: task.items[i] }];
    if (canSpeak()) narrator.play(lines);
    const wait = canSpeak() ? Math.min(9000, 900 + task.items[i].length * 65) : 300;
    const id = setTimeout(() => (task.prepSeconds ? setStage("prep") : startSpeak()), wait);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    if (!done || saved.current) return;
    saved.current = true;
    const acc = repeat ? task.items.map((s, k) => typedAccuracy(s, answers[k] || "")) : [];
    saveAttempt(task.exam, {
      mock_id: task.id,
      ref: task.id,
      kind: repeat ? "task" : "speaking",
      title: task.title,
      date: new Date().toISOString(),
      correct: repeat ? Math.round(acc.reduce((s, x) => s + x, 0) * 10) / 10 : 0,
      total: repeat ? task.items.length : 0,
      seconds: 0,
      scaled: null,
      by_domain: {},
      text: task.items.map((s, k) => `${s}\n→ ${answers[k] || ""}`).join("\n\n").slice(0, 6000),
    });
    void recordActivity("practice", task.id);
  }, [done, answers, repeat, task]);

  return (
    <div className="ex ex-screen" role="dialog" aria-modal="true" aria-label={task.title}>
      <div className="tp-report tp-speak">
        <header className="ex-report-head">
          <div>
            <span className="ex-badge">{BADGE[task.exam]}</span>
            <h1>{task.title}</h1>
          </div>
          <Button variant="outline" onClick={onExit}>
            <X aria-hidden="true" /> {done ? t("ct.run.done") : t("ct.ex.exit")}
          </Button>
        </header>

        {i < 0 && (
          <section className="tp-card">
            <ul className="ex-rules">
              <li>{repeat ? t("pr.sp.rule_repeat") : t("pr.sp.rule_listen")}</li>
              {task.prepSeconds > 0 && <li>{t("pr.sp.rule_prep", { s: task.prepSeconds })}</li>}
              <li>{t("pr.sp.rule_time", { s: task.speakSeconds })}</li>
              <li>{dict.supported ? t("pr.sp.rule_mic") : t("pr.sp.rule_type")}</li>
            </ul>
            <p className="ex-fine">{t("pr.original")}</p>
            <Button className="ct-fit" onClick={() => setI(0)}>
              <Play aria-hidden="true" /> {t("ct.ex.start")}
            </Button>
          </section>
        )}

        {i >= 0 && !done && (
          <section className="tp-card tp-stage">
            <small>{t("pr.sp.q_of", { n: i + 1, total: task.items.length })}</small>
            {repeat && stage === "listen" ? (
              <p className="tp-big">
                <Volume2 aria-hidden="true" /> {t("pr.sp.listen")}
              </p>
            ) : (
              <p className="tp-big">{repeat ? t("pr.sp.now_repeat") : q}</p>
            )}
            {task.bullets && !repeat && (
              <div className="tp-cue">
                <b>{t("pr.sp.say")}</b>
                <ul>
                  {task.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="tp-stage-bar">
              {stage === "listen" && <span className="tp-quiet">{t("pr.sp.listening")}</span>}
              {stage === "prep" && (
                <>
                  <span className="tp-clock">{clock(prepLeft)}</span>
                  <span className="tp-quiet">{t("pr.sp.prep")}</span>
                  <Button size="sm" variant="outline" onClick={startSpeak}>
                    {t("pr.sp.start_now")}
                  </Button>
                </>
              )}
              {stage === "speak" && (
                <>
                  <span className="tp-clock is-rec">{clock(speakLeft)}</span>
                  {dict.supported ? (
                    <Button size="sm" variant="outline" onClick={() => (dict.listening ? dict.stop() : dict.start(dict.text))}>
                      {dict.listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
                      {dict.listening ? t("pr.sp.mic_off") : t("pr.sp.mic_on")}
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={next}>
                    {i === task.items.length - 1 ? t("pr.sp.finish") : t("ct.run.next")}
                  </Button>
                </>
              )}
            </div>
            {stage === "speak" && (
              <Textarea
                value={dict.text}
                onChange={(e) => dict.setText(e.target.value)}
                placeholder={dict.supported ? t("pr.sp.ph_mic") : t("pr.sp.ph_type")}
                aria-label={t("pr.sp.transcript")}
              />
            )}
            {canSpeak() && stage !== "listen" && (
              <button type="button" className="tp-link" onClick={() => narrator.play([{ text: q }])}>
                <Volume2 size={13} aria-hidden="true" /> {t("pr.sp.replay")}
              </button>
            )}
          </section>
        )}

        {done && (
          <>
            <section className="tp-card">
              <h2>{t("pr.sp.your_answers")}</h2>
              <ol className="tp-transcripts">
                {task.items.map((s, k) => {
                  const acc = repeat ? Math.round(typedAccuracy(s, answers[k] || "") * 100) : null;
                  return (
                    <li key={k}>
                      <b>{s}</b>
                      <p>{answers[k]?.trim() || <span className="tp-quiet">{t("ct.ex.not_answered")}</span>}</p>
                      {acc !== null && <small className={acc >= 80 ? "tp-ok" : "tp-quiet"}>{t("pr.sp.match", { n: acc })}</small>}
                      {!repeat && answers[k] && <small className="tp-quiet">{t("pr.wr.words", { n: wordCount(answers[k]) })}</small>}
                    </li>
                  );
                })}
              </ol>
            </section>
            {!repeat && answers.some((a) => a?.trim().length > 10) && (
              <section className="tp-card">
                <AiFeedback
                  exam={task.exam}
                  request={() =>
                    buildFeedbackRequest(
                      task.exam,
                      "speaking",
                      task.title,
                      task.items.join("\n") + (task.bullets ? "\nYou should say: " + task.bullets.join("; ") : ""),
                      task.items.map((s, k) => `Q: ${s}\nA: ${answers[k] || ""}`).join("\n\n"),
                      answers.reduce((s, a) => s + wordCount(a || ""), 0),
                    )
                  }
                />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
