"use client";
import Link from "next/link";
import { Bookmark, Check, Plus, ArrowUpRight, Eye } from "lucide-react";
import { RankingBadges } from "./ranking-badges";
import { valueOf } from "@/lib/research";
import { University, countryName } from "@/lib/domain";
import { useCollege } from "./provider";
import { CampusImage } from "./campus-image";
import { UniversityLogo } from "./primitives";
import { Metric } from "./metrics";
export function UniversityCard({
  university: u,
  onPreview,
}: {
  university: University;
  onPreview?: () => void;
}) {
  const s = useCollege();
  return (
    <article className="university-card">
      {u.media.some((m) => m.kind === "campus") && (
        <div className="university-card-photo">
          <CampusImage media={u.media.find((m) => m.kind === "campus")} />
        </div>
      )}
      <div className="university-card-top">
        <UniversityLogo university={u} size="lg" />
        <button
          aria-label={(s.saved.includes(u.id) ? "Unsave " : "Save ") + u.name}
          className={"icon-button " + (s.saved.includes(u.id) ? "active" : "")}
          disabled={s.busy}
          onClick={() => s.toggleSaved(u.id)}
        >
          <Bookmark
            size={18}
            fill={s.saved.includes(u.id) ? "currentColor" : "none"}
          />
        </button>
      </div>
      <Link href={"/university/" + u.slug} className="university-name">
        {u.name}
        <ArrowUpRight size={15} />
      </Link>
      <p className="university-location">
        {u.city}
        <span>{countryName(u.country_code)}</span>
      </p>
      <RankingBadges university={u} compact />
      <div className="university-card-stats">
        {(["admission", "tuition"] as const)
          .filter((key) => valueOf(u, key).value != null)
          .map((key) => (
            <Metric key={key} university={u} metricKey={key} />
          ))}
      </div>
      <div className="university-card-bottom">
        {onPreview ? (
          <button onClick={onPreview}>
            <Eye size={14} />
            Quick view
          </button>
        ) : (
          <span>{u.university_type || "Official source linked"}</span>
        )}
        <button
          aria-label={
            (s.compare.includes(u.id) ? "Remove from compare " : "Compare ") +
            u.name
          }
          onClick={() => s.toggleCompare(u.id)}
        >
          {s.compare.includes(u.id) ? <Check size={14} /> : <Plus size={14} />}{" "}
          {s.compare.includes(u.id)
            ? `Added · ${s.compare.length}/5`
            : "Compare"}
        </button>
      </div>
    </article>
  );
}
