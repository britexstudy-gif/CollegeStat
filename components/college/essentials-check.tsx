"use client";
/* "2027 essentials": the three facts a family checks first (next deadline,
 * international tuition, IELTS minimum), each marked verified with its official
 * source and date, or plainly "Not verified yet". Rows researched by an AI agent
 * (notes say so) are labelled AI-checked, never passed off as human-verified. */
import { useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, CalendarDays, CircleDashed, CircleHelp, ExternalLink, Languages, ShieldCheck, ShieldHalf, Wallet } from "lucide-react";
import { currency, dateLabel, tuition, type Sourced, type University } from "@/lib/domain";
import { coverageCount, englishMinimum, isVerified, nextDeadline, sourceUrl } from "@/lib/coverage";
import { useT } from "./i18n";
import "./essentials-check.css";

type Fact = { key: "ess.deadline" | "ess.tuition" | "ess.english"; icon: React.ReactNode; value: string | null; record?: Sourced | null; expected?: boolean };

const checkedOn = (r: Sourced) =>
  r.verified_at || (r.evidence?.retrieved_at as string | undefined) || r.data_sources?.retrieved_at || null;

function essentials(u: University): Fact[] {
  const deadline = nextDeadline(u);
  const fee = tuition(u);
  const ielts = englishMinimum(u);
  const facts: Fact[] = [
    { key: "ess.deadline", icon: <CalendarDays size={16} />, value: deadline ? dateLabel(deadline.due_date) : null, record: deadline, expected: deadline?.expected },
    { key: "ess.tuition", icon: <Wallet size={16} />, value: fee ? (fee.amount === 0 ? "0" : currency(fee.amount, fee.currency)) : null, record: fee },
    { key: "ess.english", icon: <Languages size={16} />, value: ielts?.minimum != null ? (ielts.kind === "IELTS" ? "IELTS " : ielts.kind === "TOEFL" ? "TOEFL " : (ielts.label || "").split(" ")[0] + " ") + ielts.minimum : null, record: ielts },
  ];
  return facts;
}

/** "Data fully covered" / "Partly covered · n/3" / "Not verified yet", with a "?" that explains it. */
export function CoverageBadge({ university: u, help = true, compact = false }: { university: University; help?: boolean; compact?: boolean }) {
  const t = useT();
  const n = coverageCount(u);
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const level = n === 3 ? "full" : n > 0 ? "partial" : "none";
  return (
    <span className={"cov" + (compact ? " is-compact" : "")} ref={box}>
      <span className={"cov-badge is-" + level}>
        {level === "full" ? <ShieldCheck size={14} /> : level === "partial" ? <ShieldHalf size={14} /> : <CircleDashed size={14} />}
        {level === "full" ? t("cov.full") : level === "partial" ? t("cov.partial", { n }) : t("cov.none")}
      </span>
      {help ? (
        <button type="button" className="cov-q" aria-label={t("cov.help")} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          <CircleHelp size={15} />
        </button>
      ) : null}
      {open ? (
        <span className="cov-pop" id={id} role="dialog" aria-label={t("cov.help.title")}>
          <strong>{t("cov.help.title")}</strong>
          <span>{t("cov.help.what")}</span>
          <span><ShieldCheck size={13} className="cov-i-ok" /> {t("cov.help.full")}</span>
          <span><ShieldHalf size={13} className="cov-i-ai" /> {t("cov.help.ai")}</span>
          <span className="cov-pop-note">{t("cov.help.confirm")}</span>
        </span>
      ) : null}
    </span>
  );
}

/** The seal after a university's name: solid blue when all 3 essentials are
 * verified, a quiet grey "n/3" when some are, nothing when none are. */
export function VerifiedMark({ university: u }: { university: University }) {
  const t = useT();
  const n = coverageCount(u);
  if (!n) return null;
  const label = n === 3 ? t("cov.full") : t("cov.partial", { n });
  return (
    <span className={"vmark" + (n === 3 ? " is-full" : "")} title={label} aria-label={label} role="img">
      <BadgeCheck aria-hidden="true" />
      {n < 3 ? <span className="vmark-n">{n}/3</span> : null}
    </span>
  );
}

export function EssentialsCheck({ university: u }: { university: University }) {
  const t = useT();
  const facts = essentials(u);
  return (
    <section className="ess" aria-label={t("ess.title")}>
      <header className="ess-head">
        <h2>{t("ess.title")}</h2>
        <CoverageBadge university={u} />
      </header>
      <ul className="ess-list">
        {facts.map((f) => {
          const ok = !!f.value && isVerified(f.record);
          const url = sourceUrl(f.record);
          const date = f.record ? dateLabel(checkedOn(f.record)) : "";
          const ai = /AI agent/i.test(f.record?.notes || "");
          return (
            <li key={f.key} className={"ess-item" + (ok ? " is-ok" : "")}>
              <span className="ess-icon">{f.icon}</span>
              <span className="ess-label">{t(f.key)}</span>
              <strong className="ess-value">{f.value ?? "—"}</strong>
              {f.expected ? <span className="ess-expected">{t("ess.expected")}</span> : null}
              {ok && url ? (
                <a className="ess-src" href={url} target="_blank" rel="noopener noreferrer">
                  <ShieldCheck size={13} />
                  {t(ai ? "ess.ai" : "ess.verified", { date })}
                  <ExternalLink size={11} />
                </a>
              ) : (
                <span className="ess-src is-missing">
                  <CircleDashed size={13} />
                  {t("ess.missing")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
