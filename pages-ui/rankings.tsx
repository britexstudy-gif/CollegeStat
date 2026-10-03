"use client";
import { regions } from "@/lib/regions";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { publicRequest } from "@/lib/supabase/catalogue";
import { rankingPublishers, type Publisher } from "@/lib/ranking-highlights";
import type { University } from "@/lib/domain";
import type { RankingTable } from "@/server/ranking-table";
import { UniversityLogo } from "@/components/college/primitives";
import {
  regionalRanksForUniversity,
  regionalRankLabel,
} from "@/lib/regional-rankings";
import { RankingBadges } from "@/components/college/ranking-badges";
import { PublisherMark } from "@/components/college/publisher-mark";
export default function Rankings() {
  const params = useSearchParams(),
    router = useRouter();
  const provider = (
    ["qs", "the", "arwu", "leiden"].includes(params.get("provider") || "")
      ? params.get("provider")
      : "qs"
  ) as Publisher | "leiden";
  const [data, setData] = useState<RankingTable | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const q = params.get("q") || "",
    country = params.get("country") || "",
    region = params.get("region") || "",
    sort = params.get("sort") || "asc",
    requestedPage = params.get("page") || "1";
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      mode: "ranking-table",
      provider,
      q,
      country,
      region,
      sort,
      page: requestedPage,
    });
    const timer = setTimeout(
      () =>
        publicRequest<RankingTable>(query.toString())
          .then((r) => {
            if (live) setData(r);
          })
          .catch(() => {
            if (live) setError("Rankings could not load. Please try again.");
          })
          .finally(() => {
            if (live) setLoading(false);
          }),
      150,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [provider, q, country, region, sort, requestedPage]);
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    Object.entries(patch).forEach(([k, v]) =>
      v ? next.set(k, v) : next.delete(k),
    );
    router.replace("/rankings?" + next, { scroll: false });
  };
  const publisher =
    provider === "leiden"
      ? {
          name: "Leiden Open",
          year: 2025,
          description:
            "Core publications, all sciences, fractional counting. Publication period: 2020–2023.",
          url: "https://open.leidenranking.com/resources",
        }
      : rankingPublishers[provider];
  const page = data?.page || 1,
    pages = data?.pages || 1;
  return (
    <div className="research-page rankings-page">
      <header className="page-intro">
        <h1>University rankings</h1>
        <p>World and regional positions, with each publisher’s source.</p>
      </header>
      <nav className="ranking-provider-tabs" aria-label="Ranking publisher">
        {[
          ...Object.entries(rankingPublishers).map(([key, p]) => ({
            key,
            ...p,
          })),
          { key: "leiden", name: "Leiden Open", year: 2025 },
        ].map((p) => (
          <button
            aria-pressed={provider === p.key}
            className={provider === p.key ? "active" : ""}
            key={p.key}
            onClick={() => update({ provider: p.key, country: "" })}
          >
            <PublisherMark provider={p.key as Publisher | "leiden"} />
            <span>{p.year}</span>
          </button>
        ))}
      </nav>
      <div className="ranking-description">
        <p>{publisher.description}</p>
        <a href={publisher.url} target="_blank" rel="noreferrer">
          Publisher & methodology <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="ranking-filter-row">
        <label>
          <Search size={18} />
          <input
            aria-label="Search ranked universities"
            placeholder="Find a university…"
            value={q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </label>
        <select
          aria-label="Ranking country"
          value={country}
          onChange={(e) => update({ country: e.target.value })}
        >
          <option value="">All countries</option>
          {data?.countries.map((c) => (
            <option value={c.code} key={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Ranking region"
          value={region}
          onChange={(e) => update({ region: e.target.value, country: "" })}
        >
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="Ranking order"
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
        >
          <option value="asc">Top first</option>
          <option value="desc">Bottom first</option>
        </select>
        <span>{data?.total.toLocaleString() || "…"} institutions</span>
      </div>
      {data && (
        <p className="ranking-coverage">
          {data.complete
            ? `Complete ${publisher.name} ${data.year} table · ${data.sourceTotal.toLocaleString()} ranked institutions`
            : "Selected published records · coverage is incomplete"}
        </p>
      )}
      {(region || country) && (
        <p className="caption">
          Showing {region || country} within the publisher’s world table. These
          remain world positions, not a separate regional ranking.
        </p>
      )}
      <div className="ranking-list-heading">
        <span>
          {provider === "leiden" ? "Publications" : "World / regional"}
        </span>
        <span>University</span>
        <span>Across the rankings</span>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : loading ? (
        <p className="rank-loading" role="status">
          Loading rankings…
        </p>
      ) : !data?.rows.length ? (
        <p className="rank-loading">No universities match these filters.</p>
      ) : (
        data.rows.map((r) => (
          <article className="ranking-university-row" key={r.key}>
            <div className="ranking-position-pair">
              <a
                href={r.url}
                className={`ranking-position ${provider === "leiden" ? "research-count" : ""}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`${r.name}: ${r.rank}, view source`}
              >
                {r.rank}
              </a>
              {r.university &&
                regionalRanksForUniversity(r.university).map((regional) => (
                  <a
                    className="regional-position"
                    key={regional.scope}
                    href={regional.source_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${r.name}: ${regionalRankLabel(regional.rank_label)}, QS ${regional.scope} ${regional.year}`}
                  >
                    <strong>{regionalRankLabel(regional.rank_label)}</strong>
                    <small>
                      QS {regional.scope} {regional.year}
                    </small>
                  </a>
                ))}
            </div>
            {r.university ? (
              <Link
                className="ranking-university-identity"
                href={"/university/" + r.university.slug}
              >
                <UniversityLogo
                  university={r.university as University}
                  size="lg"
                />
                <span className="ranking-university-name">
                  <strong>{r.name}</strong>
                  <small>
                    {r.country}
                    {r.nationalRank
                      ? ` · National/regional #${r.nationalRank}`
                      : ""}
                    {r.score ? ` · Overall score ${r.score}` : ""}
                  </small>
                </span>
                <ArrowUpRight size={17} />
              </Link>
            ) : (
              <a
                className="ranking-university-identity"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="ranking-university-name">
                  <strong>{r.name}</strong>
                  <small>
                    {r.country}
                    {r.nationalRank
                      ? ` · National/regional #${r.nationalRank}`
                      : ""}
                    {r.score ? ` · Overall score ${r.score}` : ""}
                  </small>
                </span>
                <ArrowUpRight size={17} />
              </a>
            )}
            {r.university ? (
              <RankingBadges university={r.university as University} compact />
            ) : (
              <a
                className="text-link"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                View publisher entry ↗
              </a>
            )}
          </article>
        ))
      )}
      <nav className="pagination-row" aria-label="Ranking pages">
        <button
          disabled={page <= 1 || loading}
          onClick={() => update({ page: String(page - 1) })}
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        <div>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((i) => i === 1 || i === pages || Math.abs(i - page) <= 2)
            .map((i, index, visible) => (
              <span className="page-number-group" key={i}>
                {index > 0 && i > visible[index - 1] + 1 && (
                  <span aria-hidden="true">…</span>
                )}
                <button
                  aria-current={page === i ? "page" : undefined}
                  className={page === i ? "active" : ""}
                  onClick={() => update({ page: String(i) })}
                >
                  {i}
                </button>
              </span>
            ))}
        </div>
        <button
          disabled={page >= pages || loading}
          onClick={() => update({ page: String(page + 1) })}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </nav>
      <p className="ranking-footnote">
        “=” marks a tie. Bands retain their published range. Green positions are
        separately sourced QS regional ranks; coverage is partial. A missing
        badge means no linked record. Leiden contains selected records.
      </p>
    </div>
  );
}
