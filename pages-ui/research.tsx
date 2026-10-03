"use client";
import { filterLabel } from "@/lib/filter-labels";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import type { ResearchAnswer } from "@/services/ai-provider";
import { filterURL } from "@/lib/research";
export default function Research() {
  const params = useSearchParams();
  const [question, setQuestion] = useState(params.get("q") || ""),
    [answer, setAnswer] = useState<ResearchAnswer | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await getSupabase()?.auth.getSession();
      const response = await fetch("/api/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.data.session
            ? { Authorization: "Bearer " + session.data.session.access_token }
            : {}),
        },
        body: JSON.stringify({
          question,
          ids: (params.get("university") || params.get("ids") || "")
            .split(",")
            .filter(Boolean)
            .slice(0, 5),
        }),
      });
      const data = (await response.json()) as ResearchAnswer & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Research is unavailable");
      setAnswer(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Research could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="research-page" style={{ maxWidth: 900, margin: "auto" }}>
      <header className="page-intro">
        <div className="eyebrow">ASK COLLEGESTAT</div>
        <h1>A research assistant with receipts.</h1>
        <p>
          Ask about sourced university data, interpret your comparison, or turn
          a question into filters.
        </p>
      </header>
      <form className="assistant-form" onSubmit={ask}>
        <input
          aria-label="Research question"
          placeholder="What does MIT report about tuition and financial aid?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          minLength={2}
          maxLength={1000}
        />
        <button className="button button-primary" disabled={busy}>
          {busy ? "Reviewing evidence…" : "Ask CollegeStat →"}
        </button>
      </form>
      <div className="trend-queries">
        {[
          "Compare available costs",
          "What data is missing?",
          "Universities in Germany under $20k",
        ].map((q) => (
          <button
            className="button button-secondary"
            key={q}
            onClick={() => setQuestion(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <p className="reference-note">
        Without a configured AI provider, this uses a deterministic local
        evidence lookup. Connected AI can select relevant verified records; it
        cannot invent numerical answers.
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {answer && (
        <section className="panel" style={{ marginTop: 30 }}>
          <div className="eyebrow">
            {answer.mode === "local"
              ? "LOCAL EVIDENCE LOOKUP"
              : "AI-ASSISTED EVIDENCE SELECTION"}
          </div>
          <p className="assistant-answer">{answer.message}</p>
          <div className="filter-chips" aria-label="Interpreted filters">
            {Object.entries(answer.filters)
              .filter(
                ([k, v]) =>
                  v !== "" && v !== undefined && k !== "page" && k !== "sort",
              )
              .map(([k, v]) => (
                <span key={k}>{filterLabel(k, v)}</span>
              ))}
          </div>
          {answer.unparsed && (
            <p className="reference-note">
              Not applied: {answer.unparsed}. Refine your search to express
              these requirements.
            </p>
          )}
          <p className="caption">
            {answer.total ?? 0} matching universities. Missing data does not
            satisfy a filter.
          </p>
          {answer.matches?.map((u) => (
            <Link
              className="workspace-row text-link"
              key={u.id}
              href={"/university/" + u.slug}
            >
              {u.name} →
            </Link>
          ))}
          {answer.evidence.map((e) => (
            <div className="workspace-row" key={e.id}>
              <div>
                <h3>{e.university}</h3>
                <p>
                  {e.metric}:{" "}
                  <strong>
                    {e.value.toLocaleString()} {e.unit}
                  </strong>{" "}
                  · {e.year || "Year unspecified"}
                </p>
                <p>{e.notes}</p>
                <a
                  className="text-link"
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.source} ↗
                </a>
              </div>
            </div>
          ))}
          <Link
            href={"/universities?" + filterURL(answer.filters)}
            className="button button-secondary"
            style={{ marginTop: 24 }}
          >
            Explore parsed research filters →
          </Link>
        </section>
      )}
    </div>
  );
}
