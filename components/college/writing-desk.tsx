"use client";
/** Small visual pieces of the writing desk: type icons, the hero drawing,
 * the word-count ring and toolbar tooltips. No state, no data. */
import { useId, type ReactElement } from "react";
import {
  AudioLines,
  Award,
  BookOpen,
  Compass,
  Crosshair,
  Feather,
  FileText,
  FlaskConical,
  Glasses,
  Handshake,
  Landmark,
  LayoutList,
  ListChecks,
  Mail,
  MessageSquareText,
  ScrollText,
  SpellCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReviewCriterion } from "@/lib/essay-review";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** One icon per essay type, so a list of essays scans at a glance. */
const TYPE_ICON: Record<string, LucideIcon> = {
  common_app: Feather,
  ucas: ScrollText,
  why_us: Landmark,
  activities: ListChecks,
  short_answer: MessageSquareText,
  community: Users,
  statement: UserRound,
  sop: Compass,
  research: FlaskConical,
  scholarship: Award,
  motivation: Mail,
  recommendation: Handshake,
};

/** Review criteria: what each finding is about. */
export const CRIT_ICON: Record<ReviewCriterion, LucideIcon> = {
  story: BookOpen,
  clarity: Glasses,
  specificity: Crosshair,
  voice: AudioLines,
  structure: LayoutList,
  grammar: SpellCheck,
};

/** The essay type's icon in a soft tinted tile. */
export function TypeTile({ type, size = "md" }: { type: string; size?: "sm" | "md" }) {
  const Icon = TYPE_ICON[type] || FileText;
  return (
    <span className={"wd-tile is-" + size} aria-hidden="true">
      <Icon size={size === "sm" ? 14 : 18} strokeWidth={1.8} />
    </span>
  );
}

/** A plain-icon version for chips and menus. */
export function TypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const Icon = TYPE_ICON[type] || FileText;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Hero drawing: a page with a few written lines, one margin note and a pen. */
export function DeskArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={"wd-art " + (className || "")} viewBox="0 0 200 150" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id + "g"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b8cff" />
          <stop offset="1" stopColor="#22c3e6" />
        </linearGradient>
      </defs>
      {/* back sheet */}
      <rect className="wd-art-sheet is-back" x="46" y="18" width="96" height="122" rx="9" transform="rotate(-6 94 79)" />
      {/* front sheet */}
      <rect className="wd-art-sheet" x="54" y="14" width="96" height="122" rx="9" />
      <rect x="68" y="30" width="44" height="6" rx="3" className="wd-art-ink" />
      <rect x="68" y="48" width="68" height="4" rx="2" className="wd-art-line" />
      <rect x="68" y="58" width="60" height="4" rx="2" className="wd-art-line" />
      <rect x="68" y="68" width="66" height="4" rx="2" fill={`url(#${id}g)`} opacity="0.85" />
      <rect x="68" y="78" width="40" height="4" rx="2" className="wd-art-line" />
      <rect x="68" y="94" width="64" height="4" rx="2" className="wd-art-line" />
      <rect x="68" y="104" width="52" height="4" rx="2" className="wd-art-line" />
      {/* margin note */}
      <path d="M150 58h28a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-16l-7 6v-6h-5a6 6 0 0 1-6-6V64a6 6 0 0 1 6-6Z" className="wd-art-note" />
      <rect x="158" y="66" width="18" height="3" rx="1.5" fill={`url(#${id}g)`} />
      <rect x="158" y="73" width="12" height="3" rx="1.5" className="wd-art-line" />
      <path d="M144 70h-6" stroke={`url(#${id}g)`} strokeWidth="1.5" strokeDasharray="2 2" />
      {/* pen */}
      <g transform="rotate(38 128 112)">
        <rect x="122" y="78" width="12" height="56" rx="3" fill={`url(#${id}g)`} />
        <rect x="122" y="88" width="12" height="4" className="wd-art-band" />
        <path d="M122 134h12l-6 12Z" className="wd-art-nib" />
        <circle cx="128" cy="144" r="1.3" className="wd-art-tip" />
      </g>
    </svg>
  );
}

/** Progress ring for the length goal: fills to the limit, marks the minimum. */
export function CountRing({ value, min, max, size = 22 }: { value: number; min: number; max: number; size?: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const share = Math.min(1, value / Math.max(1, max));
  const minAt = Math.min(1, min / Math.max(1, max));
  const state = value > max ? "over" : value >= min && value > 0 ? "ok" : "under";
  // The minimum tick sits on the ring, measured clockwise from the top.
  const a = minAt * 2 * Math.PI - Math.PI / 2;
  return (
    <svg className={"wd-ring is-" + state} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} className="wd-ring-track" />
      <circle
        cx="12"
        cy="12"
        r={r}
        className="wd-ring-fill"
        strokeDasharray={`${share * c} ${c}`}
        transform="rotate(-90 12 12)"
      />
      {min > 0 && minAt < 1 && <circle cx={12 + r * Math.cos(a)} cy={12 + r * Math.sin(a)} r="1.4" className="wd-ring-min" />}
    </svg>
  );
}

/** A tooltip for an icon button. Needs a TooltipProvider above it. */
export function Tip({ label, children, side = "bottom" }: { label: string; children: ReactElement; side?: "top" | "bottom" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="wd-tip">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
