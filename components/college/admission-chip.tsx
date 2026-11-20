"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chanceFor, type Chance, type ChanceProfile } from "@/lib/admission-chance";
import { chanceProfile, snapshotFrom } from "@/lib/student-profile";
import type { University } from "@/lib/domain";
import type { MessageKey } from "@/lib/i18n/messages";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";

/** Lets a preview (or a parent that already has it) supply the profile instead of the account. */
const Override = createContext<ChanceProfile | null | undefined>(undefined);
export function ChanceProfileProvider({ value, children }: { value: ChanceProfile | null; children: ReactNode }) {
  return <Override.Provider value={value}>{children}</Override.Provider>;
}

const cache = new WeakMap<object, ChanceProfile>();
/** The signed-in student's scores and budget, read once per saved profile. */
export function useChanceProfile(): ChanceProfile | null {
  const override = useContext(Override);
  const s = useCollege();
  const prefs = s.user ? s.profile?.preferences : undefined;
  return useMemo(() => {
    if (override !== undefined) return override;
    if (!prefs || typeof prefs !== "object") return null;
    let p = cache.get(prefs);
    if (!p) {
      p = chanceProfile(snapshotFrom(prefs));
      cache.set(prefs, p);
    }
    return p;
  }, [override, prefs]);
}

const DOT: Record<Chance["category"], string> = {
  reach: "bg-[#e0803a]",
  target: "bg-primary",
  likely: "bg-[#2f9e6a]",
  unknown: "bg-muted-foreground/40",
};

/** Reach / Target / Likely / Unknown for one university, worked out only once the row is near the screen. */
export function AdmissionChip({ university }: { university: University }) {
  const profile = useChanceProfile();
  const { t, lang } = useI18n();
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!profile || seen) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [profile, seen]);
  const chance = useMemo(() => (seen && profile ? chanceFor(profile, university) : null), [seen, profile, university]);
  // No published admissions data: say nothing rather than show an empty "unknown".
  if (!profile || chance?.category === "unknown") return null;
  const money = (n: number) => "$" + Math.round(n).toLocaleString(lang);
  const lines: string[] = [];
  if (chance?.rate != null) lines.push(t("pf.ch.rate", { rate: chance.rate.toLocaleString(lang, { maximumFractionDigits: 1 }) }));
  if (chance?.sat) lines.push(t(("pf.ch.sat." + chance.sat.band) as MessageKey, { low: chance.sat.low, high: chance.sat.high }));
  if (chance?.english)
    lines.push(
      t(chance.english.meets === false ? "pf.ch.english.below" : chance.english.meets ? "pf.ch.english.meets" : "pf.ch.english.min", {
        test: chance.english.test,
        min: chance.english.minimum,
      }),
    );
  if (chance?.overBudget && chance.tuition != null) lines.push(t("pf.ch.budget.over", { tuition: money(chance.tuition) }));
  return (
    <span ref={ref} className={"inline-flex min-h-7 items-center" + (chance ? "" : " min-w-[84px]")}>
      {chance && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={t("pf.ch.aria", { category: t(("pf.ch." + chance.category) as MessageKey), name: university.name })}
            >
              <i className={"size-1.5 rounded-full " + DOT[chance.category]} aria-hidden="true" />
              {t(("pf.ch." + chance.category) as MessageKey)}
              {chance.overBudget && <span className="text-muted-foreground">· $</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 text-sm">
            <p className="font-medium">{t(("pf.ch." + chance.category + ".hint") as MessageKey)}</p>
            {lines.length > 0 && (
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{t("pf.ch.note")}</p>
            <Link href="/dashboard/welcome?step=tests" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
              {t("pf.ch.update")}
            </Link>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
