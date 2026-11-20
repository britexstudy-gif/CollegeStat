"use client";
import { useRef, useState } from "react";
import { Check, ExternalLink, FileDown, FileText, Sparkles, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { NativeSelect } from "@/components/ui/native-select";
import { countText, essayType, splitSections } from "@/lib/essay-types";
import { docType } from "@/lib/university-essays";
import type { StudentAIResult } from "@/lib/student-ai";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n, type Translate } from "../i18n";
import { cn } from "@/lib/utils";
import { askFeedback } from "./ai";
import { readWritingDraft } from "./store";
import type { FieldDef, Issue, Option, Values } from "./forms";

export function issueText(i: Issue, t: Translate) {
  const unit = i.unit ? t(i.unit === "words" ? "wd.unit.words" : "wd.unit.chars") : "";
  if (i.problem === "required") return t("imk.p.required");
  if (i.problem === "choose") return t("imk.p.choose", { n: i.n ?? 0 });
  return t(("app.sim.p." + i.problem) as MessageKey, { n: i.n ?? 0, unit });
}

/** Feedback card: questions and suggestions only. */
function FeedbackCard({ result }: { result: StudentAIResult }) {
  const t = useI18n().t;
  return (
    <div className="pt-feedback" role="status">
      <p>{result.summary}</p>
      {result.strengths.length > 0 && (
        <div>
          <strong>{t("app.sim.ai.strengths")}</strong>
          <ul>{result.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {result.next_steps.length > 0 && (
        <div>
          <strong>{t("app.sim.ai.steps")}</strong>
          <ul>
            {result.next_steps.map((s) => (
              <li key={s.title}>
                <b>{s.title}.</b> {s.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      <small>{t("app.sim.ai.note")}</small>
    </div>
  );
}

export function AICheck({ mode, text, disabled }: { mode: "essay_feedback" | "application_review"; text: string; disabled?: boolean }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<{ busy: boolean; result?: StudentAIResult; error?: string }>({ busy: false });
  const run = async () => {
    setState({ busy: true });
    try {
      setState({ busy: false, result: await askFeedback(mode, text, lang, t("app.sim.ai.error")) });
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : t("app.sim.ai.error") });
    }
  };
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={run} disabled={disabled || state.busy || text.trim().length < 10}>
        {state.busy ? <Spinner /> : <Sparkles />}
        {t("app.sim.ai.check")}
      </Button>
      {state.error && <p className="pt-error" role="alert">{state.error}</p>}
      {state.result && <FeedbackCard result={state.result} />}
    </>
  );
}

/** Live counter, in the portal's own unit. */
function Counter({ n, max, min, unit }: { n: number; max?: number; min?: number; unit: "words" | "chars" }) {
  const { t } = useI18n();
  const over = !!max && n > max;
  const under = !!min && n > 0 && n < min;
  return (
    <span className={cn("pt-count", over && "is-over", under && "is-under")} aria-live="polite">
      {max ? `${n.toLocaleString()} / ${max.toLocaleString()}` : n.toLocaleString()} {t(unit === "words" ? "wd.unit.words" : "wd.unit.chars")}
      {min ? ` · ${t("app.sim.min", { n: min })}` : ""}
    </span>
  );
}

function Essay({ field, id, value, onChange, invalid }: { field: FieldDef; id: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const { t } = useI18n();
  const unit = field.unit || "words";
  const n = countText(value, unit);
  const [imported, setImported] = useState<"none" | "empty" | "done">("none");
  const importDraft = async () => {
    const type = field.writing ? essayType(docType(field.writing)) : null;
    const body = field.writing ? await readWritingDraft(field.writing) : "";
    const text = type?.sections ? splitSections(type, body)[field.part || 0] : body;
    if (!text?.trim()) return setImported("empty");
    onChange(text.trim());
    setImported("done");
  };
  return (
    <div className="pt-essay">
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || (!!field.max && n > field.max)} className="min-h-44 resize-y leading-relaxed" />
      <div className="pt-essay-bar">
        <Counter n={n} max={field.max} min={field.min} unit={unit} />
        <span className="flex-1" />
        {field.writing && (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={importDraft}>
              <FileDown />
              {t("app.sim.writing.import")}
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <a href={"/dashboard?section=Writing&doc=" + encodeURIComponent(field.writing)} target="_blank" rel="noreferrer">
                <ExternalLink />
                {t("app.sim.writing.open")}
              </a>
            </Button>
          </>
        )}
        <AICheck mode="essay_feedback" text={value} />
      </div>
      {imported === "empty" && <p className="pt-hint">{t("app.sim.writing.none")}</p>}
    </div>
  );
}

const optionText = (o: Option, t: Translate) => o.text ?? (o.label ? t(o.label) : o.value);

/** A practice upload: the file never leaves the device, only its name is kept. */
function FileField({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("pt-file", value && "is-set", invalid && "is-invalid")}>
      <input ref={input} id={id} type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0].name)} />
      {value ? (
        <>
          <FileText aria-hidden="true" />
          <span className="pt-file-name">{value}</span>
          <button type="button" className="pt-icon-btn" onClick={() => onChange("")} aria-label={t("imk.file.remove")}>
            <X aria-hidden="true" />
          </button>
        </>
      ) : (
        <>
          <span className="pt-file-name is-empty">{t("imk.file.none")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <Upload />
            {t("imk.file.upload")}
          </Button>
        </>
      )}
    </div>
  );
}

/** One field of a practice form. `name` is the key in the values map. */
export function FieldInput({ field, name, values, set, issue }: { field: FieldDef; name: string; values: Values; set: (key: string, value: string | boolean) => void; issue?: Issue }) {
  const t = useI18n().t;
  const raw = values[name];
  const value = typeof raw === "string" ? raw : "";
  const label = t(field.label);
  const id = "sim-" + name.replace(/[^a-z0-9]/gi, "-");
  const invalid = !!issue;
  const hint = field.hint ? t(field.hint) : "";
  const wide = field.wide || field.type === "essay" || field.type === "textarea" || field.type === "file";
  const star = field.required ? (
    <span className="pt-req" aria-hidden="true">
      {" "}*
    </span>
  ) : null;
  const error = issue ? (
    <p className="pt-error" id={id + "-err"}>
      {issueText(issue, t)}
    </p>
  ) : null;
  const heading = field.heading ? <h4 className="pt-subhead">{t(field.heading)}</h4> : null;

  if (field.type === "check")
    return (
      <>
        {heading}
        <div className={cn("pt-field pt-check", field.wide && "is-wide")}>
          <Checkbox id={id} checked={raw === true} onCheckedChange={(c) => set(name, c === true)} aria-invalid={invalid} />
          <label htmlFor={id}>
            {label}
            {star}
            {hint && <small>{hint}</small>}
          </label>
          {error}
        </div>
      </>
    );

  if (field.type === "radio" || field.type === "multi") {
    const many = field.type === "multi";
    const chosen = many ? value.split(", ").filter(Boolean) : [value];
    const long = (field.options || []).some((o) => optionText(o, t).length > 40);
    const toggle = (v: string) => {
      if (!many) return set(name, v);
      const next = chosen.includes(v) ? chosen.filter((x) => x !== v) : v === "none" ? ["none"] : [...chosen.filter((x) => x !== "none"), v];
      const order = (field.options || []).map((o) => o.value);
      set(name, next.sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(", "));
    };
    return (
      <>
        {heading}
        <fieldset className={cn("pt-field", wide && "is-wide")} aria-invalid={invalid}>
          <legend className="pt-label">
            {label}
            {star}
          </legend>
          {hint && <p className="pt-hint">{hint}</p>}
          <div className={cn("pt-choices", long && "is-long")} role={many ? "group" : "radiogroup"}>
            {(field.options || []).map((o, i) => {
              const on = chosen.includes(o.value);
              return (
                <button key={o.value} type="button" role={many ? "checkbox" : "radio"} aria-checked={on} className={cn("pt-choice", on && "is-on")} onClick={() => toggle(o.value)}>
                  <span className={cn("pt-dot", many && "is-box")} aria-hidden="true">
                    {on && many && <Check />}
                  </span>
                  {long && <span className="pt-choice-n">{i + 1}.</span>}
                  <span>{optionText(o, t)}</span>
                </button>
              );
            })}
          </div>
          {error}
        </fieldset>
      </>
    );
  }

  const describedBy = issue ? id + "-err" : undefined;
  return (
    <>
      {heading}
      <div className={cn("pt-field", wide && "is-wide")}>
        <label htmlFor={id} className="pt-label">
          {label}
          {star}
        </label>
        {field.type === "select" ? (
          <NativeSelect id={id} value={value} onChange={(e) => set(name, e.target.value)} aria-invalid={invalid} aria-describedby={describedBy} className="w-full">
            <option value="">{t("imk.select")}</option>
            {(field.options || []).map((o) => (
              <option key={o.value} value={o.value}>
                {optionText(o, t)}
              </option>
            ))}
          </NativeSelect>
        ) : field.type === "essay" ? (
          <Essay field={field} id={id} value={value} onChange={(v) => set(name, v)} invalid={invalid} />
        ) : field.type === "file" ? (
          <FileField id={id} value={value} onChange={(v) => set(name, v)} invalid={invalid} />
        ) : field.type === "textarea" ? (
          <Textarea id={id} value={value} onChange={(e) => set(name, e.target.value)} aria-invalid={invalid} aria-describedby={describedBy} className="min-h-24" />
        ) : (
          <Input
            id={id}
            type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
            min={field.range?.[0]}
            max={field.range?.[1]}
            value={value}
            onChange={(e) => set(name, e.target.value)}
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
        {(field.type === "textarea" || (field.counter && field.type === "text")) && field.max ? <Counter n={value.length} max={field.max} unit="chars" /> : null}
        {hint && <p className="pt-hint">{hint}</p>}
        {error}
      </div>
    </>
  );
}
