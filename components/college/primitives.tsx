"use client";
import { WorkspaceLink as Link } from "./workspace-link";
import { BrandMark } from "./brand-mark";
import { useEffect, useState, useSyncExternalStore } from "react";
import { autoLogoURL } from "@/lib/auto-logo";
import { officialLogo } from "@/lib/official-logos";
import { universityMarks } from "@/lib/university-assets";
import { displayName } from "@/lib/university-display-name";
import { monogramColor, monogramLetters } from "@/lib/university-monogram";
import { useLiquidGlass } from "./use-liquid-glass";
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
      <BrandMark />
      <span className="brand-word">
        CollegeStat<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export type UniversityIdentity = Pick<
  University,
  | "name"
  | "slug"
  | "website"
  | "logo_url"
  | "website_icon_url"
  | "short_name"
  | "brand_color"
  | "auto_logo"
> & { id?: string };

// University id → official site icon format (see auto-logos-provenance.json).
// The server normally resolves this into `auto_logo`; the 300 KB map is only
// downloaded, once and lazily, for records that arrive without it.
let autoLogoMap: Record<string, string> | undefined;
let autoLogoLoad: Promise<void> | undefined;
const autoLogoListeners = new Set<() => void>();
function loadAutoLogoMap() {
  autoLogoLoad ??= import("@/data/published/auto-logos.json")
    .then((m) => {
      autoLogoMap = m.default as Record<string, string>;
      autoLogoListeners.forEach((notify) => notify());
    })
    .catch(() => {
      autoLogoLoad = undefined;
    });
}
function siteIcon(website?: string | null) {
  if (!website) return null;
  try {
    const host = new URL(/^https?:\/\//.test(website) ? website : "https://" + website).hostname.replace(/^www\./, "");
    return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : null;
  } catch {
    return null;
  }
}
function useAutoLogo(u: UniversityIdentity) {
  const needsMap = u.auto_logo === undefined && !!u.id;
  useEffect(() => {
    if (needsMap && !autoLogoMap) loadAutoLogoMap();
  }, [needsMap]);
  const ext = useSyncExternalStore(
    (notify) => {
      autoLogoListeners.add(notify);
      return () => void autoLogoListeners.delete(notify);
    },
    () => (needsMap && u.id ? autoLogoMap?.[u.id] : undefined),
    () => undefined,
  );
  return u.auto_logo !== undefined ? u.auto_logo : u.id ? autoLogoURL(u.id, ext) : null;
}
export function UniversityLogo({
  university: u,
  size = "md",
}: {
  university: UniversityIdentity;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const [failedURLs, setFailedURLs] = useState<string[]>([]);
  const [loadedURL, setLoadedURL] = useState<string | null>(null);
  const official = officialLogo(u.website);
  const autoIcon = useAutoLogo(u);
  const candidates = [
    { url: official?.local, label: "official logo" },
    // Square, high-resolution icons declared by the university's own site
    // render better than the older wide or low-resolution logo_url values.
    { url: autoIcon, label: "official site icon" },
    { url: u.logo_url, label: "logo" },
    { url: u.website_icon_url, label: "official website icon" },
    // Last resort before the monogram: the icon the university's own domain serves,
    // at 128px. Unknown domains come back as a 16px globe, which settle() rejects.
    { url: siteIcon(u.website), label: "website icon" },
  ];
  const candidate = candidates.find(
    (c) => c.url && !failedURLs.includes(c.url),
  );
  const imageURL = candidate?.url;
  const mark = universityMarks.find((m) => m.remote === imageURL);
  const src = mark?.local || imageURL;
  const shown = !!imageURL && loadedURL === imageURL;
  const fail = (url: string) =>
    setFailedURLs((previous) =>
      previous.includes(url) ? previous : [...previous, url],
    );
  // A mark that is tiny (a blurry favicon) or very wide/tall (a wordmark that
  // would be unreadable in a square tile) gives way to the monogram. Decided
  // from the image's natural size on load; vectors without a size stay.
  const settle = (img: HTMLImageElement | null) => {
    if (!img || !imageURL || !img.complete) return;
    const { naturalWidth: w, naturalHeight: h } = img;
    const vector = /\.svg($|\?)/i.test(img.currentSrc || img.src);
    if (!w && !vector) fail(imageURL);
    else if (w && h && !vector && Math.min(w, h) < 48) fail(imageURL);
    else if (w && h && (w / h > 2.2 || h / w > 2.2)) fail(imageURL);
    else setLoadedURL(imageURL);
  };
  const letters = monogramLetters(displayName(u.name), u.short_name);
  const tint = monogramColor(u.id || u.slug || u.name, u.brand_color);
  return (
    <span
      className={
        "university-logo has-logo-tile logo-" +
        size +
        " logo-" +
        u.slug +
        (shown ? " has-logo-image" : " has-logo-monogram") +
        (shown && imageURL === official?.local && official?.surface === "dark"
          ? " logo-surface-dark"
          : "")
      }
      style={
        {
          "--institution-color": tint,
        } as React.CSSProperties
      }
    >
      {!shown && (
        <span className="logo-monogram" aria-hidden={!!imageURL}>
          <span
            className="logo-monogram-letters"
            data-letters={Array.from(letters).length}
          >
            {letters}
          </span>
        </span>
      )}
      {!shown && !imageURL && <span className="sr-only">{u.name}</span>}
      {src && imageURL && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={imageURL}
          ref={settle}
          className="logo-image"
          src={src}
          width={80}
          height={80}
          loading={size === "xl" ? "eager" : "lazy"}
          decoding="async"
          onLoad={(event) => settle(event.currentTarget)}
          onError={() => fail(imageURL)}
          alt={displayName(u.name) + " · " + candidate?.label}
        />
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
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const glass = useLiquidGlass<HTMLButtonElement>();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        ref={glass}
        data-glass="rim"
        aria-label={label}
        className={"choice filter-choice " + className}
      >
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
  const sourceURL = originalSourceURL(record);
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
          hasSource={Boolean(sourceURL)}
        />
        <dl>
          <div>
            <dt>Data year</dt>
            <dd>{record?.year || "Not available"}</dd>
          </div>
          <SourceEvidenceDetails record={record} />
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
        {sourceURL ? (
          <a
            href={sourceURL}
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

function evidenceText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function evidenceURL(value: unknown): string | undefined {
  const text = evidenceText(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password
      ? text
      : undefined;
  } catch {
    return undefined;
  }
}

/** Prefer the observation's exact source page to the organization's home page. */
export function originalSourceURL(record?: Sourced | null) {
  return (
    evidenceURL(record?.source_url) || evidenceURL(record?.data_sources?.url)
  );
}

/** Source context stays next to the figure, including survey definitions. */
export function SourceEvidenceDetails({ record }: { record?: Sourced | null }) {
  const evidence = record?.evidence;
  const retrieved = [
    record?.data_sources?.retrieved_at,
    evidence?.retrieved_at,
    evidence?.source_snapshot_retrieved_at,
  ]
    .map(evidenceText)
    .find((value) => value && Number.isFinite(Date.parse(value)));
  const rows = [
    ["Population", evidenceText(evidence?.population)],
    ["Reporting period", evidenceText(evidence?.reporting_period)],
    ["Scope", evidenceText(evidence?.scope)],
    ["Retrieved", retrieved ? dateLabel(retrieved) : undefined],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const dictionary = evidenceURL(evidence?.dictionary_url);
  return (
    <>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {dictionary && (
        <div>
          <dt>Data dictionary</dt>
          <dd>
            <a
              className="text-link"
              href={dictionary}
              target="_blank"
              rel="noreferrer"
            >
              View field definitions <ExternalLink size={13} />
            </a>
          </dd>
        </div>
      )}
    </>
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
      <span className="university-stat">
        <span>
          {label}
          <Info size={12} />
        </span>
        <strong className={value === "Not available" ? "unavailable" : ""}>
          {value}
        </strong>
        {note && <small>{note}</small>}
      </span>
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
