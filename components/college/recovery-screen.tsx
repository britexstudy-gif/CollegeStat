/* eslint-disable @next/next/no-img-element -- Locally generated editorial illustration. */
"use client";
import Link from "next/link";
import {
  ArrowRight,
  Home,
  Search,
  RotateCcw,
  BookOpen,
  GraduationCap,
} from "lucide-react";
export function RecoveryScreen({
  missing = false,
  retry,
}: {
  missing?: boolean;
  retry?: () => void;
}) {
  return (
    <div
      className={
        "research-page recovery-page" + (missing ? " recovery-illustrated" : "")
      }
    >
      {missing && (
        <figure className="recovery-art">
          <img
            src="/images/status/not-found-collage.webp"
            alt="A student with a map following a paper plane toward a university"
            width={1100}
            height={733}
          />
          <span className="recovery-code" aria-hidden="true">
            404
          </span>
        </figure>
      )}
      <section className="recovery-card">
        <span className="eyebrow">
          {missing ? "404 · PAGE NOT FOUND" : "PAGE UNAVAILABLE"}
        </span>
        <h1>
          {missing
            ? "This page has moved off the map."
            : "This page couldn’t load."}
        </h1>
        <p>
          {missing
            ? "The address may have changed. Find a university below, or choose where to go next."
            : "Your saved research stays in your account. Try loading this page again, or explore another section."}
        </p>
        <form action="/universities" method="get" className="recovery-search">
          <Search size={19} aria-hidden="true" />
          <input
            name="q"
            aria-label="Find a university"
            placeholder="University, country or subject"
          />
          <button type="submit" aria-label="Search universities">
            <ArrowRight size={20} />
          </button>
        </form>
        <div className="control-row">
          {retry && (
            <button className="button button-primary" onClick={retry}>
              <RotateCcw size={16} />
              Try again
            </button>
          )}
          <Link href="/" className="button button-secondary">
            <Home size={16} />
            Home
          </Link>
          <Link href="/scholarships" className="button button-secondary">
            <GraduationCap size={16} />
            Scholarships
          </Link>
          <Link href="/resources" className="button button-secondary">
            <BookOpen size={16} />
            Resources
          </Link>
        </div>
        <p className="caption">
          Looking for a missing university?{" "}
          <Link href="/support">
            Let us know <ArrowRight size={12} />
          </Link>
        </p>
      </section>
    </div>
  );
}
