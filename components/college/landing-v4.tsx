"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Buildings,
  Gift,
  LinkSimple,
  ListChecks,
  MapPin,
  Plus,
  Translate,
  type IconProps,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import DotGrid from "@/components/react-bits/DotGrid";
import { HeroBeams } from "./hero-lines";
import { HeroFinder } from "./hero-finder";
import { Publishers as PublisherMarks } from "./landing-publishers";
import { PricingTable } from "./pricing";
import { useScrollReveal } from "./reveal";
import { Rich, useT } from "./i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import shots from "./landing-shots.json";
import "./landing-v4.css";

// WebGL backdrop, purely decorative: loads after the page is interactive.
const Aurora = dynamic(() => import("@/components/react-bits/Aurora"), { ssr: false });

/* Landing page (the live design, restored 16 Nov):
 *   hero (search + campus stage) → publishers → seven feature rows
 *   → why → pricing → FAQ → closing call to action.
 * Product pictures are real captures of the app (public/images/landing,
 * [width, height, hasDark] in landing-shots.json). Light and dark captures are
 * both in the markup; the theme class on <html> shows one. */

const shotMap: Record<string, readonly number[] | undefined> = shots;

/** A product capture. Width/height come from the manifest, so nothing shifts on load; a name without a capture renders nothing. */
function Shot({ name, alt, eager }: { name: string; alt: string; eager?: boolean }) {
  const shot = shotMap[name];
  if (!shot) return null;
  const [width, height, dark] = shot;
  const themes = dark ? (["light", "dark"] as const) : (["light"] as const);
  return (
    <>
      {themes.map((theme) => (
        // eslint-disable-next-line @next/next/no-img-element -- fixed-size local capture with 1x/2x srcset
        <img
          key={theme}
          className={"lp-img " + (dark ? "is-" + theme : "is-any")}
          src={`/images/landing/${name}-${theme}-1x.webp`}
          srcSet={`/images/landing/${name}-${theme}-1x.webp 1x, /images/landing/${name}-${theme}-2x.webp 2x`}
          width={width}
          height={height}
          alt={theme === "light" ? alt : ""}
          aria-hidden={theme === "dark" ? true : undefined}
          loading={eager && theme === "light" ? "eager" : "lazy"}
          decoding="async"
        />
      ))}
    </>
  );
}

/** A browser window around a capture, for the hero. */
function Window({ name, path, alt, eager }: { name: string; path: string; alt: string; eager?: boolean }) {
  return (
    <div className="lp-win">
      <div className="lp-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>collegestat.xyz{path}</span>
      </div>
      <Shot name={name} alt={alt} eager={eager} />
    </div>
  );
}

function Hero({ onSearch }: { onSearch: (query: string) => void }) {
  const t = useT();
  return (
    <section className="lp-hero" aria-labelledby="lp-title">
      <div className="lp-backdrop" aria-hidden="true">
        <DotGrid className="lp-hero-dots" gap={24} period={45} />
      </div>
      <div className="lp-hero-copy" data-enter>
        <p className="lp-pill">{t("land.hero.kicker")}</p>
        <h1 id="lp-title">
          <Rich text={t("land.hero.title")} />
        </h1>
        <p className="lp-lede">
          <Rich text={t("land.hero.lede")} />
        </p>
        <HeroFinder onSearch={onSearch} />
      </div>
      <div className="lp-stage-wrap">
        <HeroBeams />
        <div className="lp-stage is-sky" data-enter>
          <Window name="hero" path="/dashboard" alt={t("land.f4.title")} eager />
        </div>
      </div>
    </section>
  );
}

function Publishers() {
  const t = useT();
  return (
    <section aria-label={t("land.pubs")}>
      <PublisherMarks />
    </section>
  );
}

/** In the order a student goes: plan, research, chances, essays, the application, money.
 * Test prep is hidden for now (lib/features.ts), so its row is left out. */
const FEATURES: { n: number; shot: string; href: string; gated?: boolean; fit?: boolean }[] = [
  { n: 4, shot: "plan", href: "/dashboard", gated: true },
  { n: 1, shot: "research", href: "/universities" },
  { n: 2, shot: "simulator", href: "/dashboard/admissions-check", gated: true },
  { n: 3, shot: "writing", href: "/dashboard/prepare?section=Writing", gated: true },
  { n: 8, shot: "ai", href: "/dashboard/assistant", gated: true },
  { n: 7, shot: "scholarships", href: "/scholarships", fit: true },
  { n: 9, shot: "articles", href: "/articles" },
];

