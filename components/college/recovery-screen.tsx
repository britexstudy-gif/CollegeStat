"use client";
import "@/app/recovery-refinement.css";
import Link from "next/link";
import { ArrowRight, Home, Search, RotateCcw } from "lucide-react";
export function RecoveryScreen({
  missing = false,
  retry,
}: {
  missing?: boolean;
  retry?: () => void;
}) {
  return (
    <div
      className={`research-page recovery-page recovery-simple${missing ? " recovery-illustrated" : ""}`}
    >
      {missing && (
        <figure className="recovery-art">
          <svg
            viewBox="0 0 480 290"
            fill="none"
            role="img"
            aria-labelledby="recovery-illustration-title"
          >
            <title id="recovery-illustration-title">
              A paper airplane finding its way around a globe marked 404
            </title>
            <circle
              cx="240"
              cy="145"
              r="105"
              fill="currentColor"
              opacity=".04"
            />
            <circle
              cx="240"
              cy="145"
              r="83"
              stroke="currentColor"
              strokeOpacity=".15"
            />
            <ellipse
              cx="240"
              cy="145"
              rx="42"
              ry="83"
              stroke="currentColor"
              strokeOpacity=".15"
            />
            <path
              d="M159 123h162M159 167h162M240 62v166"
              stroke="currentColor"
              strokeOpacity=".15"
            />
            <rect
              x="156"
              y="111"
              width="168"
              height="73"
              rx="11"
              fill="var(--recovery-paper)"
              stroke="currentColor"
              strokeOpacity=".15"
              transform="rotate(-6 240 145)"
            />
            <text
              x="239"
              y="166"
              textAnchor="middle"
              fill="currentColor"
              fontFamily="var(--cs-font)"
              fontSize="58"
              letterSpacing="3"
              transform="rotate(-6 240 145)"
            >
              404
            </text>
            <path
              d="M91 205C123 236 172 234 166 212s-56 1-30 17 122 9 167-40 70-58 86-77"
              stroke="currentColor"
              strokeOpacity=".4"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              strokeLinecap="round"
            />
            <path
              d="m375 110 39-13-15 39-7-18-17-8Z"
              fill="currentColor"
              opacity=".8"
            />
            <path d="m392 118 22-21" stroke="var(--recovery-paper)" />
            <path
              d="M115 91v14m-7-7h14M358 200v12m-6-6h12M328 59v8m-4-4h8"
              stroke="currentColor"
              strokeOpacity=".4"
              strokeLinecap="round"
            />
            <circle cx="91" cy="205" r="4" fill="currentColor" opacity=".5" />
          </svg>
        </figure>
      )}
      <section className="recovery-card">
        <span className="eyebrow">
          {missing ? "A SMALL DETOUR" : "PAGE UNAVAILABLE"}
        </span>
        <h1>
          {missing
            ? "A little lost. Still going places."
            : "This page couldn’t load."}
        </h1>
        <p>
          {missing
            ? "We couldn’t find this page. Your next chapter is still out there."
            : "Try loading the page again, or head back to explore."}
        </p>
        <form action="/universities" method="get" className="recovery-search">
          <Search size={17} aria-hidden="true" />
          <input
            name="q"
            aria-label="Find a university"
            placeholder="Find a university, country or subject"
          />
          <button type="submit" aria-label="Search universities">
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="control-row">
          {retry && (
            <button className="button button-primary" onClick={retry}>
              <RotateCcw size={15} /> Try again
            </button>
          )}
          <Link
            href="/"
            className={
              "button " + (retry ? "button-secondary" : "button-primary")
            }
          >
            <Home size={15} /> Back home
          </Link>
          <Link href="/universities" className="text-link">
            Explore universities <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}
