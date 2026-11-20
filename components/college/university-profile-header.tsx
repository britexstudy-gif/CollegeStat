"use client";
import { useEffect, useRef, useState } from "react";
import { VerifiedMark } from "./essentials-check";
import { ArrowUpRight, Check, MapPin, Plus, Sparkles } from "lucide-react";
import type { University } from "@/lib/domain";
import { countryName } from "@/lib/domain";
import { displayName } from "@/lib/university-display-name";
import { establishedYear, institutionType } from "@/lib/institution-facts";
import { profileKeyFacts, type KeyFactId } from "@/lib/profile-key-facts";
import { campusPhotos, type SectionId } from "@/lib/university-profile-data";
import { campusAssets } from "@/lib/university-assets";
import type { MessageKey } from "@/lib/i18n/messages";
import { SaveButton } from "./save-button";
import { UniversityLogo } from "./primitives";
import { useCollege } from "./provider";
import { useT } from "./i18n";
import "./university-profile.css";

const factLabels: Record<KeyFactId, MessageKey> = {
  rank: "uni.fact.rank",
  tuition: "uni.fact.tuition",
  admission: "uni.fact.admission",
  sat: "oc.fact.sat",
  english: "uni.fact.english",
  deadline: "uni.fact.deadline",
};

/** Logo tile, name, place, type and a row of the key facts that exist. */
export function UniversityHeader({ university: u, foundedFallback: founded0, typeFallback }: { university: University; foundedFallback?: number | null; typeFallback?: string | null }) {
  const t = useT();
  const s = useCollege();
  const kind = institutionType(u) ?? typeFallback ?? null;
  const founded = establishedYear(u) ?? founded0 ?? null;
  const facts = profileKeyFacts(u);
  const banner = campusPhotos(u)[0];
  const [bannerBroken, setBannerBroken] = useState(false);
  const inCompare = s.compare.includes(u.id);
  const meta = [kind, founded ? t("up.founded", { year: founded }) : null].filter(Boolean);
  return (
    <header className={"up-head" + (banner && !bannerBroken ? " has-banner" : "")}>
      {banner && !bannerBroken && (
        <div className="up-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={campusAssets[banner.url] || banner.url} alt="" fetchPriority="high" decoding="async" referrerPolicy="no-referrer" onError={() => setBannerBroken(true)} />
          {(banner.source_url || banner.creator) && (
            <a href={banner.source_url || undefined} target="_blank" rel="noreferrer" className="up-banner-credit">
              {banner.creator ? t("up.media.credit", { name: banner.creator }) : t("up.source")}
            </a>
          )}
        </div>
      )}
      <div className="up-head-main">
        <UniversityLogo university={u} size="xl" />
        <div className="up-head-id">
          <h1>{displayName(u.name)} <VerifiedMark university={u} /></h1>
          <p className="up-place">
            <MapPin size={14} aria-hidden="true" />
            <span>
              {[u.city, countryName(u.country_code)].filter(Boolean).join(", ")}
              {meta.length > 0 && " · " + meta.join(" · ")}
            </span>
          </p>
        </div>
        <div className="up-actions">
          <SaveButton id={u.id} />
          <button type="button" className="up-btn" aria-pressed={inCompare} onClick={() => s.toggleCompare(u.id)}>
            {inCompare ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            {t("up.compare")}
          </button>
          <a className="up-btn" href={"/dashboard/assistant?ask=" + encodeURIComponent(t("up.askai.q", { name: u.name }))}>
            <Sparkles size={15} aria-hidden="true" />
            {t("up.askai")}
          </a>
          {u.website && (
            <a className="up-btn is-primary" href={u.website} target="_blank" rel="noreferrer">
              {t("uni.next.website")} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      {facts.length > 0 && (
        <dl className="up-facts" aria-label={t("uni.facts.label")}>
          {facts.map((f) => {
            const detail = f.detail.map((p) => (typeof p === "string" ? p : t(("uni.note." + p.t) as MessageKey))).join(" · ");
            return (
              <div key={f.id}>
                <dt>{t(factLabels[f.id])}</dt>
                <dd>
                  <strong>{f.value}</strong>
                  {detail && <span>{detail}</span>}
                  {f.href && (
                    <a className="up-src" href={f.href} target="_blank" rel="noreferrer">{t("up.source")}</a>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </header>
  );
}

const navKeys: Record<SectionId, MessageKey> = {
  overview: "up.nav.overview",
  rankings: "up.nav.rankings",
  apply: "up.nav.apply",
  costs: "up.nav.costs",
  programmes: "up.nav.programmes",
  media: "up.nav.media",
  outcomes: "up.nav.outcomes",
  scholarships: "ud.nav.scholarships",
  faq: "u2.nav.faq",
};

/** The one sticky section nav. Highlights the section in view; links are real anchors. */
export function SectionNav({ sections, initial }: { sections: SectionId[]; initial?: SectionId | null }) {
  const t = useT();
  const [active, setActive] = useState<SectionId>(initial || sections[0]);
  const lock = useRef(0);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const nodes = sections.map((id) => document.getElementById("up-" + id)).filter(Boolean) as HTMLElement[];
    const onScroll = () => {
      if (Date.now() < lock.current) return;
      const line = window.innerHeight * 0.3;
      let current = sections[0];
      for (const n of nodes) if (n.getBoundingClientRect().top <= line) current = n.id.slice(3) as SectionId;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);
  useEffect(() => {
    // Scroll the pill row only; scrollIntoView would also move the page.
    const ul = list.current;
    const item = ul?.querySelector<HTMLElement>('[aria-current="true"]');
    if (ul && item) ul.scrollLeft += item.getBoundingClientRect().left - ul.getBoundingClientRect().left - (ul.clientWidth - item.offsetWidth) / 2;
  }, [active]);
  const go = (id: SectionId) => (e: React.MouseEvent) => {
    e.preventDefault();
    const node = document.getElementById("up-" + id);
    if (!node) return;
    lock.current = Date.now() + 700;
    setActive(id);
    node.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", "#" + id);
  };
  return (
    <nav className="up-nav" aria-label={t("up.nav.label")}>
      <ul ref={list}>
        {sections.map((id) => (
          <li key={id}>
            <a href={"#" + id} aria-current={active === id ? "true" : undefined} onClick={go(id)}>{t(navKeys[id])}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
