"use client";
import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Bookmark,
} from "lucide-react";
import { useCollege } from "./provider";
import { UniversityLogo } from "./primitives";
import { CampusImage } from "./campus-image";
import { countryName } from "@/lib/domain";
import {
  rankLabel,
  universityRanks,
  rankingPublishers,
} from "@/lib/ranking-highlights";
export function UniversityCarousel() {
  const s = useCollege();
  const [viewport, api] = useEmblaCarousel({
    loop: true,
    align: "start",
    slidesToScroll: 1,
    duration: 22,
  });
  const [paused, setPaused] = useState(false),
    [interacting, setInteracting] = useState(false),
    [reduced, setReduced] = useState(false),
    [selected, setSelected] = useState(0);
  const sync = useCallback(
    () => setSelected(api?.selectedScrollSnap() || 0),
    [api],
  );
  useEffect(() => {
    if (!api) return;
    sync();
    api.on("select", sync);
    return () => {
      api.off("select", sync);
    };
  }, [api, sync]);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(m.matches);
    change();
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!api || paused || interacting || reduced) return;
    const timer = setInterval(() => {
      if (!document.hidden) api.scrollNext();
    }, 2200);
    return () => clearInterval(timer);
  }, [api, paused, interacting, reduced]);
  return (
    <section
      className="campus-carousel"
      aria-roledescription="carousel"
      aria-label="Universities to explore"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setInteracting(false);
      }}
    >
      <div className="editorial-heading">
        <div>
          <span className="section-caption">A world of possibilities</span>
          <h2>Where will you go?</h2>
        </div>
        <div className="carousel-controls">
          <button
            onClick={() => setPaused(!paused)}
            disabled={reduced}
            aria-label={
              reduced
                ? "Autoplay disabled for reduced motion"
                : paused
                  ? "Play carousel"
                  : "Pause carousel"
            }
            aria-pressed={paused}
          >
            {paused || reduced ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            onClick={() => api?.scrollPrev(reduced)}
            aria-label="Previous universities"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => api?.scrollNext(reduced)}
            aria-label="Next universities"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div
        ref={viewport}
        className="campus-viewport"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            api?.scrollNext(reduced);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            api?.scrollPrev(reduced);
          }
        }}
      >
        <div className="campus-track">
          {s.universities.map((u, i) => {
            const ranks = universityRanks(u),
              photo = u.media.find((m) => m.kind === "campus");
            return (
              <article
                className="campus-slide"
                key={u.id}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${s.universities.length}`}
              >
                <div className={`campus-poster poster-${i % 5}`}>
                  {photo ? (
                    <CampusImage media={photo} />
                  ) : (
                    <div className="campus-monogram" aria-hidden="true">
                      <span className="poster-orbit" />
                      <UniversityLogo university={u} size="xl" />
                    </div>
                  )}
                  <button
                    className="poster-save"
                    aria-label={`Save ${u.name}`}
                    onClick={() => s.toggleSaved(u.id)}
                  >
                    <Bookmark
                      size={18}
                      fill={s.saved.includes(u.id) ? "currentColor" : "none"}
                    />
                  </button>
                  {ranks[0] && (
                    <a
                      className="poster-rank"
                      href={ranks[0].url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {rankingPublishers[ranks[0].provider].name}{" "}
                      {ranks[0].year} <b>{rankLabel(ranks[0])}</b>
                    </a>
                  )}
                </div>
                <p className="campus-place">{countryName(u.country_code)}</p>
                <Link className="campus-title" href={`/university/${u.slug}`}>
                  {u.name}
                  <ArrowUpRight size={19} />
                </Link>
                {u.city && <p className="campus-city">{u.city}</p>}
              </article>
            );
          })}
        </div>
      </div>
      <div className="carousel-foot">
        <div className="carousel-dots" aria-label="Choose university">
          {s.universities.map((u, i) => (
            <button
              key={u.id}
              aria-label={`Go to ${u.name}`}
              aria-current={selected === i ? "true" : undefined}
              onClick={() => api?.scrollTo(i, reduced)}
              className={selected === i ? "active" : ""}
            />
          ))}
        </div>
        <Link href="/universities">
          All universities <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
