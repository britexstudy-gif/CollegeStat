"use client";
import Link from "next/link";
import { Check, Plus, ArrowUpRight, Eye, MapPin } from "lucide-react";
import { RankingBadges } from "./ranking-badges";
import { valueOf } from "@/lib/research";
import { University, countryName } from "@/lib/domain";
import { useCollege } from "./provider";
import { CampusImage } from "./campus-image";
import { UniversityLogo } from "./primitives";
import { Metric } from "./metrics";
import { SaveButton } from "./save-button";
export function UniversityCard({
  university: u,
  onPreview,
  layout = "grid",
}: {
  university: University;
  onPreview?: () => void;
  layout?: "grid" | "list";
}) {
  const s = useCollege();
  return (
    <article className={"institution-card institution-card--" + layout}>
      {layout === "grid" && u.media.some((m) => m.kind === "campus") && (
        <div className="institution-photo">
          <CampusImage media={u.media.find((m) => m.kind === "campus")} />
        </div>
      )}
      <div className="institution-identity">
        <UniversityLogo university={u} size="lg" />
        <div className="institution-heading">
          <Link href={"/university/" + u.slug} className="institution-name">
            {u.name}
            <ArrowUpRight size={15} />
          </Link>
          <p className="institution-location">
            <MapPin size={13} aria-hidden="true" />
            {[u.city, countryName(u.country_code)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <SaveButton id={u.id} compact label={u.name} />
      </div>
      <div className="institution-ranks">
        <RankingBadges university={u} compact />
      </div>
      <div className="institution-facts">
        {(["admission", "tuition"] as const)
          .filter((key) => valueOf(u, key).value != null)
          .map((key) => (
            <Metric key={key} university={u} metricKey={key} />
          ))}
      </div>
      <div className="institution-actions">
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
