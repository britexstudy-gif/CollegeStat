/* eslint-disable @next/next/no-img-element -- Local editorial artwork. */
"use client";
import { CurrentGuidance } from "@/components/college/current-guidance";
import {
  BudgetPlanner,
  ApplicationTimeline,
} from "@/components/college/resource-tools";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ClipboardList,
  Wallet,
  Scale,
  Search,
} from "lucide-react";
import { guides, guideSources, guideChecklists } from "@/lib/guides";
export default function Resources({ id }: { id?: string }) {
  const guide = guides.find((g) => g.id === id),
    [checked, setChecked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("college-guide:" + id) || "[]",
      );
      setChecked(
        Array.isArray(saved)
          ? saved.filter((v): v is string => typeof v === "string")
          : [],
      );
    } catch {
      setChecked([]);
    }
  }, [id]);
  const saveChecklist = (next: string[]) => {
    setChecked(next);
    try {
      localStorage.setItem("college-guide:" + id, JSON.stringify(next));
    } catch {}
  };

  if (guide)
    return (
      <article className="prose-page illustrated-guide">
        <Link href="/resources" className="text-link">
          ← All resources
        </Link>
        <p className="section-caption">{guide.category}</p>
        <h1>{guide.title}</h1>
        <p className="guide-lead">{guide.subtitle}</p>
        <img
          className="guide-cover"
          src={"/images/resources/" + guide.id + ".webp"}
          alt="Cobalt blue editorial collage accompanying this university planning guide"
          width={1200}
          height={800}
        />
        {guide.id === "funding" && <BudgetPlanner />}
        {guide.id === "applications" && <ApplicationTimeline />}
        <div className="guide-body">
          {guide.body.map((section, i) => (
            <section key={section}>
              <h2>
                {
                  [
                    "Start with the essentials",
                    "Put it in context",
                    "Make your next move",
                    "Before you decide",
                  ][i]
                }
              </h2>
              <p>{section}</p>
            </section>
          ))}
        </div>
        <section className="guide-checklist">
          <h2>Make it actionable</h2>
          <p>
            Saved on this device · {checked.length}/
            {guideChecklists[guide.id]?.length || 0} complete
          </p>
          {guideChecklists[guide.id]?.map((step) => (
            <label key={step}>
              <input
                type="checkbox"
                checked={checked.includes(step)}
                onChange={(e) =>
                  saveChecklist(
                    e.target.checked
                      ? [...checked, step]
                      : checked.filter((s) => s !== step),
                  )
                }
              />
              <span>{step}</span>
              {checked.includes(step) && <Check size={17} />}
            </label>
          ))}
        </section>
        <section className="guide-sources">
          <h2>Go to the source</h2>
          <p>
            Use the official guidance alongside the requirements for your
            specific university, course and entry year.
          </p>
          {guideSources[guide.id]?.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
              {s.title}
              <ArrowUpRight size={17} />
            </a>
          ))}
        </section>
        <Link
          href={guide.id === "compare" ? "/compare" : "/universities"}
          className="button button-primary"
        >
          {guide.id === "compare"
            ? "Build a comparison"
            : "Find your universities"}
          <ArrowUpRight size={17} />
        </Link>
      </article>
    );
  return (
    <div className="research-page resources-page">
      <header className="resource-hero">
        <div>
          <h1>Plan your application.</h1>
          <p>
            Start with an application checklist, a funding budget, or a guide to
            comparing universities.
          </p>
          <a href="#handbook" className="text-link">
            Open the handbook <ArrowUpRight size={17} />
          </a>
        </div>
        <img
          src="/images/resources/essays.webp"
          alt="Halftone hands writing on a keyboard with floating pages"
          width={1200}
          height={800}
        />
      </header>
      <section
        className="resource-task-bar"
        aria-label="Choose a planning task"
      >
        <Link href="/resources/applications">
          <span className="product-icon">
            <ClipboardList size={22} aria-hidden="true" />
          </span>
          <strong>Plan an application</strong>
          <span>Portal, documents & preparation dates →</span>
        </Link>
        <Link href="/resources/funding">
          <span className="product-icon">
            <Wallet size={22} aria-hidden="true" />
          </span>
          <strong>Build your budget</strong>
          <span>Costs, funding & the remaining gap →</span>
        </Link>
        <Link href="/compare">
          <span className="product-icon">
            <Scale size={22} aria-hidden="true" />
          </span>
          <strong>Compare your shortlist</strong>
          <span>Keep the sources beside the numbers →</span>
        </Link>
      </section>
      <label className="resource-filter">
        <span>
          <Search size={17} aria-hidden="true" /> Find a guide
        </span>
        <input
          className="filter-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search funding, tests, applications…"
        />
      </label>
      <div id="handbook" className="resource-editorial-list">
        {guides
          .filter((g) =>
            (g.title + " " + g.category + " " + g.subtitle)
              .toLowerCase()
              .includes(filter.toLowerCase()),
          )
          .map((g, i) => (
            <Link
              key={g.id}
              href={"/resources/" + g.id}
              className="resource-editorial-row"
            >
              <div className={"resource-illustration illustration-" + (i % 3)}>
                <img
                  src={"/images/resources/" + g.id + ".webp"}
                  alt=""
                  width={600}
                  height={400}
                  loading="lazy"
                />
              </div>
              <div>
                <span className="section-caption">{g.category}</span>
                <h2>{g.title}</h2>
                <p>{g.subtitle}</p>
                <p className="caption">
                  {g.time} min · Checklist & official sources
                </p>
                <span className="text-link">
                  Open guide <ArrowUpRight size={16} />
                </span>
              </div>
            </Link>
          ))}
      </div>
      {!guides.some((g) =>
        (g.title + " " + g.category + " " + g.subtitle)
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ) && (
        <p role="status">
          No guides match. Try “funding”, “tests”, or “applications”.
        </p>
      )}
      <CurrentGuidance />
      <section className="resource-next">
        <h2>Learn by exploring.</h2>
        <p>See what the data says, then ask what it means for you.</p>
        <div>
          <Link href="/rankings">Compare ranking perspectives ↗</Link>
          <Link href="/rankings#regional-tables">
            Explore regional rankings ↗
          </Link>
          <Link href="/support">Support CollegeStat ↗</Link>
        </div>
      </section>
    </div>
  );
}
