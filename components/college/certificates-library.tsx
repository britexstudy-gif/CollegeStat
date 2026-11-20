"use client";
import { useMemo, useState } from "react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { ArrowLeft, ArrowUpRight, Clock, Mic, PenLine, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { questionsById, type Exam, type Mock } from "@/lib/certificates";
import type { MockAttempt } from "@/lib/exam-score";
import { readPlan } from "@/lib/personal-plan";
import { daysUntil, isoToday, planFallback, usePrepData, type Plan } from "@/lib/prep-plan";
import { infoBySlug, type ExamInfo } from "@/lib/test-prep/exam-info";
import { satTests, type SatTest } from "@/lib/test-prep/sat-adaptive";
import { IELTS_READING } from "@/lib/test-prep/ielts-reading";
import { IELTS_LISTENING } from "@/lib/test-prep/ielts-listening";
import { BUILD, CTESTS, FILL_BLANKS, LISTEN_TYPE, READ_SELECT, SPEAKING, WRITING } from "@/lib/test-prep/tasks";
import type { SpeakingTask, WritingTask } from "@/lib/test-prep/types";
import { attemptLabel } from "@/lib/test-prep/scoring";
import type { MessageKey } from "@/lib/i18n/messages";
import { AboutCard, BookingCard, ResourcesCard, SchoolsCard, useShortlistRequirements, type SchoolRequirement } from "./certificate-about";
import { PrepDialog, type PrepMode } from "./certificate-forms";
import { ExamRunner } from "./exam-runner";
import { useI18n, useT } from "./i18n";
import { FocusAreas, PracticeCard, useWeakSkills } from "./prep-overview";
import { useCollege } from "./provider";
import { QuestionBank, useBankProgress } from "./question-bank";
import { QuestionRunner } from "./question-runner";
import { ScoreChart } from "./score-chart";
import { CountryCard, useCountry } from "@/components/test-prep/country";
import { IeltsRunner } from "@/components/test-prep/ielts-runner";
import { WritingRunner } from "@/components/test-prep/writing-runner";
import { SpeakingRunner } from "@/components/test-prep/speaking-runner";
import { TaskRunner, type ShortTask } from "@/components/test-prep/task-runner";
import "./question-bank.css";
import "./certificates-library.css";
import "@/components/test-prep/test-prep.css";

export { CertificatesHome } from "@/components/test-prep/overview";

/** What is running full-screen over the page, if anything. */
type Run =
  | null
  | { type: "bank"; ids: string[]; ref: string }
  | { type: "mock"; mock: Mock; review?: MockAttempt }
  | { type: "sat"; test: SatTest; review?: MockAttempt }
  | { type: "ielts"; kind: "reading" | "listening"; id: string; review?: MockAttempt["answers"] }
  | { type: "writing"; tasks: WritingTask[] }
  | { type: "speaking"; task: SpeakingTask }
  | { type: "task"; task: ShortTask };

/** Exams whose old mini mocks are replaced by official-format practice. */
const FORMAT_PRACTICE = new Set(["sat", "ielts", "toefl", "duolingo"]);

function useDateText() {
  const { lang } = useI18n();
  return (iso: string) => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso));
}

/** One test: what it is, what it costs at home, what the student's universities
 * ask for, practice in the official format, and their score history. */
