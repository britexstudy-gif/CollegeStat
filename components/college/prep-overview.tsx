"use client";
import { useMemo } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Exam, Mock, Question } from "@/lib/certificates";
import type { MockAttempt } from "@/lib/exam-score";
import { useT } from "./i18n";

const pick = (qs: Question[], n = 10) =>
  qs
    .map((q) => q.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, n);

/** Skills with at least three answers, weakest first. */
export function useWeakSkills(exam: Exam, progress: Record<string, 0 | 1>) {
  return useMemo(() => {
    const by = new Map<string, Question[]>();
    for (const q of exam.practice) {
      const k = q.skill || q.domain || q.section || "General";
      by.set(k, [...(by.get(k) || []), q]);
    }
    return [...by.entries()]
      .map(([skill, qs]) => {
        const done = qs.filter((q) => progress[q.id] !== undefined);
        const ok = done.filter((q) => progress[q.id] === 1).length;
        return { skill, qs, done: done.length, pct: done.length ? Math.round((ok / done.length) * 100) : 0 };
      })
      .filter((s) => s.done >= 3)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 4);
  }, [exam.practice, progress]);
}

/** One suggested next step, and the ways into practice. */
export function PracticeCard({
  exam,
  attempts,
  weak,
  onPractice,
  onMock,
  onBank,
}: {
  exam: Exam;
  attempts: MockAttempt[];
  weak: ReturnType<typeof useWeakSkills>;
  onPractice: (ids: string[], ref: string) => void;
  onMock: (mock: Mock) => void;
  onBank?: () => void;
}) {
  const t = useT();
  const fullMock = exam.mocks.find((m) => m.kind === "full") || exam.mocks[0];
  if (!fullMock && !exam.practice.length) return null;
  const first = weak[0];
  const step =
    !attempts.length && fullMock
      ? { title: t("ct.next.baseline"), body: t("ct.next.baseline_body"), cta: t("ct.next.mock"), run: () => onMock(fullMock) }
      : first && first.pct < 70
        ? { title: t("ct.next.strengthen", { skill: first.skill }), body: t("ct.next.strengthen_body", { n: first.pct }), cta: t("ct.next.practise"), run: () => onPractice(pick(first.qs), `${exam.slug}:${first.skill}`) }
        : { title: t("ct.next.keep"), body: t("ct.next.keep_body"), cta: t("ct.next.practise"), run: () => onPractice(pick(exam.practice), `${exam.slug}:mixed`) };
  return (
    <section className="ct-card ct-practice" aria-labelledby="ct-practice">
      <div>
        <h2 id="ct-practice">{step.title}</h2>
        <p className="ct-quiet">{step.body}</p>
      </div>
      <div className="ct-actions">
        <Button onClick={step.run}>
          <Play aria-hidden="true" /> {step.cta}
        </Button>
        {onBank && exam.practice.length > 0 && (
          <Button variant="outline" onClick={onBank}>
            {t("ct.next.bank")}
          </Button>
        )}
      </div>
    </section>
  );
}

export function FocusAreas({ weak, exam, onPractice }: { weak: ReturnType<typeof useWeakSkills>; exam: Exam; onPractice: (ids: string[], ref: string) => void }) {
  const t = useT();
  if (!weak.length) return null;
  return (
    <section className="ct-card" aria-labelledby="ct-focus">
      <h2 id="ct-focus">{t("ct.focus.title")}</h2>
      <ul className="ct-focus">
        {weak.map((w) => (
          <li key={w.skill}>
            <span>
              <strong>{w.skill}</strong>
              <small>{t("ct.focus.line", { n: w.done, pct: w.pct })}</small>
            </span>
            <Progress value={w.pct} aria-label={w.skill} className="ct-bar" />
            <Button variant="ghost" size="sm" onClick={() => onPractice(pick(w.qs), `${exam.slug}:${w.skill}`)}>
              {t("ct.focus.go")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
