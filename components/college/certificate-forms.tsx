"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Exam } from "@/lib/certificates";

/** Only the name and slug are needed, so the light overview can pass its own list. */
type ExamChoice = Pick<Exam, "slug" | "name">;
import { EXAM_META, isoToday, parseScore, savePlan, type Plan } from "@/lib/prep-plan";
import { saveTestRecord } from "@/services/student-qualifications";
import { useCollege } from "./provider";
import { useT } from "./i18n";

export type PrepMode = "plan" | "score";
const KIND = { ielts: "IELTS Academic", toefl: "TOEFL iBT", duolingo: "Duolingo", sat: "SAT", act: "ACT" } as const;

/** Set a target and test date, or log a result. Saved on this device with the same helper the
 * overview reads; a result is also added to the private profile when signed in. */
export function PrepDialog({
  open,
  onOpenChange,
  mode,
  exam,
  choices,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PrepMode;
  /** The test this form is for; omit to let the student pick from `choices`. */
  exam?: ExamChoice;
  choices?: ExamChoice[];
  plan?: Plan;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ct-dialog">{open && <PrepForm mode={mode} exam={exam} choices={choices} plan={plan} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function PrepForm({ mode, exam, choices, plan, onDone }: { mode: PrepMode; exam?: ExamChoice; choices?: ExamChoice[]; plan?: Plan; onDone: () => void }) {
  const t = useT();
  const college = useCollege();
  const [slug, setSlug] = useState(exam?.slug ?? choices?.[0]?.slug ?? "");
  const [score, setScore] = useState(plan?.score != null ? String(plan.score) : "");
  const [target, setTarget] = useState(plan?.target != null ? String(plan.target) : "");
  const [date, setDate] = useState((mode === "plan" ? plan?.date : plan?.scored_on) ?? "");
  const [error, setError] = useState("");
  const meta = EXAM_META[slug];
  const name = exam?.name ?? choices?.find((c) => c.slug === slug)?.name ?? "";
  const range = meta ? `${meta.min}–${meta.max}` : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta) return;
    const field = mode === "score" ? score : target;
    const value = parseScore(slug, field);
    if (mode === "score" && value === undefined) return setError(t("ct.form.range", { range }));
    if (mode === "plan" && field.trim() && value === undefined) return setError(t("ct.form.range", { range }));
    if (mode === "score" && date && date > isoToday()) return setError(t("ct.form.future"));
    // Plans for other exams are read fresh so one form never overwrites another exam's data.
    const current = slug === exam?.slug && plan ? plan : readPlan(slug);
    if (mode === "plan") savePlan(slug, { ...current, target: value, date: date || undefined });
    else savePlan(slug, { ...current, score: value, scored_on: date || undefined });
    onDone();
    const kind = KIND[slug as keyof typeof KIND];
    if (mode === "score" && kind && college?.user && value !== undefined) {
      try {
        await saveTestRecord(college.accountScope, {
          id: crypto.randomUUID(),
          kind,
          label: name,
          status: "taken",
          taken_on: date || null,
          score_label: String(value),
          scale_label: range,
        });
      } catch {
        toast.error(t("ct.form.profile_failed"));
      }
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{mode === "score" ? t("ct.form.score_title") : exam ? t("ct.form.plan_title") : t("ct.form.add_title")}</DialogTitle>
        <DialogDescription>{mode === "score" ? t("ct.form.score_hint") : t("ct.form.plan_hint")}</DialogDescription>
      </DialogHeader>
      <FieldGroup className="ct-form">
        {!exam && choices && (
          <Field>
            <FieldLabel htmlFor="ct-test">{t("ct.form.test")}</FieldLabel>
            <NativeSelect id="ct-test" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full">
              {choices.map((c) => (
                <NativeSelectOption key={c.slug} value={c.slug}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="ct-score">
            {mode === "score" ? t("ct.form.score") : t("ct.form.target")} <span className="ct-form-range">({range})</span>
          </FieldLabel>
          <Input
            id="ct-score"
            inputMode="decimal"
            autoComplete="off"
            value={mode === "score" ? score : target}
            onChange={(e) => {
              setError("");
              (mode === "score" ? setScore : setTarget)(e.target.value);
            }}
            aria-invalid={!!error}
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ct-date">{mode === "score" ? t("ct.form.taken") : t("ct.form.date")}</FieldLabel>
          <Input id="ct-date" type="date" value={date} max={mode === "score" ? isoToday() : undefined} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("ct.form.cancel")}
        </Button>
        <Button type="submit">{t("ct.form.save")}</Button>
      </DialogFooter>
    </form>
  );
}

function readPlan(slug: string): Plan {
  try {
    return JSON.parse(localStorage.getItem("collegestat-prep:" + slug) || "{}") || {};
  } catch {
    return {};
  }
}
