/* eslint-disable @next/next/no-img-element -- Local, pre-sized WebP artwork. */
"use client";
import Link from "next/link";
import { useState } from "react";
import { useLiquidGlass } from "@/components/college/use-liquid-glass";
import { useRouter } from "next/navigation";
import { parseResearchQuery, filterURL } from "@/lib/research";
import { HomeScholarships } from "@/components/college/home-scholarships";
import { FundingDiscovery } from "@/components/college/funding-discovery";
import { AnimatedHero } from "@/components/college/animated-hero";
import {
  ArrowRight,
  ArrowUpRight,
  Globe2,
  Scale,
  Bookmark,
  Search,
} from "lucide-react";
import { VoiceSearch } from "@/components/college/voice-search";
import { UniversityCarousel } from "@/components/college/university-carousel";
import { useCollege } from "@/components/college/provider";
import { rankingPublishers } from "@/lib/ranking-highlights";
import manifest from "@/data/published/directory-manifest.json";
export default function Landing() {
  const s = useCollege();
  const searchGlass = useLiquidGlass<HTMLFormElement>();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const search = (text: string) => {
    const parsed = parseResearchQuery(text);
    const params = new URLSearchParams(filterURL(parsed.filters));
    if (parsed.unparsed) params.set("unresolved", parsed.unparsed);
    router.push("/universities?" + params.toString());
  };
  return (
    <div className="open-home">
      <section className="open-hero">
        <div className="open-hero-copy">
          <span className="section-caption">Your next chapter starts here</span>
          <h1>
            Big dreams.
            <br />A world of
            <br />
            <em>possibilities.</em>
          </h1>
          <p>
            Find universities, compare costs and rankings,
            <br />
            and learn how to apply.
          </p>
          <div className="hero-links">
            <Link href="/universities" className="button button-primary">
              Explore universities <ArrowUpRight size={17} />
            </Link>
            <Link href="/resources/applications">
              Plan an application <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <AnimatedHero />
      </section>
      <div className="landing-finder-wrap">
        <form
          ref={searchGlass}
          data-glass="rim"
          className="discovery-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            search(query);
          }}
        >
          <Search className="home-search-icon" size={25} aria-hidden="true" />
          <input
            aria-label="Search universities"
            name="q"
            placeholder="University, country, or subject"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <VoiceSearch
            onResult={(text) => {
              setQuery(text);
              search(text);
            }}
          />
          <button className="home-search-submit" type="submit">
            Search <ArrowRight size={18} />
          </button>
        </form>
        <div className="finder-suggestions">
          <span>Start somewhere:</span>
          <Link href="/universities?country=US">United States</Link>
          <Link href="/universities?country=GB">United Kingdom</Link>
          <Link href="/universities?country=UZ">Uzbekistan</Link>
          <Link href="/universities">
            {manifest.catalogue_total.toLocaleString()} institutions{" "}
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
      <UniversityCarousel />
      <HomeScholarships />
      <FundingDiscovery home />
      <section className="open-steps">
        <div className="editorial-heading">
          <div>
            <span className="section-caption">
              Less searching. More direction.
            </span>
            <h2>A little clarity goes a long way.</h2>
          </div>
        </div>
        <div className="steps-line">
          {[
            {
              icon: Globe2,
              n: "01",
              title: "Find universities.",
              text: "Explore universities around the world, from familiar names to unexpected possibilities.",
              url: "/universities",
              action: "Explore the directory",
            },
            {
              icon: Scale,
              n: "02",
              title: "Compare your options.",
              text: "Put costs, admissions and rankings side by side. Get closer to what matters to you.",
              url: "/compare",
              action: "Compare universities",
            },
            {
              icon: Bookmark,
              n: "03",
              title: "Prepare your application.",
              text: "Use the application checklist to plan documents, funding, and preparation dates.",
              url: "/resources/applications",
              action: "Plan an application",
            },
          ].map(({ icon: Icon, ...x }) => (
            <article key={x.n}>
              <div className="step-top">
                <Icon size={26} />
                <span>{x.n}</span>
              </div>
              <h3>{x.title}</h3>
              <p>{x.text}</p>
              <Link href={x.url}>
                {x.action}
                <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="open-rankings">
        <div>
          <span className="section-caption">
            Different rankings. A wider perspective.
          </span>
          <h2>
            More than
            <br />
            one number.
          </h2>
          <p>
            See where a university stands across QS, Times Higher Education and
            ShanghaiRanking.
          </p>
          <Link className="button button-secondary" href="/rankings">
            Explore the rankings <ArrowRight size={16} />
          </Link>
        </div>
        <div className="publisher-lines">
          {Object.entries(rankingPublishers).map(([key, p]) => (
            <Link href={`/rankings?provider=${key}`} key={key}>
              <strong>
                {p.name}
                <small>{p.year}</small>
              </strong>
              <span>{p.description}</span>
              <ArrowUpRight size={22} />
            </Link>
          ))}
        </div>
      </section>
      <section className="open-planner">
        <div className="planner-art">
          <img
            src="/images/resources/essays.webp"
            alt="Halftone hands at a keyboard with floating pages on a cobalt background"
            width="1200"
            height="675"
            loading="lazy"
          />
        </div>
        <div>
          <span className="section-caption">A space for your next chapter</span>
          <h2>
            Dream big.
            <br />
            Take the next
            <br />
            <em>small step.</em>
          </h2>
          <p>
            Your universities, deadlines and ideas.
            <br />
            Together in your personal dashboard.
          </p>
          <Link
            className="button button-primary"
            href={s.user ? "/dashboard" : "/auth/sign-up?next=/dashboard"}
          >
            {s.user ? "Open your dashboard" : "Make your free account"}
            <ArrowRight size={17} />
          </Link>
          <p className="planner-signin">
            Already have an account?{" "}
            <Link href="/auth/sign-in?next=/dashboard">Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
