"use client";
/**
 * Dashboard kit (v4): the only building blocks signed-in pages use, so every
 * section reads the same way. Styles: ./dash-kit.css (`dk-*`).
 *
 *   Layout    Page · PageHeader · Section · Panel (rare; prefer lists/tables)
 *   Data      Stat/StatGroup · List/ListRow · DataTable (sortable, sticky head) · DL
 *   Status    StatusPill (neutral + accent/success/warning/danger, violet for fit)
 *             ProgressBar · Meter · ProgressRing · Countdown · DateText
 *   Controls  Btn (primary/secondary/ghost/danger, icon, sm) · Input · Select ·
 *             SearchInput · Segmented · Tabs
 *   Feedback  EmptyState · Skeleton · Tip (tooltip) · Kbd · toast
 *   Overlays  Menu* (dropdown) · Dialog* · Sheet* (re-exported shadcn, kit-styled)
 *   Identity  UniLogo (official/auto logo, monogram fallback) · Avatar
 *
 * Rules: 4/8px spacing · radius 6/10/pill · hairline borders, no shadows ·
 * one accent · 13–14px text · tabular numbers · lucide icons at 16px.
 */
import { useMemo, useState, type ReactNode, type ComponentProps } from "react";
import { ArrowRight, ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { WorkspaceLink as Link } from "./workspace-link";
import { cn } from "@/lib/utils";
import { absoluteDate } from "@/lib/date-label";
import { useI18n } from "./i18n";
import { UniversityLogo } from "./primitives";
import { Mascot } from "./mascot";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import "./dash-kit.css";

export { toast } from "sonner";
export {
  DropdownMenu as Menu,
  DropdownMenuTrigger as MenuTrigger,
  DropdownMenuContent as MenuContent,
  DropdownMenuItem as MenuItem,
  DropdownMenuSeparator as MenuSeparator,
} from "@/components/ui/dropdown-menu";
export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";

/* ── Layout ─────────────────────────────────────────────────────────── */

/** Page frame: one width for every dashboard section. */
export function Page({ children, narrow, className, busy }: { children: ReactNode; narrow?: boolean; className?: string; busy?: boolean }) {
  return (
    <div className={cn("dk-page", narrow && "dk-page--narrow", className)} aria-busy={busy || undefined}>
      {children}
    </div>
  );
}

/** Title, one-line purpose and at most one primary action. */
export function PageHeader({
  title,
  description,
  actions,
  leading,
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  id?: string;
  className?: string;
}) {
  const text = (
    <div className="dk-head-text">
      <h1 id={id}>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
  return (
    <header className={cn("dk-head", className)}>
      {leading ? (
        <div className="dk-head-lead">
          {leading}
          {text}
        </div>
      ) : (
        text
      )}
      {actions && <div className="dk-head-actions">{actions}</div>}
    </header>
  );
}

/** A titled block of the page. `href`+`link` add a quiet "open" link on the right. */
export function Section({
  id,
  title,
  count,
  description,
  tools,
  href,
  link,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  tools?: ReactNode;
  href?: string;
  link?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("dk-section", className)}>
      <div className="dk-section-head">
        <div className="min-w-0">
          <h2 id={id}>
            {title}
            {count != null && <small>{count}</small>}
          </h2>
          {description && <p>{description}</p>}
        </div>
        {(tools || (href && link)) && (
          <div className="dk-section-tools">
            {tools}
            {href && link && <TextLink href={href}>{link}</TextLink>}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

/** Bordered surface. Use sparingly: lists and tables carry their own border. */
export function Panel({ children, className, pad = true, as = "div" }: { children: ReactNode; className?: string; pad?: boolean; as?: "div" | "section" }) {
  const Tag = as;
  return <Tag className={cn("dk-panel", pad && "dk-panel--pad", className)}>{children}</Tag>;
}

/** Legacy names kept for older sections: a Panel with a Section-style head. */
export function Card({ className, labelledBy, children, as = "section" }: { className?: string; labelledBy?: string; children: ReactNode; as?: "section" | "div" }) {
  const Tag = as;
  return (
    <Tag aria-labelledby={labelledBy} className={cn("dk-panel dk-panel--pad flex flex-col gap-3", className)}>
      {children}
    </Tag>
  );
}
export function CardHead({ id, title, icon, href, link, extra }: { id: string; title: ReactNode; icon?: ReactNode; href?: string; link?: string; extra?: ReactNode }) {
  return (
    <div className="dk-section-head">
      <h2 id={id}>
        {icon}
        {title}
      </h2>
      <div className="dk-section-tools">
        {extra}
        {href && link && <TextLink href={href}>{link}</TextLink>}
      </div>
    </div>
  );
}

export function TextLink({ href, children, accent, className }: { href: string; children: ReactNode; accent?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("dk-link", accent && "dk-link--accent", className)}>
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/* ── Buttons and inputs ─────────────────────────────────────────────── */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnProps = {
  variant?: BtnVariant;
  size?: "md" | "sm";
  icon?: boolean;
  className?: string;
  children: ReactNode;
};
/** Button; with `href` it renders a link that looks the same. */
export function Btn({
  variant = "secondary",
  size = "md",
  icon,
  className,
  href,
  external,
  children,
  ...rest
}: BtnProps & { href?: string; external?: boolean } & Omit<ComponentProps<"button">, "children" | "className">) {
  const cls = cn("dk-btn", "dk-btn--" + variant, size === "sm" && "dk-btn--sm", icon && "dk-btn--icon", className);
  if (href)
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" className={cls} aria-label={rest["aria-label"]}>
        {children}
      </a>
    ) : (
      <Link href={href} className={cls} aria-label={rest["aria-label"]}>
        {children}
      </Link>
    );
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("dk-input", className)} {...props} />;
}
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn("dk-input", className)} {...props}>
      {children}
    </select>
  );
}
export function SearchInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <span className={cn("dk-search", className)}>
      <Search aria-hidden="true" />
      <input type="search" className="dk-input" {...props} />
    </span>
  );
}

