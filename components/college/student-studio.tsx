"use client";
import { recordActivity } from "@/lib/progress-store";
import { WritingTool } from "./writing-tool";
import { useEffect, useRef, useState } from "react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import {
  practiceSets,
  practiceResult,
} from "@/lib/student-practice";
import type { University } from "@/lib/domain";
import type { AccountScope } from "@/lib/account-owner";
import "./student-writing.css";

type StudioMode = "Practice" | "Writing" | "Guide";
export function StudentStudio({
  mode,
  universities,
  addTask,
  practiceTrack = "math",
  practiceEntry = 0,
  owner,
  accountScope,
}: {
  mode?: StudioMode;
  universities: University[];
  addTask: (title: string) => Promise<boolean>;
  practiceTrack?: string;
  practiceEntry?: number;
  owner: string;
  accountScope: AccountScope;
}) {
  return (
    <div hidden={!mode} className="student-studio">
      <div hidden={mode !== "Practice"}>
        <PracticeStudio
          key={practiceEntry}
          active={mode === "Practice"}
          initialTrack={practiceTrack}
        />
      </div>
      <div hidden={mode !== "Writing"}>
        <WritingTool
          addTask={addTask}
          active={mode === "Writing"}
          universities={universities}
          owner={owner}
          accountScope={accountScope}
        />
      </div>
      <div hidden={mode !== "Guide"}>
        <ResearchGuide universities={universities} addTask={addTask} />
      </div>
    </div>
  );
}