export function CertificateFolder({ exam, schools }: { exam: Exam; schools?: SchoolRequirement[] }) {
  const t = useT();
  const dateText = useDateText();
  const college = useCollege();
  const prefs = college?.profile?.preferences;
  const fallback = useMemo(() => planFallback(readPlan(prefs)?.tests), [prefs]);
  const { plans, attempts: all } = usePrepData();
  const plan: Plan = { ...fallback[exam.slug], ...plans[exam.slug] };
  const attempts = all[exam.slug] || [];
  const live = useShortlistRequirements(exam.slug);
  const list = schools ?? live;
  const hasShortlist = schools ? true : !!college?.saved?.length;
  const { progress, record } = useBankProgress(exam.slug);
  const weak = useWeakSkills(exam, progress);
  const info = infoBySlug(exam.slug);
  const [country, setCountry] = useCountry();

  const [tab, setTab] = useState("overview");
  const [lesson, setLesson] = useState(0);
  const [run, setRun] = useState<Run>(null);
  const [form, setForm] = useState<PrepMode | null>(null);
  const mocks = FORMAT_PRACTICE.has(exam.slug) && exam.slug !== "sat" ? [] : exam.mocks.filter((m) => !(exam.slug === "sat" && m.kind === "full"));
  const hasPractice = exam.practice.length > 0 || mocks.length > 0 || FORMAT_PRACTICE.has(exam.slug);
  const days = daysUntil(plan.date, isoToday());
  const close = () => setRun(null);

  if (run?.type === "mock") return <ExamRunner key={run.mock.id} exam={exam} mock={run.mock} review={run.review} questions={questionsById(exam, run.mock.questions)} onAnswer={record} onExit={close} />;
  if (run?.type === "sat") {
    const mock: Mock = { id: run.test.id, title: satTitle(t, run.test), minutes: run.test.minutes, kind: "full", questions: [] };
    return <ExamRunner key={run.test.id} exam={exam} mock={mock} sat={run.test} review={run.review} questions={[]} onAnswer={record} onExit={close} />;
  }
  if (run?.type === "ielts") {
    const test = run.kind === "reading" ? IELTS_READING.find((x) => x.id === run.id)! : IELTS_LISTENING.find((x) => x.id === run.id)!;
    return run.kind === "reading" ? (
      <IeltsRunner kind="reading" test={test as (typeof IELTS_READING)[number]} review={run.review} onExit={close} />
    ) : (
      <IeltsRunner kind="listening" test={test as (typeof IELTS_LISTENING)[number]} review={run.review} onExit={close} />
    );
  }
  if (run?.type === "writing") return <WritingRunner tasks={run.tasks} onExit={close} />;
  if (run?.type === "speaking") return <SpeakingRunner task={run.task} onExit={close} />;
  if (run?.type === "task") return <TaskRunner task={run.task} onExit={close} />;
  if (run?.type === "bank")
    return (
      <div className="ct">
        <QuestionRunner key={run.ids.join(",")} questions={questionsById(exam, run.ids)} activityRef={run.ref} onAnswer={record} onExit={close} />
      </div>
    );

  const practise = (ids: string[], ref: string) => setRun({ type: "bank", ids, ref });
  const firstTest = exam.slug === "sat" ? () => setRun({ type: "sat", test: satTests(exam.bank)[0] }) : exam.slug === "ielts" ? () => setRun({ type: "ielts", kind: "reading", id: IELTS_READING[0].id }) : null;
  const scored = attempts.filter((a) => a.total > 0);

  return (
    <div className="ct">
      <Link href="/dashboard/certificates" className="ct-back">
        <ArrowLeft size={14} aria-hidden="true" /> {t("ct.back")}
      </Link>
      <header className="ct-head">
        <b className="ct-chip ct-chip-lg">{exam.short}</b>
        <div>
          <h1>{info?.name || exam.name}</h1>
          <p>
            {info?.provider || exam.provider}
            {exam.official_url && (
              <>
                {" · "}
                <a href={exam.official_url} target="_blank" rel="noreferrer">
                  {t("ct.official")} <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </>
            )}
          </p>
        </div>
        <div className="ct-head-actions">
          <Button variant="outline" size="sm" onClick={() => setForm("plan")}>
            {plan.target != null || plan.date ? t("ct.edit_target") : t("ct.set_target")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setForm("score")}>
            {t("ct.log_score")}
          </Button>
        </div>
      </header>

      {(plan.target != null || plan.score != null || plan.date || scored.length > 0) && (
        <div className="ct-card ct-stats">
          <dl className="ct-facts-row">
            {plan.target != null && (
              <div>
                <dt>{t("ct.fact.target")}</dt>
                <dd>{plan.target}</dd>
              </div>
            )}
            {plan.score != null && (
              <div>
                <dt>{t("ct.fact.result")}</dt>
                <dd>{plan.score}</dd>
              </div>
            )}
            {scored.length > 0 && (
              <div>
                <dt>{t("pr.last")}</dt>
                <dd>{attemptLabel(scored[scored.length - 1])}</dd>
              </div>
            )}
            {plan.date && (
              <div>
                <dt>{t("ct.fact.date")}</dt>
                <dd>
                  {dateText(plan.date)}
                  {days !== null && days >= 0 && <small>{t("ct.in_days", { n: days })}</small>}
                </dd>
              </div>
            )}
          </dl>
          {days !== null && days < 0 && plan.date && <p className="ct-quiet">{t("ct.passed_on", { date: dateText(plan.date) })}</p>}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="ct-tabs">
        <TabsList variant="line">
          <TabsTrigger value="overview">{t("ct.tab.overview")}</TabsTrigger>
          {hasPractice && <TabsTrigger value="practice">{t("ct.tab.practice")}</TabsTrigger>}
          {attempts.length > 0 && <TabsTrigger value="history">{t("pr.tab.history")}</TabsTrigger>}
          {exam.lessons.length > 0 && <TabsTrigger value="course">{t("ct.tab.course")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="ct-stack">
          {hasPractice && firstTest && !scored.length && (
            <section className="ct-card ct-practice" aria-labelledby="tp-start">
              <div>
                <h2 id="tp-start">{t("ct.next.baseline")}</h2>
                <p className="ct-quiet">{t("pr.start_body." + exam.slug as MessageKey)}</p>
              </div>
              <div className="ct-actions">
                <Button onClick={firstTest}>
                  <Play aria-hidden="true" /> {t("ct.next.mock")}
                </Button>
                <Button variant="outline" onClick={() => setTab("practice")}>
                  {t("pr.all_practice")}
                </Button>
              </div>
            </section>
          )}
          {hasPractice && !firstTest && !FORMAT_PRACTICE.has(exam.slug) && (
            <PracticeCard exam={{ ...exam, mocks }} attempts={scored} weak={weak} onPractice={practise} onMock={(m) => setRun({ type: "mock", mock: m })} onBank={() => setTab("practice")} />
          )}
          {hasPractice && !firstTest && FORMAT_PRACTICE.has(exam.slug) && !scored.length && (
            <section className="ct-card ct-practice" aria-labelledby="tp-start">
              <div>
                <h2 id="tp-start">{t("pr.start_title")}</h2>
                <p className="ct-quiet">{t("pr.start_body." + exam.slug as MessageKey)}</p>
              </div>
              <div className="ct-actions">
                <Button onClick={() => setTab("practice")}>
                  <Play aria-hidden="true" /> {t("pr.all_practice")}
                </Button>
              </div>
            </section>
          )}
          <div className="ct-two">
            <div className="ct-stack">
              {info ? <InfoCard info={info} /> : <AboutCard exam={exam} />}
              {info?.prep.length ? <PrepLinks info={info} /> : <ResourcesCard exam={exam} />}
            </div>
            <div className="ct-stack">
              {info ? <CountryCard info={info} country={country} onCountry={setCountry} /> : <BookingCard exam={exam} />}
              <SchoolsCard exam={exam} schools={list} plan={plan} hasShortlist={hasShortlist} />
            </div>
          </div>
        </TabsContent>

        {hasPractice && (
          <TabsContent value="practice" className="ct-stack">
            <FormatPractice exam={exam} attempts={attempts} onRun={setRun} />
            <FocusAreas weak={weak} exam={exam} onPractice={practise} />
            {mocks.length > 0 && (
              <section className="ct-card" aria-labelledby="ct-mocks">
                <h2 id="ct-mocks">{exam.slug === "sat" ? t("pr.sat.mini") : t("ct.mocks.title")}</h2>
                <ul className="ct-mocks">
                  {mocks.map((m) => (
                    <li key={m.id}>
                      <span>
                        <strong>
                          {m.title} {m.kind && <Badge variant="secondary">{t(("ct.mock." + m.kind) as MessageKey)}</Badge>}
                        </strong>
                        <small>
                          <Clock size={12} aria-hidden="true" /> {t("ct.mocks.line", { q: m.questions.length, m: m.minutes })}
                        </small>
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setRun({ type: "mock", mock: m })}>
                        {t("ct.mocks.start")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {exam.practice.length > 0 && (
              <section className="ct-card" aria-labelledby="ct-bank">
                <h2 id="ct-bank">{t("ct.bank.title")}</h2>
                <p className="ct-quiet">{t("pr.bank.sub")}</p>
                <QuestionBank exam={exam} progress={progress} onStart={practise} />
              </section>
            )}
          </TabsContent>
        )}

        {attempts.length > 0 && (
          <TabsContent value="history" className="ct-stack">
            <History exam={exam} attempts={attempts} onRun={setRun} />
          </TabsContent>
        )}

        {exam.lessons.length > 0 && (
          <TabsContent value="course">
            <div className="ct-course">
              <ol className="ct-lessons">
                {exam.lessons.map((l, i) => (
                  <li key={l.id}>
                    <button type="button" aria-current={i === lesson} onClick={() => setLesson(i)}>
                      <span>{i + 1}</span>
                      <strong>{l.title}</strong>
                      <small>{t("ct.min", { n: l.minutes })}</small>
                    </button>
                  </li>
                ))}
              </ol>
              <article className="ct-card ct-lesson" key={exam.lessons[lesson].id}>
                <small>{t("ct.lesson.of", { n: lesson + 1, total: exam.lessons.length })}</small>
                <h2>{exam.lessons[lesson].title}</h2>
                {exam.lessons[lesson].body.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                {lesson < exam.lessons.length - 1 ? (
                  <Button className="ct-fit" onClick={() => setLesson((n) => n + 1)}>
                    {t("ct.lesson.next")}
                  </Button>
                ) : hasPractice ? (
                  <Button className="ct-fit" onClick={() => setTab("practice")}>
                    {t("ct.lesson.practise")}
                  </Button>
                ) : null}
              </article>
            </div>
          </TabsContent>
        )}
      </Tabs>

      <PrepDialog open={form !== null} onOpenChange={(o) => !o && setForm(null)} mode={form ?? "plan"} exam={exam} plan={plan} />
    </div>
  );
}

const satTitle = (t: ReturnType<typeof useT>, test: SatTest) => t(test.section === "math" ? "pr.sat.test_math" : "pr.sat.test_rw", { n: test.n });

/** What the exam is, its sections and timing, and its score scale. */
function InfoCard({ info }: { info: ExamInfo }) {
  const t = useT();
  return (
    <section className="ct-card ct-about" aria-labelledby="ct-about">
      <h2 id="ct-about">{t("ct.about.title")}</h2>
      <p className="ct-quiet">{t(("pr.what." + info.slug) as MessageKey)}</p>
      <ul className="ct-sections">
        <li className="ct-sections-head" aria-hidden="true">
          <span>{t("ct.about.section")}</span>
          <span>{t("pr.minutes")}</span>
          <span>{t("ct.about.questions")}</span>
        </li>
        {info.sections.map((s) => (
          <li key={s.name}>
            <span>
              <strong>{s.name}</strong>
            </span>
            <span>{s.minutes}</span>
            <span>{s.items}</span>
          </li>
        ))}
      </ul>
      <dl className="ct-facts">
        <div>
          <dt>{t("ct.about.total")}</dt>
          <dd>{info.total}</dd>
        </div>
        <div>
          <dt>{t("ct.about.scores")}</dt>
          <dd>
            {info.scale}
            <small> · {t(("pr.scale." + info.slug) as MessageKey)}</small>
          </dd>
        </div>
        {info.validity && (
          <div>
            <dt>{t("ct.about.valid")}</dt>
            <dd>{t("pr.years", { n: info.validity })}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function PrepLinks({ info }: { info: ExamInfo }) {
  const t = useT();
  return (
    <section className="ct-card" aria-labelledby="ct-res">
      <h2 id="ct-res">{t("pr.prep_links")}</h2>
      <ul className="ct-res">
        {info.prep.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noreferrer">
              <span>
                <strong>{r.title}</strong>
                <small>{new URL(r.url).hostname.replace(/^www\./, "")}</small>
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Row = { id: string; title: string; meta: string; icon?: "write" | "speak"; start: () => void };

/** Practice in the exam's own format, grouped the way the exam is. */
function FormatPractice({ exam, attempts, onRun }: { exam: Exam; attempts: MockAttempt[]; onRun: (r: Run) => void }) {
  const t = useT();
  const last = (ref: string) => [...attempts].reverse().find((a) => a.ref === ref || a.mock_id === ref);
  const groups: { title: string; note?: string; rows: Row[] }[] = [];
  const min = (n: number) => t("ct.min", { n });
  const writing = (exam2: string, kinds: WritingTask["kind"][]) => WRITING.filter((w) => w.exam === exam2 && kinds.includes(w.kind));
  const speaking = (exam2: string) => SPEAKING.filter((s) => s.exam === exam2);
  const wRow = (w: WritingTask): Row => ({ id: w.id, title: w.title, meta: `${min(w.minutes)} · ${t("pr.min_words", { n: w.minWords })}`, icon: "write", start: () => onRun({ type: "writing", tasks: [w] }) });
  const sRow = (s: SpeakingTask): Row => ({ id: s.id, title: s.title, meta: t("pr.n_prompts", { n: s.items.length }), icon: "speak", start: () => onRun({ type: "speaking", task: s }) });

  if (exam.slug === "sat") {
    groups.push({
      title: t("pr.sat.full"),
      note: t("pr.sat.full_note"),
      rows: satTests(exam.bank).map((x) => ({ id: x.id, title: satTitle(t, x), meta: `${x.modules.m1.length * 2} ${t("ct.ex.questions").toLowerCase()} · ${min(x.minutes)} · ${t("pr.sat.two_modules")}`, start: () => onRun({ type: "sat", test: x }) })),
    });
  }
  if (exam.slug === "ielts") {
    groups.push({ title: t("pr.ie.listening"), note: t("pr.ie.listening_note"), rows: IELTS_LISTENING.map((x) => ({ id: x.id, title: x.title, meta: `40 · ${min(30)}`, start: () => onRun({ type: "ielts", kind: "listening", id: x.id }) })) });
    groups.push({ title: t("pr.ie.reading"), rows: IELTS_READING.map((x) => ({ id: x.id, title: x.title, meta: `40 · ${min(60)} · ${t("pr.ie.three_passages")}`, start: () => onRun({ type: "ielts", kind: "reading", id: x.id }) })) });
    // Rotate through the prompts so each full test is a new pair.
    const fulls = attempts.filter((a) => a.kind === "writing").length;
    const t1 = writing("ielts", ["task1"]),
      t2 = writing("ielts", ["task2"]);
    groups.push({
      title: t("pr.wr.writing"),
      rows: [
        { id: "ielts-writing-full", title: t("pr.wr.full"), meta: `${min(60)} · ${t("pr.wr.full_meta")}`, icon: "write", start: () => onRun({ type: "writing", tasks: [t1[fulls % t1.length], t2[fulls % t2.length]] }) },
        ...t1.map(wRow),
        ...t2.map(wRow),
      ],
    });
    groups.push({ title: t("pr.sp.speaking"), note: t("pr.sp.note"), rows: speaking("ielts").map(sRow) });
  }
  if (exam.slug === "toefl") {
    groups.push({ title: t("pr.toefl.reading"), rows: CTESTS.filter((c) => c.exam === "toefl").map((c) => ({ id: c.id, title: c.title, meta: min(c.minutes), start: () => onRun({ type: "task", task: { type: "ctest", exam: "toefl", set: c } }) })) });
    groups.push({
      title: t("pr.wr.writing"),
      rows: [
        { id: "toefl-build", title: t("pr.toefl.build"), meta: t("pr.n_prompts", { n: BUILD.length }), icon: "write", start: () => onRun({ type: "task", task: { type: "build", exam: "toefl", id: "toefl-build", title: t("pr.toefl.build"), items: BUILD } }) },
        ...writing("toefl", ["email", "discussion"]).map(wRow),
      ],
    });
    groups.push({ title: t("pr.sp.speaking"), note: t("pr.sp.note"), rows: speaking("toefl").map(sRow) });
  }
  if (exam.slug === "duolingo") {
    groups.push({
      title: t("pr.det.literacy"),
      rows: [
        { id: "det-select", title: t("pr.det.select"), meta: t("pr.n_prompts", { n: READ_SELECT.length }), start: () => onRun({ type: "task", task: { type: "select", exam: "duolingo", id: "det-select", title: t("pr.det.select"), sets: READ_SELECT } }) },
        ...FILL_BLANKS.map((c) => ({ id: c.id, title: c.title, meta: min(c.minutes), start: () => onRun({ type: "task", task: { type: "ctest", exam: "duolingo", set: c } as ShortTask }) })),
        ...CTESTS.filter((c) => c.exam === "duolingo").map((c) => ({ id: c.id, title: c.title, meta: min(c.minutes), start: () => onRun({ type: "task", task: { type: "ctest", exam: "duolingo", set: c } as ShortTask }) })),
      ],
    });
    groups.push({ title: t("pr.det.listening"), rows: LISTEN_TYPE.map((s) => ({ id: s.id, title: s.title, meta: t("pr.n_prompts", { n: s.sentences.length }), start: () => onRun({ type: "task", task: { type: "listen", exam: "duolingo", set: s } }) })) });
    groups.push({ title: t("pr.wr.writing"), rows: writing("duolingo", ["det-interactive", "det-sample"]).map(wRow) });
    groups.push({ title: t("pr.sp.speaking"), note: t("pr.sp.note"), rows: speaking("duolingo").map(sRow) });
  }
  if (!groups.length) return null;
  return (
    <>
      {groups.map((g) => (
        <section key={g.title} className="ct-card" aria-label={g.title}>
          <header className="ct-card-head">
            <h2>{g.title}</h2>
          </header>
          {g.note && <p className="ct-quiet">{g.note}</p>}
          <ul className="ct-mocks">
            {g.rows.map((r) => {
              const l = last(r.id);
              return (
                <li key={r.id}>
                  <span>
                    <strong>
                      {r.icon === "write" && <PenLine size={14} aria-hidden="true" />}
                      {r.icon === "speak" && <Mic size={14} aria-hidden="true" />} {r.title}
                    </strong>
                    <small>
                      {r.meta}
                      {l && attemptLabel(l) ? ` · ${t("pr.last_short", { v: attemptLabel(l) })}` : l ? ` · ${t("pr.done_before")}` : ""}
                    </small>
                  </span>
                  <Button variant="outline" size="sm" onClick={r.start}>
                    {l ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />} {l ? t("pr.again") : t("ct.mocks.start")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="ct-note">{t("pr.original")}</p>
    </>
  );
}

/** Every attempt on this device, newest first, with a chart of scored tests. */
function History({ exam, attempts, onRun }: { exam: Exam; attempts: MockAttempt[]; onRun: (r: Run) => void }) {
  const t = useT();
  const dateText = useDateText();
  const scored = attempts.filter((a) => a.total > 0);
  const series = (() => {
    // One scale per chart: SAT sections, IELTS bands, else percent.
    const sat = scored.filter((a) => a.scaled);
    if (sat.length >= 1 && exam.slug === "sat") return sat;
    const band = scored.filter((a) => a.band != null);
    if (band.length >= 1 && exam.slug === "ielts") return band;
    return scored.filter((a) => !a.scaled && a.band == null);
  })();
  const review = (a: MockAttempt) => {
    if (!a.answers) return null;
    if (exam.slug === "sat" && a.ref) {
      const test = satTests(exam.bank).find((x) => x.id === a.ref);
      if (test) return () => onRun({ type: "sat", test, review: a });
    }
    if (exam.slug === "ielts" && a.ref) {
      if (IELTS_READING.some((x) => x.id === a.ref)) return () => onRun({ type: "ielts", kind: "reading", id: a.ref!, review: a.answers });
      if (IELTS_LISTENING.some((x) => x.id === a.ref)) return () => onRun({ type: "ielts", kind: "listening", id: a.ref!, review: a.answers });
    }
    const mock = exam.mocks.find((m) => m.id === a.mock_id);
    if (mock) return () => onRun({ type: "mock", mock, review: a });
    return null;
  };
  return (
    <>
      {series.length > 0 && (
        <section className="ct-card" aria-labelledby="tp-chart">
          <header className="ct-card-head">
            <h2 id="tp-chart">{t("ct.progress.title")}</h2>
            <small>{exam.slug === "sat" ? t("pr.hist.sat") : exam.slug === "ielts" ? t("pr.hist.band") : t("pr.hist.pct")}</small>
          </header>
          <ScoreChart attempts={series} />
        </section>
      )}
      <section className="ct-card" aria-labelledby="tp-hist">
        <h2 id="tp-hist">{t("pr.hist.title")}</h2>
        <ul className="tp-history">
          {[...attempts].reverse().map((a, i) => {
            const open = review(a);
            return (
              <li key={a.date + i}>
                <span>
                  <strong>{a.title}</strong>
                  <small>
                    {dateText(a.date)}
                    {a.route ? ` · ${a.route === "hard" ? t("pr.sat.route_h") : t("pr.sat.route_e")}` : ""}
                    {a.total > 0 && !a.band && !a.scaled ? ` · ${t("ct.chart.correct", { a: a.correct, b: a.total })}` : ""}
                    {a.band != null ? ` · ${t("pr.ie.raw", { a: a.correct, b: a.total })}` : ""}
                  </small>
                  {a.text && (
                    <details>
                      <summary>{t("pr.hist.answer")}</summary>
                      <p>{a.text}</p>
                    </details>
                  )}
                </span>
                {attemptLabel(a) && <b className="tp-hist-v">{attemptLabel(a)}</b>}
                {open && (
                  <Button variant="outline" size="sm" onClick={open}>
                    {t("pr.review")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="ct-quiet">{t("pr.hist.device")}</p>
      </section>
    </>
  );
}