/** Segmented control: a few mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("dk-seg", className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
          {o.count != null && <b>{o.count}</b>}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs for switching views inside a page. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="dk-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} onClick={() => onChange(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ── Status ─────────────────────────────────────────────────────────── */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "violet";
export function StatusPill({ tone = "neutral", dot, children, className, title }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn("dk-pill", tone !== "neutral" && "dk-pill--" + tone, className)} title={title}>
      {dot && <i aria-hidden="true" />}
      {children}
    </span>
  );
}
export const Badge = StatusPill;

export function ProgressBar({ value, label, done, className }: { value: number; label?: string; done?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span
      className={cn("dk-bar", done && "is-done", className)}
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(v) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-hidden={label ? undefined : true}
    >
      <i style={{ width: v + "%" }} />
    </span>
  );
}
/** Bar plus a "2/6" fraction. */
export function Meter({ done, total, label, className }: { done: number; total: number; label?: string; className?: string }) {
  return (
    <span className={cn("dk-meter", className)} title={label}>
      <ProgressBar value={total ? (done / total) * 100 : 0} done={total > 0 && done >= total} label={label} />
      <span>
        {done}/{total}
      </span>
    </span>
  );
}

/** Circular progress (0–100) with content in the middle. */
export function ProgressRing({ value, size = 64, stroke = 6, label, children }: { value: number; size?: number; stroke?: number; label: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="dk-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className="dk-ring-value"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** "in 11 days" — amber inside two weeks, red when late, neutral otherwise. */
export function Countdown({ days, className }: { days: number; className?: string }) {
  const { t } = useI18n();
  const tone: Tone = days < 0 ? "danger" : days <= 14 ? "warning" : "neutral";
  return (
    <StatusPill tone={tone} className={className}>
      {days < 0 ? t("db.late", { n: -days }) : days === 0 ? t("db.today") : days === 1 ? t("db.tomorrow") : t("d2.days", { n: days })}
    </StatusPill>
  );
}

/** "15 Jan 2027" in the interface language. */
export function DateText({ date, className, suffix = "" }: { date: string; className?: string; suffix?: string }) {
  const { lang } = useI18n();
  return (
    <span className={cn("dk-num", className)}>
      <time dateTime={date}>{absoluteDate(date, lang)}</time>
      {suffix}
    </span>
  );
}
export const DateLabel = DateText;

/* ── Data ───────────────────────────────────────────────────────────── */

export function Stat({ label, value, hint, href, tone, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; href?: string; tone?: "warning"; icon?: ReactNode }) {
  const body = (
    <>
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </>
  );
  const cls = cn("dk-stat", tone && "is-" + tone);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
/** One bordered strip of stats separated by hairlines. */
export function StatGroup({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn("dk-stats", className)} role={label ? "group" : undefined} aria-label={label}>
      {children}
    </div>
  );
}

/** Bordered list (panel) or a flush divided list inside a panel. */
export function List({ children, flush, className, label }: { children: ReactNode; flush?: boolean; className?: string; label?: string }) {
  return (
    <ul className={cn("dk-list", flush ? "dk-list--divided dk-list--flush" : "dk-panel", className)} aria-label={label}>
      {children}
    </ul>
  );
}
export function ListRow({
  leading,
  title,
  meta,
  trailing,
  href,
  external,
  done,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  external?: boolean;
  done?: boolean;
  className?: string;
}) {
  return (
    <li className={cn("dk-row", href && "is-link", done && "is-done", className)}>
      {leading}
      <span className="dk-row-main">
        {href ? (
          external ? (
            <a href={href} target="_blank" rel="noreferrer" className="dk-row-link dk-row-title">
              {title}
            </a>
          ) : (
            <Link href={href} className="dk-row-link dk-row-title">
              {title}
            </Link>
          )
        ) : (
          <span className="dk-row-title">{title}</span>
        )}
        {meta && <span className="dk-row-meta">{meta}</span>}
      </span>
      {trailing && <span className="dk-row-trail">{trailing}</span>}
    </li>
  );
}

/** Label/value pairs. */
export function DL({ items, className }: { items: { id: string; label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("dk-dl", className)}>
      {items.map((x) => (
        <div key={x.id}>
          <dt>{x.label}</dt>
          <dd>{x.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Sort value; columns without one are not sortable. */
  sort?: (row: T) => string | number;
  align?: "end";
  hide?: "sm" | "md";
  width?: string;
};
/** Table with a sticky header, sortable columns and optional expandable detail rows. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  initialSort,
  expanded,
  detail,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  label: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  expanded?: ReadonlySet<string>;
  detail?: (row: T) => ReactNode;
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const val = col.sort;
    const dir = sort!.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, columns, sort]);
  if (!rows.length && empty) return <div className="dk-panel">{empty}</div>;
  return (
    <div className="dk-table-wrap">
      <table className="dk-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn("dk-th", c.align === "end" && "is-end", c.hide && "dk-hide-" + c.hide)}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.sort ? (
                    <button type="button" onClick={() => setSort({ key: c.key, dir: active && sort!.dir === "asc" ? "desc" : "asc" })}>
                      {c.header}
                      {active ? sort!.dir === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" /> : <ChevronsUpDown aria-hidden="true" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const open = !!detail && !!expanded?.has(key);
            return [
              <tr key={key} className={cn("dk-tr", open && "is-open")}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("dk-td", c.align === "end" && "is-end", c.hide && "dk-hide-" + c.hide)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>,
              open ? (
                <tr key={key + ":detail"} className="dk-tr-detail" id={"dk-detail-" + key}>
                  <td colSpan={columns.length}>{detail!(row)}</td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Feedback ───────────────────────────────────────────────────────── */

/** Icon, one sentence, one action. */
export function EmptyState({
  icon,
  title,
  text,
  action,
  href,
  onAction,
  align = "center",
  mascot = false,
}: {
  /** Show the mascot instead of an icon (one per screen, on first-time empty states). */
  mascot?: boolean;
  icon?: ReactNode;
  title?: ReactNode;
  text: ReactNode;
  action?: string;
  href?: string;
  onAction?: () => void;
  align?: "center" | "start";
}) {
  return (
    <div className={cn("dk-empty", align === "start" && "dk-empty--start")}>
      {mascot ? (
        <span className="dk-empty-mascot" aria-hidden="true">
          <Mascot size={44} />
        </span>
      ) : (
        icon && (
          <span className="dk-empty-icon" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      {title && <strong>{title}</strong>}
      <p>{text}</p>
      {action && (href || onAction) && (
        <Btn href={href} onClick={onAction} size="sm">
          {action} <ArrowRight aria-hidden="true" />
        </Btn>
      )}
    </div>
  );
}
/** Legacy: a left-aligned empty state inside a panel. */
export function EmptyHint({ text, action, href, icon }: { text: ReactNode; action?: string; href?: string; icon?: ReactNode }) {
  return <EmptyState text={text} action={action} href={href} icon={icon} align="start" />;
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={cn("dk-skel", className)} style={style} aria-hidden="true" />;
}
export function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton className={cn("h-24 w-full", className)} />;
}

/** Hover/focus hint for icon-only controls. */
export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="dk-kbd">{children}</kbd>;
}

/* ── Identity ───────────────────────────────────────────────────────── */

/** University mark: official or auto-detected logo, monogram fallback. */
export function UniLogo({ university, size = "sm" }: { university: ComponentProps<typeof UniversityLogo>["university"]; size?: "sm" | "md" }) {
  return <UniversityLogo university={university} size={size} />;
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className="dk-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {(name || "S").trim().charAt(0).toUpperCase()}
    </span>
  );
}
