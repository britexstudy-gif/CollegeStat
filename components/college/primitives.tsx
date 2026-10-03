"use client";
import Link from "next/link";
import { useState } from "react";
import { officialLogo } from "@/lib/official-logos";
import { universityMarks } from "@/lib/university-assets";
import Image from "next/image";
import {
  ArrowUpRight,
  ExternalLink,
  Info,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { University, Sourced, dateLabel, ranking } from "@/lib/domain";
export function GlassSurface({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={"liquid-glass " + className} {...props}>
      {children}
    </div>
  );
}
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="CollegeStat home">
      <svg className="brand-mark" viewBox="400 270 992 403" aria-hidden="true">
        <image href="/brand/cstat.png" width="1774" height="887" />
      </svg>
      CollegeStat<span className="brand-dot">.</span>
    </Link>
  );
}
export type UniversityIdentity = Pick<University, "name" | "slug" | "website" | "logo_url" | "website_icon_url" | "short_name" | "brand_color">;
export function UniversityLogo({
  university: u,
  size = "md",
}: {
  university: UniversityIdentity;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const [failedURLs, setFailedURLs] = useState<string[]>([]);
  const official = officialLogo(u.website);
  const candidates = [
    { url: official?.local, label: "official logo" },
    { url: u.logo_url, label: "logo" },
    { url: u.website_icon_url, label: "official website icon" },
  ];
  const candidate = candidates.find(
    (c) => c.url && !failedURLs.includes(c.url),
  );
  const imageURL = candidate?.url;
  const mark = universityMarks.find((m) => m.remote === imageURL);
  return (
    <span
      className={
        "university-logo logo-" +
        size +
        " logo-" +
        u.slug +
        (imageURL === official?.local && official?.surface === "dark"
          ? " logo-surface-dark"
          : "")
      }
      style={
        {
          "--institution-color": u.brand_color || "#3b557e",
        } as React.CSSProperties
      }
    >
      {imageURL ? (
        <Image
          unoptimized
          width={80}
          height={80}
          src={mark?.local || imageURL}
          onError={() => setFailedURLs((previous) => [...previous, imageURL])}
          alt={u.name + " · " + candidate?.label}
        />
      ) : (
        <span
          className="institution-monogram"
          aria-label={u.name + " · initials"}
        >
          {(u.short_name && u.short_name.length <= 5
            ? u.short_name
            : u.name
                .replace(/[^\p{L}\p{N}\s]/gu, "")
                .split(/\s+/)
                .filter(
                  (w) =>
                    w.length > 0 &&
                    !["of", "the", "and", "in"].includes(w.toLowerCase()),
                )
                .slice(0, 3)
                .map((w) => w[0])
                .join("")
          ).toUpperCase()}
        </span>
      )}
    </span>
  );
}
export function Choice({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  label: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={"choice " + className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          return (
            <SelectItem value={v} key={v}>
              {typeof o === "string" ? o : o.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
export function SourceBadge({
  status,
  hasSource = true,
}: {
  status?: string;
  hasSource?: boolean;
}) {
  const verified = status === "verified" && hasSource;
  return (
    <span className={"source-badge " + (verified ? "verified" : "")}>
      <span className="source-dot" />
      {verified
        ? "Verified"
        : !hasSource
          ? "Missing source"
          : status === "outdated"
            ? "Outdated"
            : "Needs review"}
    </span>
  );
}
export function VerifiedBadge({ date }: { date?: string | null }) {
  return date ? (
    <span className="verified-label">
      <ShieldCheck size={14} />
      Last verified {dateLabel(date)}
    </span>
  ) : (
    <span className="verified-label neutral">
      <Info size={14} />
      Statistics awaiting verification
    </span>
  );
}
export function DataSourcePopover({
  record,
  label,
  children,
}: {
  record?: Sourced | null;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="source-trigger"
          aria-label={"View source for " + label}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="source-popover liquid-glass" align="start">
        <span className="section-caption">BEHIND THE NUMBER</span>
        <h3>{label}</h3>
        <SourceBadge
          status={record?.verification_status}
          hasSource={!!record?.source_id}
        />
        <dl>
          <div>
            <dt>Data year</dt>
            <dd>{record?.year || "Not available"}</dd>
          </div>
          <div>
            <dt>Retrieved</dt>
            <dd>{dateLabel(record?.data_sources?.retrieved_at)}</dd>
          </div>
          <div>
            <dt>Last verified</dt>
            <dd>{dateLabel(record?.verified_at)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{record?.data_sources?.name || "Not available"}</dd>
          </div>
        </dl>
        {record?.notes && <p>{record.notes}</p>}
        {record?.data_sources?.url ? (
          <a
            href={record.data_sources.url}
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            View original source
            <ExternalLink size={13} />
          </a>
        ) : (
          <p>
            No source-backed value has been published. We leave this field empty
            rather than estimate it.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
export function UniversityStat({
  label,
  value,
  record,
  note,
}: {
  label: string;
  value: React.ReactNode;
  record?: Sourced | null;
  note?: string;
}) {
  return (
    <DataSourcePopover record={record} label={label}>
      <div className="university-stat">
        <span>
          {label}
          <Info size={12} />
        </span>
        <strong className={value === "Not available" ? "unavailable" : ""}>
          {value}
        </strong>
        {note && <small>{note}</small>}
      </div>
    </DataSourcePopover>
  );
}
export function RankingBadge({ university: u }: { university: University }) {
  const r = ranking(u);
  return r ? (
    <DataSourcePopover record={r} label="Global ranking">
      <span className="ranking-badge">
        #{r.rank_label || r.rank}
        <span>
          {r.ranking_editions?.ranking_providers?.name} · {r.year}
        </span>
      </span>
    </DataSourcePopover>
  ) : (
    <span className="ranking-unavailable">Ranking not available</span>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Search size={27} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  link,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {href && (
        <Link href={href} className="text-link">
          {link || "Explore more"}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
