"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  GraduationCap,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { parseResearchQuery, filterURL } from "@/lib/research";
import { VoiceSearch } from "@/components/college/voice-search";
import { UniversityCarousel } from "@/components/college/university-carousel";
import { UniversityLogo } from "@/components/college/primitives";
import { useCollege } from "@/components/college/provider";
import {
  rankingPublishers,
  rankLabel,
  universityRanks,
} from "@/lib/ranking-highlights";
import { filterScholarships } from "@/lib/scholarship-discovery";
import { countryName, dateLabel } from "@/lib/domain";
import manifest from "@/data/published/directory-manifest.json";

const quickSearches = [
  ["United States", "/universities?country=US"],
  ["United Kingdom", "/universities?country=GB"],
  ["Germany", "/universities?country=DE"],
  ["Canada", "/universities?country=CA"],
  ["Computer science", "/universities?field=Computer+Science"],
] as const;

const faqs = [
  {
    q: "Is CollegeStat free?",
    a: "Yes. Browsing, comparing and planning are free. An account is only needed to save your shortlist, notes and deadlines.",
  },
  {
    q: "Where does the data come from?",
    a: "Institution identities come from the ROR registry and IPEDS, rankings from the QS, Times Higher Education and ShanghaiRanking publishers, and admissions and costs from official university sources. Each figure links to where it came from.",
  },
  {
    q: "Does CollegeStat rank universities itself?",
    a: "No. We show published positions exactly as the publishers released them, including ties and bands. A university without a publisher ranking is never given an invented position.",
  },
  {
    q: "How current is the information?",
    a: `The directory was last rebuilt on ${dateLabel(manifest.retrieved_at)}. Rankings use QS ${rankingPublishers.qs.year}, THE ${rankingPublishers.the.year} and ARWU ${rankingPublishers.arwu.year}. Always confirm deadlines on the university's own website before applying.`,
  },
];