function PracticeStudio({
  active,
  initialTrack,
}: {
  active: boolean;
  initialTrack: string;
}) {
  const [track, setTrack] = useState(
      Object.hasOwn(practiceSets, initialTrack) ? initialTrack : "math",
    ),
    [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0),
    [answers, setAnswers] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState(false),
    [finished, setFinished] = useState(false);
  const set = practiceSets[track],
    question = set.questions[index];
  const result = practiceResult(set.questions, answers);
  const prompt = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (active && started && !finished)
      prompt.current?.focus({ preventScroll: true });
  }, [active, started, finished, index]);
  const reset = (next = track) => {
    setTrack(next);
    setStarted(false);
    setIndex(0);
    setAnswers({});
    setRevealed(false);
    setFinished(false);
  };
  return (
    <section aria-labelledby="practice-title">
      <header className="studio-heading">
        <span className="studio-icon">
          <Target size={23} />
        </span>
        <div>
          <span className="section-caption">A little progress, every day</span>
          <h2 id="practice-title">Practice studio</h2>
          <p>Short exercises. Clear explanations. Your own pace.</p>
        </div>
      </header>
      {!started ? (
        <>
          <div className="studio-track-grid">
            {Object.entries(practiceSets).map(([key, set]) => (
              <button
                key={key}
                aria-pressed={track === key}
                onClick={() => reset(key)}
              >
                <span className="track-icon">
                  <BookOpen size={21} />
                </span>
                <strong>{set.name}</strong>
                <small>{set.skill}</small>
                <span>
                  4 questions · untimed <ArrowRight size={15} />
                </span>
              </button>
            ))}
          </div>
          <div className="studio-start">
            <div>
              <h3>{set.name}</h3>
              <p>Review the reasoning after each answer. There’s no timer.</p>
            </div>
            <button
              className="button button-primary"
              onClick={() => setStarted(true)}
            >
              Start practice <ArrowRight size={17} />
            </button>
          </div>
        </>
      ) : finished ? (
        <div className="practice-results" role="status">
          <CheckCircle2 size={34} />
          <span className="section-caption">Session complete</span>
          <h3>
            {result.correct} of {result.total} correct
          </h3>
          <p>Use the explanations to decide what to work on next.</p>
          <div className="practice-review">
            {set.questions.map((q) => (
              <details key={q.id}>
                <summary>
                  <span
                    className={
                      answers[q.id] === q.answer
                        ? "answer-correct"
                        : "answer-review"
                    }
                  >
                    {answers[q.id] === q.answer ? "Correct" : "Review"}
                  </span>
                  {q.prompt}
                </summary>
                <p>{q.explanation}</p>
              </details>
            ))}
          </div>
          <button className="button button-secondary" onClick={() => reset()}>
            <RotateCcw size={16} /> Choose another session
          </button>
        </div>
      ) : (
        <div className="practice-question" key={question.id}>
          <div className="practice-question-top">
            <span>{set.name}</span>
            <span>
              Question {index + 1} / {set.questions.length}
            </span>
          </div>
          <div
            className="practice-session-map"
            aria-label="Questions in this session"
          >
            {set.questions.map((q, i) => (
              <span
                key={q.id}
                className={
                  i === index
                    ? "current"
                    : answers[q.id] !== undefined
                      ? "answered"
                      : ""
                }
                aria-current={i === index ? "step" : undefined}
              >
                {i < index ? <Check size={13} /> : i + 1}
                <span className="sr-only">
                  {i === index
                    ? "Current question"
                    : i < index
                      ? "Reviewed question"
                      : "Upcoming question"}
                </span>
              </span>
            ))}
            <small>
              {result.answered} of {result.total} answered
            </small>
          </div>
          <div
            className="practice-progress"
            role="progressbar"
            aria-label="Questions answered"
            aria-valuemin={0}
            aria-valuemax={set.questions.length}
            aria-valuenow={result.answered}
          >
            <span
              style={{
                width: `${(result.answered / set.questions.length) * 100}%`,
              }}
            />
          </div>
          {question.passage && <blockquote>{question.passage}</blockquote>}
          <h3 tabIndex={-1} ref={prompt}>
            {question.prompt}
          </h3>
          <fieldset disabled={revealed}>
            <legend className="sr-only">Choose your answer</legend>
            {question.options.map((option, i) => (
              <label
                key={i}
                className={
                  "practice-option" +
                  (answers[question.id] === i ? " selected" : "") +
                  (revealed &&
                  answers[question.id] === i &&
                  i !== question.answer
                    ? " incorrect"
                    : "") +
                  (revealed && i === question.answer ? " correct" : "")
                }
              >
                <input
                  type="radio"
                  name={question.id}
                  checked={answers[question.id] === i}
                  onChange={() => setAnswers({ ...answers, [question.id]: i })}
                />
                <span>{String.fromCharCode(65 + i)}</span>
                <strong>{option}</strong>
                {revealed && i === question.answer && <Check size={18} />}
              </label>
            ))}
          </fieldset>
          {revealed && (
            <div className="practice-explanation" role="status">
              <strong>
                {answers[question.id] === question.answer
                  ? "That’s right."
                  : "Let’s work through it."}
              </strong>
              <p>{question.explanation}</p>
            </div>
          )}
          <div className="practice-actions">
            <button className="text-link" onClick={() => reset()}>
              End session
            </button>
            {!revealed ? (
              <button
                className="button button-primary"
                disabled={answers[question.id] === undefined}
                onClick={() => setRevealed(true)}
              >
                Check answer <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="button button-primary"
                onClick={() => {
                  if (index + 1 === set.questions.length) {
                    setFinished(true);
                    void recordActivity("practice", track);
                  }
                  else {
                    setIndex(index + 1);
                    setRevealed(false);
                  }
                }}
              >
                {index + 1 === set.questions.length
                  ? "View results"
                  : "Next question"}{" "}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}
      <p className="studio-footnote">
        Original learning exercises, independent of SAT and IELTS. This mini
        session does not produce an official test score or IELTS band. Results
        stay in this tab.
      </p>
    </section>
  );
}

function ResearchGuide({
  universities,
  addTask,
}: {
  universities: University[];
  addTask: (title: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState("");
  const [addedSteps, setAddedSteps] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState("");
  const institution =
    universities.find((u) => u.id === selected) || universities[0];
  return (
    <section aria-labelledby="guide-title">
      <header className="studio-heading">
        <span className="studio-icon">
          <Sparkles size={23} />
        </span>
        <div>
          <span className="section-caption">Research with direction</span>
          <h2 id="guide-title">Your application guide</h2>
          <p>Work from the source, then turn it into a next step.</p>
        </div>
      </header>
      <div className="guide-workbench">
        <div>
          <label htmlFor="guide-university">
            A university from your shortlist
          </label>
          <select
            id="guide-university"
            value={institution?.id || ""}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!universities.length}
          >
            {!universities.length && (
              <option value="">Save a university to begin</option>
            )}
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <div className="guide-next-steps">
            {[
              [
                "Check your route",
                "Review the qualification, language and programme-specific requirements.",
                "Admissions",
              ],
              [
                "Build your budget",
                "Compare reported costs and verify the funding rules for your citizenship.",
                "Costs",
              ],
              [
                "Confirm the dates",
                "Check the current cycle and intake on the official application page.",
                "Admissions",
              ],
            ].map(([title, text, tab], i) => (
              <div className="guide-step-row" key={title}>
                <Link
                  href={
                    institution
                      ? `/university/${institution.slug}?tab=${encodeURIComponent(tab)}`
                      : "/universities"
                  }
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                  <ArrowRight size={17} />
                </Link>
                {institution && (
                  <button
                    className="text-link"
                    disabled={!!adding || !!addedSteps[institution.id + title]}
                    onClick={async () => {
                      const step = institution.id + title;
                      setAdding(step);
                      try {
                        if (await addTask(`${title}: ${institution.name}`))
                          setAddedSteps((current) => ({
                            ...current,
                            [step]: true,
                          }));
                      } finally {
                        setAdding("");
                      }
                    }}
                  >
                    {addedSteps[institution.id + title] ? (
                      <>
                        <Check size={13} /> Added to plan
                      </>
                    ) : adding === institution.id + title ? (
                      "Saving…"
                    ) : (
                      "Add this step to my plan"
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <aside>
          <Sparkles size={26} />
          <h3>Evidence before advice</h3>
          <p>
            These steps link to your saved universities and their sources. Your
            profile and documents remain private.
          </p>
          <p>
            Personal AI coaching isn’t connected yet. Automated advice must cite
            current evidence and never predict an acceptance chance.
          </p>
          <Link className="text-link" href="/profile">
            Set your research priorities <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
    </section>
  );
}
