"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Exam, Question } from "@/lib/certificates";
import { useT } from "./i18n";

type Level = "all" | "easy" | "medium" | "hard";
type Progress = Record<string, 0 | 1>;

const LEVELS: Level[] = ["all", "easy", "medium", "hard"];
const SIZES = [10, 20, 0] as const;
const ORDER: Record<string, number> = { reading_writing: 0, math: 1 };

const sectionOf = (q: Question) => q.section || "Practice";
const domainOf = (q: Question) => q.domain || q.skill?.split(":")[0]?.trim() || "General";
const skillOf = (q: Question) => q.skill || domainOf(q);

/** Answered questions per exam, kept on this device. */
export function useBankProgress(slug: string) {
  const key = "collegestat-qbank:" + slug;
  const [progress, setProgress] = useState<Progress>({});
  useEffect(() => {
    let alive = true;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      if (saved && typeof saved === "object") queueMicrotask(() => alive && setProgress(saved));
    } catch {}
    return () => {
      alive = false;
    };
  }, [key]);
  const record = useCallback(
    (results: { id: string; correct: boolean }[]) => {
      if (!results.length) return;
      setProgress((old) => {
        const next = { ...old };
        for (const r of results) next[r.id] = r.correct ? 1 : 0;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [key],
  );
  return { progress, record };
}

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** The practice bank: section → domain → skill, filterable by difficulty. */
export function QuestionBank({
  exam,
  progress,
  onStart,
}: {
  exam: Exam;
  progress: Progress;
  onStart: (ids: string[], ref: string) => void;
}) {
  const t = useT();
  const sectionLabel = (s: string) => (s === "math" ? t("ct.sec.math") : s === "reading_writing" ? t("ct.sec.reading_writing") : s);
  const sections = useMemo(
    () =>
      [...new Set(exam.practice.map(sectionOf))].sort(
        (a, b) => (ORDER[a] ?? 9) - (ORDER[b] ?? 9),
      ),
    [exam],
  );
  const [section, setSection] = useState(sections[0]);
  const [level, setLevel] = useState<Level>("all");
  const [size, setSize] = useState<(typeof SIZES)[number]>(10);
  const [fresh, setFresh] = useState(false);

  const inSection = useMemo(() => exam.practice.filter((q) => sectionOf(q) === section), [exam.practice, section]);
  const matches = (q: Question) =>
    (level === "all" || q.difficulty === level) && (!fresh || progress[q.id] === undefined);
  const pool = inSection.filter(matches);
  const tree = useMemo(() => {
    const domains = new Map<string, Map<string, Question[]>>();
    for (const q of inSection) {
      const d = domainOf(q);
      if (!domains.has(d)) domains.set(d, new Map());
      const skills = domains.get(d)!;
      skills.set(skillOf(q), [...(skills.get(skillOf(q)) || []), q]);
    }
    return [...domains.entries()];
  }, [inSection]);

  const done = inSection.filter((q) => progress[q.id] !== undefined).length;
  const correct = inSection.filter((q) => progress[q.id] === 1).length;
  const start = (list: Question[], ref: string) => {
    const picked = shuffle(list.filter(matches));
    onStart((size ? picked.slice(0, size) : picked).map((q) => q.id), ref);
  };
  const levelName = (l: Level) => t(("ct.level." + l) as "ct.level.all");

  return (
    <div className="qb">
      <div className="qb-bar">
        {sections.length > 1 && (
          <ToggleGroup type="single" variant="outline" value={section} onValueChange={(v) => v && setSection(v)} aria-label={t("ct.bank.section")}>
            {sections.map((s) => (
              <ToggleGroupItem key={s} value={s}>
                {sectionLabel(s)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <ToggleGroup type="single" variant="outline" value={level} onValueChange={(v) => v && setLevel(v as Level)} aria-label={t("ct.bank.difficulty")}>
          {LEVELS.map((l) => (
            <ToggleGroupItem key={l} value={l}>
              {levelName(l)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" value={String(size)} onValueChange={(v) => v && setSize(Number(v) as (typeof SIZES)[number])} aria-label={t("ct.bank.count")}>
          {SIZES.map((n) => (
            <ToggleGroupItem key={n} value={String(n)}>
              {n || t("ct.bank.all")}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="qb-fresh">
          <Checkbox id="qb-fresh" checked={fresh} onCheckedChange={(c) => setFresh(c === true)} />
          <Label htmlFor="qb-fresh">{t("ct.bank.fresh")}</Label>
        </div>
        <Button className="qb-go" disabled={!pool.length} onClick={() => start(inSection, `${exam.slug}:${section}`)}>
          <Play aria-hidden="true" /> {t("ct.bank.practise", { n: size && pool.length > size ? size : pool.length })}
        </Button>
      </div>

      <div className="qb-progress">
        <p>
          {t("ct.bank.answered", { a: done, b: inSection.length })}
          {done > 0 && ` · ${t("ct.bank.correct", { n: Math.round((correct / done) * 100) })}`}
        </p>
        <Progress value={inSection.length ? (done / inSection.length) * 100 : 0} aria-label={t("ct.bank.answered", { a: done, b: inSection.length })} />
      </div>

      <div className="qb-domains">
        {tree.map(([domain, skills]) => {
          const all = [...skills.values()].flat();
          return (
            <section key={domain} className="qb-domain" aria-label={domain}>
              <header>
                <h3>{domain}</h3>
                <span>
                  {all.filter((q) => progress[q.id] !== undefined).length}/{all.length}
                </span>
                <Button variant="ghost" size="sm" onClick={() => start(all, `${exam.slug}:${domain}`)}>
                  {t("ct.bank.topic")}
                </Button>
              </header>
              <ul>
                {[...skills.entries()].map(([skill, qs]) => {
                  const answered = qs.filter((q) => progress[q.id] !== undefined).length;
                  return (
                    <li key={skill}>
                      <button type="button" className="qb-skill" disabled={!qs.some(matches)} onClick={() => start(qs, `${exam.slug}:${skill}`)}>
                        <span className="qb-skill-name">
                          {skill === domain ? t("ct.bank.every") : skill.replace(domain + ": ", "")}
                          <small>{t("ct.bank.done", { a: answered, b: qs.length })}</small>
                        </span>
                        <Play size={13} aria-hidden="true" className="qb-play" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="qb-legend">{t("ct.bank.legend")}</p>
    </div>
  );
}
