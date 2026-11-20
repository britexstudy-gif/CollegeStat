"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Question } from "@/lib/certificates";
import { LETTERS, isCorrect, math } from "@/lib/exam-text";
import { recordActivity } from "@/lib/progress-store";
import { useT } from "./i18n";
import { ListenButton } from "@/components/test-prep/listen-button";

/** Practice, one question at a time: pick an answer, check it, read the explanation.
 * A short review follows the last question. */
export function QuestionRunner({
  questions,
  activityRef,
  onExit,
  onAnswer,
}: {
  questions: Question[];
  activityRef: string;
  onExit: () => void;
  /** Called once per checked answer, so the bank can show progress. */
  onAnswer?: (results: { id: string; correct: boolean }[]) => void;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const q = questions[index];
  const answer = q ? answers[q.id] : undefined;
  const shown = !!q && !!revealed[q.id];
  const ready = answer !== undefined && answer !== "";
  // Listening items carry their script as the passage: play it, show it only after checking.
  const listening = !!q && (/^listening/i.test(q.section || "") || /^Transcript:/i.test(q.passage || ""));

  const score = useMemo(() => questions.filter((x) => revealed[x.id] && isCorrect(x, answers[x.id])).length, [questions, answers, revealed]);
  const checked = questions.filter((x) => revealed[x.id]);

  const check = () => {
    if (!q || !ready || shown) return;
    setRevealed((r) => ({ ...r, [q.id]: true }));
    onAnswer?.([{ id: q.id, correct: isCorrect(q, answer) }]);
  };
  const finish = () => {
    void recordActivity("practice", activityRef);
    setFinished(true);
  };

  // Keyboard: A-D pick an answer.
  useEffect(() => {
    if (finished || !q) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (/^[a-d]$/i.test(e.key) && q.options && !shown) {
        const n = e.key.toLowerCase().charCodeAt(0) - 97;
        if (n < q.options.length) setAnswers((a) => ({ ...a, [q.id]: n }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, q, shown]);

  if (!q) return null;

  if (finished) {
    const wrong = checked.filter((x) => !isCorrect(x, answers[x.id]));
    return (
      <div className="qr qr-results">
        <header className="qr-results-head">
          <div>
            <h2>{t("ct.run.result", { a: score, b: checked.length })}</h2>
            <p>{wrong.length ? t("ct.run.review_hint") : t("ct.run.all_right")}</p>
          </div>
          <Button onClick={onExit}>{t("ct.run.done")}</Button>
        </header>
        {wrong.length > 0 && (
          <ol className="qr-review">
            {wrong.map((x) => (
              <li key={x.id}>
                <span className="qr-review-mark" aria-hidden="true">
                  <X size={14} />
                </span>
                <div>
                  <strong>{math(x.prompt)}</strong>
                  <p>
                    {t("ct.run.correct_answer")}{" "}
                    {x.type === "grid_in" ? x.answer_value : `${LETTERS[x.answer ?? 0]}. ${math(x.options?.[x.answer ?? 0] || "")}`}
                  </p>
                  <small>{math(x.explanation)}</small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  const last = index === questions.length - 1;
  return (
    <div className="qr">
      <header className="qr-top">
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft aria-hidden="true" /> {t("ct.run.exit")}
        </Button>
        <div className="qr-progress" role="group" aria-label={t("ct.run.progress", { n: index + 1, total: questions.length })}>
          {questions.map((x, i) => (
            <button
              key={x.id}
              type="button"
              aria-label={t("ct.run.go", { n: i + 1 })}
              aria-current={i === index ? "step" : undefined}
              className={(answers[x.id] !== undefined ? "is-answered " : "") + (revealed[x.id] ? (isCorrect(x, answers[x.id]) ? "is-ok" : "is-bad") : "")}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <span className="qr-count">
          {index + 1} / {questions.length}
        </span>
      </header>

      <div className="qr-body" key={q.id}>
        <div className="qr-meta">
          {q.domain && <span>{q.domain}</span>}
          {q.skill && q.skill !== q.domain && <span>{q.skill}</span>}
          {q.difficulty && <span className={"qr-diff d-" + q.difficulty}>{t(("ct.level." + q.difficulty) as "ct.level.easy")}</span>}
        </div>
        {q.passage && listening && !shown ? (
          <ListenButton text={q.passage} />
        ) : (
          q.passage && <blockquote className="qr-passage">{q.passage.replace(/\s(Text 2)\b/, "\n\n$1")}</blockquote>
        )}
        {q.table && (
          <div className="qr-table-wrap">
            <table className="qr-table">
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
                {q.table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h2 className="qr-prompt">{math(q.prompt)}</h2>

        {q.type === "grid_in" ? (
          <label className="qr-grid">
            <span>{t("ct.run.your_answer")}</span>
            <input
              inputMode="decimal"
              value={String(answer ?? "")}
              disabled={shown}
              placeholder={t("ct.run.grid_hint")}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value.replace(/[^\d./-]/g, "").slice(0, 8) }))}
              onKeyDown={(e) => e.key === "Enter" && check()}
            />
          </label>
        ) : (
          <div className="qr-options" role="radiogroup" aria-label={t("ct.run.choices")}>
            {q.options?.map((opt, i) => {
              const picked = answer === i;
              const state = shown ? (i === q.answer ? " is-right" : picked ? " is-wrong" : "") : picked ? " is-picked" : "";
              return (
                <button key={i} type="button" role="radio" aria-checked={picked} disabled={shown} className={"qr-option" + state} onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}>
                  <b>{LETTERS[i]}</b>
                  <span>{math(opt)}</span>
                  {shown && i === q.answer && <Check size={16} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}

        {shown && (
          <div className={"qr-explain " + (isCorrect(q, answer) ? "is-ok" : "is-bad")} role="status">
            <strong>{isCorrect(q, answer) ? t("ct.run.correct") : t("ct.run.wrong", { a: q.type === "grid_in" ? (q.answer_value ?? "") : LETTERS[q.answer ?? 0] })}</strong>
            <p>{math(q.explanation)}</p>
          </div>
        )}
      </div>

      <footer className="qr-foot">
        <Button variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          <ArrowLeft aria-hidden="true" /> {t("ct.run.back")}
        </Button>
        {!shown ? (
          <Button disabled={!ready} onClick={check}>
            {t("ct.run.check")}
          </Button>
        ) : last ? (
          <Button onClick={finish}>{t("ct.run.finish")}</Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)}>
            {t("ct.run.next")} <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </footer>
    </div>
  );
}