function Features({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  const key = (n: number, part: string) => `land.f${n}.${part}` as MessageKey;
  return (
    <section className="lp-section" id="features" aria-labelledby="lp-features-title">
      <header className="lp-head">
        <h2 id="lp-features-title">
          <Rich text={t("land.f.title")} />
        </h2>
      </header>
      <div className="lp-features">
        {FEATURES.map((f) => {
          const href = f.gated && !signedIn ? "/auth/sign-up?next=" + encodeURIComponent(f.href) : f.href;
          return (
            <article className="lp-feature" key={f.n}>
              <div className="lp-feature-copy">
                <p className="lp-label">{t(key(f.n, "label"))}</p>
                <h3>{t(key(f.n, "title"))}</h3>
                <p>{t(key(f.n, "text"))}</p>
                <Link className="lp-btn" href={href}>
                  {t(key(f.n, "cta"))} <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
              <div className={f.fit ? "lp-stage is-fit" : "lp-stage"} data-rv-kind="frame">
                <Shot name={f.shot} alt={t(key(f.n, "title"))} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const WHY: { icon: ComponentType<IconProps>; n: number }[] = [
  { icon: LinkSimple, n: 1 },
  { icon: Buildings, n: 2 },
  { icon: Translate, n: 3 },
  { icon: MapPin, n: 4 },
  { icon: Gift, n: 5 },
  { icon: ListChecks, n: 6 },
];

function Why() {
  const t = useT();
  return (
    <section className="lp-section" aria-labelledby="lp-why-title">
      <header className="lp-head">
        <h2 id="lp-why-title">
          <Rich text={t("land.why.title")} />
        </h2>
      </header>
      <ul className="lp-why">
        {WHY.map(({ icon: Icon, n }) => (
          <li key={n}>
            <Icon size={22} weight="regular" aria-hidden="true" />
            <h3>{t(`land.b${n}.title` as MessageKey)}</h3>
            <p>{t(`land.b${n}.text` as MessageKey)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pricing() {
  const router = useRouter();
  const t = useT();
  return (
    <section className="lp-section lp-pricing" id="pricing" aria-labelledby="lp-pricing-title">
      <header className="lp-head">
        <h2 id="lp-pricing-title">
          <Rich text={t("land.price.title")} />
        </h2>
        <p className="lp-lede">{t("d2.price.sub")}</p>
      </header>
      <PricingTable onChoose={(plan) => router.push("/auth/sign-up?next=" + encodeURIComponent(plan === "free" ? "/dashboard" : "/dashboard/plans"))} />
    </section>
  );
}

// app/page.tsx builds the FAQPage JSON-LD from the same keys.
export const FAQ_QUESTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function Faq() {
  const t = useT();
  return (
    <section className="lp-section lp-faq" aria-labelledby="lp-faq-title">
      <header className="lp-head">
        <h2 id="lp-faq-title">
          <Rich text={t("land.faq.title")} />
        </h2>
        <Link className="lp-link" href="/support">
          {t("land.faq.help")} <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <div className="lp-faq-list">
        {FAQ_QUESTIONS.map((n) => (
          <details key={n}>
            <summary>
              {t(`land.faq.q${n}` as MessageKey)}
              <Plus size={18} weight="regular" aria-hidden="true" />
            </summary>
            <p>{t(`land.faq.a${n}` as MessageKey)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Animated aurora over a faint dot field; the aurora only runs while the panel is on screen. */
function ClosingBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin: "120px" });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="lp-close-bg" aria-hidden="true">
      <DotGrid className="lp-close-dots" gap={22} period={60} />
      <Aurora
        className="lp-close-aurora"
        colorStops={["#1e3a8a", "#3b82f6", "#1d4ed8"]}
        amplitude={1.05}
        blend={0.6}
        speed={0.5}
        height={0.62}
        layers={2}
        paused={!onScreen}
      />
    </div>
  );
}

function Closing({ href }: { href: string }) {
  const t = useT();
  return (
    <section className="lp-section lp-close" aria-labelledby="lp-close-title">
      <div className="lp-stage lp-close-box">
        <ClosingBackdrop />
        <div className="lp-close-copy">
          <h2 id="lp-close-title">
            <Rich text={t("land.cta.title")} />
          </h2>
          <p>{t("land.cta.text")}</p>
          <div className="lp-actions">
            <Link className="lp-btn is-primary" href={href}>
              {t("land.cta.primary")} <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="lp-btn" href="/universities">
              {t("land.cta.secondary")} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** What rises in on scroll: section heads, each feature's copy and screen, the "why" items,
 * plan columns, FAQ rows and the closing block. Text un-blurs as it rises; product frames
 * open with a clip (data-rv-kind="frame", reveal.css). No zoom on images. The hero has its own entrance (data-enter). */
const REVEAL = [
  ".lp-section > .lp-head",
  ".lp-feature-copy",
  ".lp-feature .lp-stage",
  ".lp-why > li",
  ".lp-pricing .pc-toggle",
  ".lp-pricing .pc-col",
  ".lp-faq details",
  ".lp-close > *",
].join(",");

export function LandingPage({ onSearch, signedIn }: { onSearch: (query: string) => void; signedIn: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useScrollReveal(root, REVEAL);
  return (
    <div className="lp" ref={root}>
      <Hero onSearch={onSearch} />
      <Publishers />
      <Features signedIn={signedIn} />
      <Why />
      <Pricing />
      <Faq />
      <Closing href={signedIn ? "/dashboard" : "/auth/sign-up?next=/dashboard"} />
    </div>
  );
}
