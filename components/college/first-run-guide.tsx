"use client";
/* First-run guide (Nov 19): four small popovers led by the mascot, each anchored to a nav item
 * (the sidebar on wide screens, the bottom bar on phones): Home, Plan, AI assistant, My colleges.
 * No overlay. Shown once per student (localStorage); re-open with the "Quick tour" items. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCollege } from "./provider";
import { useT } from "./i18n";
import { Mascot } from "./mascot";
import type { MessageKey } from "@/lib/i18n/messages";
import { CONSENT_EVENT, readConsent } from "@/lib/consent";
import "./first-run-guide.css";

export const TOUR_OPEN_EVENT = "cs-tour-open";
export const openTour = () => window.dispatchEvent(new Event(TOUR_OPEN_EVENT));

const STEPS = [
  { target: "home", text: "tour.1" },
  { target: "plan", text: "tour.2" },
  { target: "ai", text: "tour.3" },
  { target: "colleges", text: "tour.4" },
] as const;

type Pos = { left: number; top: number; side: "right" | "top"; arrow: number };

/** The visible element for a step: the sidebar button, or the bottom-bar one on phones. */
function anchorFor(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function FirstRunGuide() {
  const t = useT();
  const { user, profile } = useCollege();
  const pathname = usePathname() || "";
  const [step, setStep] = useState<number | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  // The cookie bar comes first; the guide waits until it has been answered.
  const [decided, setDecided] = useState(false);
  useEffect(() => {
    const sync = () => setDecided(readConsent() !== null);
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const key = user ? "cs-tour-v1:" + user.id : "";
  const ready = !!user && !!(profile?.preferences as { intake?: { completed_at?: string } } | undefined)?.intake?.completed_at;
  const onboarding = pathname.startsWith("/dashboard/welcome");

  const finish = useCallback(() => {
    try {
      if (key) localStorage.setItem(key, "1");
    } catch {}
    setStep(null);
  }, [key]);

  // First visit after onboarding: open once, after the page has settled.
  useEffect(() => {
    if (!ready || onboarding || !key || !decided) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(key);
    } catch {}
    if (seen) return;
    const id = window.setTimeout(() => setStep((s) => (s === null ? 0 : s)), 1400);
    return () => window.clearTimeout(id);
  }, [ready, onboarding, key, decided]);

  // "Quick tour" in the header and the account menu.
  useEffect(() => {
    const open = () => setStep(0);
    window.addEventListener(TOUR_OPEN_EVENT, open);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, open);
  }, []);

  const place = useCallback(() => {
    if (step === null || !card.current) return;
    const el = anchorFor(STEPS[step].target);
    if (!el) return setPos(null);
    const r = el.getBoundingClientRect();
    const w = card.current.offsetWidth;
    const h = card.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (r.top > vh * 0.6) {
      // Bottom bar (phones): above the item.
      const left = clamp(r.left + r.width / 2 - w / 2, 12, vw - w - 12);
      setPos({ left, top: r.top - h - 12, side: "top", arrow: clamp(r.left + r.width / 2 - left, 18, w - 18) });
    } else {
      const top = clamp(r.top + r.height / 2 - h / 2, 8, vh - h - 8);
      setPos({ left: r.right + 12, top, side: "right", arrow: clamp(r.top + r.height / 2 - top, 18, h - 18) });
    }
  }, [step]);

  useLayoutEffect(() => {
    place();
  }, [place]);
  useEffect(() => {
    if (step === null) return;
    const el = anchorFor(STEPS[step].target);
    el?.classList.add("cs-tour-on");
    window.addEventListener("resize", place);
    const settle = window.setTimeout(place, 250); // the sidebar may still be sliding
    next.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", esc);
    return () => {
      el?.classList.remove("cs-tour-on");
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", esc);
      window.clearTimeout(settle);
    };
  }, [step, place, finish]);

  if (step === null) return null;
  const last = step === STEPS.length - 1;
  return (
    <div
      ref={card}
      className={"tour" + (pos ? ` is-${pos.side}` : "")}
      role="dialog"
      aria-label={t("tour.label")}
      style={pos ? ({ left: pos.left, top: pos.top, "--arrow": pos.arrow + "px" } as React.CSSProperties) : { visibility: "hidden" }}
    >
      <div className="tour-body">
        <span className="tour-mascot" aria-hidden="true">
          <Mascot size={36} />
        </span>
        <p>{t(STEPS[step].text as MessageKey)}</p>
      </div>
      <div className="tour-foot">
        <span className="tour-count" aria-hidden="true">
          {t("tour.step", { n: step + 1, total: STEPS.length })}
        </span>
        <button type="button" className="tour-skip" onClick={finish}>
          {t("tour.skip")}
        </button>
        <button ref={next} type="button" className="tour-next" onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? t("tour.done") : t("tour.next")}
        </button>
      </div>
    </div>
  );
}