export default function Landing() {
  const s = useCollege();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const search = (text: string) => {
    const parsed = parseResearchQuery(text);
    const params = new URLSearchParams(filterURL(parsed.filters));
    if (parsed.unparsed) params.set("unresolved", parsed.unparsed);
    router.push("/universities?" + params.toString());
  };
  const ranked = s.universities
    .map((u) => ({ u, ranks: universityRanks(u) }))
    .filter((x) => x.ranks.length >= 2)
    .slice(0, 3);
  const awards = filterScholarships(s.scholarships, {
    query: "",
    funding: "all",
    level: "all",
    includeClosed: false,
    today: new Date().toISOString().slice(0, 10),
  }).slice(0, 3);
  const accountHref = s.user ? "/dashboard" : "/auth/sign-up?next=/dashboard";
  return (
    <div className="lp">
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-pill">
            <span className="lp-pill-dot" aria-hidden="true" />
            {manifest.catalogue_total.toLocaleString()} universities in{" "}
            {manifest.countries} countries
          </span>
          <h1>
            Find the university
            <br />
            that <em>fits you.</em>
          </h1>
          <p className="lp-lede">
            Search, compare rankings, costs and admissions side by side, then
            plan your application. Every figure links to its source.
          </p>
          <form
            className="lp-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              search(query);
            }}
          >
            <Search size={20} aria-hidden="true" />
            <input
              aria-label="Search universities"
              name="q"
              placeholder="Try “engineering in Germany under $10k”"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <VoiceSearch
              onResult={(text) => {
                setQuery(text);
                search(text);
              }}
            />
            <button type="submit" className="lp-btn lp-btn-primary">
              Search <ArrowRight size={17} />
            </button>
          </form>
          <div className="lp-chips" aria-label="Popular searches">
            {quickSearches.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="lp-hero-visual">
          <picture>
            <source
              media="(max-width: 700px)"
              srcSet="/images/hero/blue-collage-640.webp"
            />
            <img
              src="/images/hero/blue-collage-1080.webp"
              alt="Editorial collage of a student looking toward university towers and a rising plane"
              width={1080}
              height={720}
              fetchPriority="high"
            />
          </picture>
          <div className="lp-float lp-float-a">
            <BarChart3 size={18} aria-hidden="true" />
            <span>
              <strong>QS · THE · ARWU</strong>
              <small>Three rankings, one view</small>
            </span>
          </div>
          <div className="lp-float lp-float-b">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <strong>Sourced data</strong>
              <small>Every figure cites its origin</small>
            </span>
          </div>
        </div>
      </section>

      <section className="lp-stats" aria-label="CollegeStat in numbers">
        {[
          [manifest.catalogue_total.toLocaleString(), "Institutions"],
          [String(manifest.countries), "Countries"],
          ["3", "Global rankings"],
          ["Free", "For every student"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <UniversityCarousel />

      <section className="lp-section">
        <header className="lp-heading">
          <span className="lp-eyebrow">Everything in one place</span>
          <h2>From first search to submitted application.</h2>
        </header>
        <div className="lp-bento">
          <article className="lp-card lp-card-wide">
            <div className="lp-card-copy">
              <span className="lp-icon">
                <Scale size={20} />
              </span>
              <h3>Compare side by side</h3>
              <p>
                Put up to five universities next to each other. Rankings,
                costs and admission rates keep their year and source.
              </p>
              <Link className="lp-link" href="/compare">
                Start comparing <ArrowRight size={15} />
              </Link>
            </div>
            {ranked.length > 0 && (
              <div className="lp-mini-table" aria-hidden="true">
                <div className="lp-mini-row lp-mini-head">
                  <span>University</span>
                  {(["qs", "the", "arwu"] as const).map((p) => (
                    <span key={p}>{rankingPublishers[p].name}</span>
                  ))}
                </div>
                {ranked.map(({ u, ranks }) => (
                  <div className="lp-mini-row" key={u.id}>
                    <span className="lp-mini-name">
                      <UniversityLogo university={u} size="sm" />
                      <span>{u.name}</span>
                    </span>
                    {(["qs", "the", "arwu"] as const).map((p) => {
                      const r = ranks.find((x) => x.provider === p);
                      return <span key={p}>{r ? rankLabel(r) : "—"}</span>;
                    })}
                  </div>
                ))}
              </div>
            )}
          </article>
          <article className="lp-card">
            <span className="lp-icon">
              <BarChart3 size={20} />
            </span>
            <h3>More than one number</h3>
            <p>See where a university stands across all three global rankings.</p>
            <div className="lp-publishers">
              {Object.entries(rankingPublishers).map(([key, p]) => (
                <Link href={`/rankings?provider=${key}`} key={key}>
                  <strong>{p.name}</strong>
                  <small>{p.year}</small>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          </article>
          <article className="lp-card">
            <span className="lp-icon">
              <GraduationCap size={20} />
            </span>
            <h3>Scholarships with real dates</h3>
            <p>Awards linked to universities, with deadlines from the source.</p>
            <ul className="lp-awards">
              {awards.map((a) => (
                <li key={a.id}>
                  <Link href={"/scholarships/" + a.slug}>
                    <strong>{a.name}</strong>
                    <small>
                      {a.country_code ? countryName(a.country_code) + " · " : ""}
                      {a.deadline
                        ? "Closes " + dateLabel(a.deadline)
                        : "Date not yet published"}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
            <Link className="lp-link" href="/scholarships">
              All scholarships <ArrowRight size={15} />
            </Link>
          </article>
          <article className="lp-card lp-card-wide lp-card-plan">
            <div className="lp-card-copy">
              <span className="lp-icon">
                <CalendarCheck2 size={20} />
              </span>
              <h3>Plan every deadline</h3>
              <p>
                Your shortlist, application status, notes and dated tasks in a
                private dashboard that shows what to do next.
              </p>
              <Link className="lp-link" href={accountHref}>
                {s.user ? "Open your dashboard" : "Create a free account"}{" "}
                <ArrowRight size={15} />
              </Link>
            </div>
            <div className="lp-plan-preview" aria-hidden="true">
              {[
                ["Request transcript", "Done", true],
                ["Write personal statement", "In 6 days", false],
                ["Check scholarship eligibility", "In 12 days", false],
              ].map(([title, due, done]) => (
                <div key={String(title)} className={done ? "is-done" : ""}>
                  <CheckCircle2 size={17} />
                  <span>{title}</span>
                  <small>{due}</small>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="lp-section lp-steps">
        <header className="lp-heading">
          <span className="lp-eyebrow">How it works</span>
          <h2>Three steps to a clearer decision.</h2>
        </header>
        <ol>
          {[
            [
              "Explore",
              "Filter by country, subject, cost and admission criteria.",
              "/universities",
            ],
            [
              "Compare",
              "Shortlist and weigh options with the evidence beside each figure.",
              "/compare",
            ],
            [
              "Apply",
              "Follow the checklist, track dates and keep notes in one place.",
              "/resources/applications",
            ],
          ].map(([title, text, href], i) => (
            <li key={title}>
              <span className="lp-step-n">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <Link className="lp-link" href={href}>
                {title} <ArrowRight size={15} />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section lp-faq">
        <header className="lp-heading">
          <span className="lp-eyebrow">Questions</span>
          <h2>Good to know.</h2>
        </header>
        <div>
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-cta">
        <Sparkles size={22} aria-hidden="true" />
        <h2>Your next chapter starts with a shortlist.</h2>
        <p>Save universities, track deadlines and keep every note together.</p>
        <div>
          <Link className="lp-btn lp-btn-light" href={accountHref}>
            {s.user ? "Open your dashboard" : "Get started free"}{" "}
            <ArrowRight size={17} />
          </Link>
          {!s.user && (
            <Link className="lp-btn lp-btn-ghost" href="/auth/sign-in?next=/dashboard">
              I have an account
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
