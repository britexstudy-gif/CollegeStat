"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  CircleHelp,
  Cookie,
  Crown,

  LogOut,
  Menu,
  Search,
  Settings2,
  UserRound,
  Users,
  type LucideIcon,
  MessageSquareWarning,
} from "lucide-react";
import {
  Bank,
  BookOpenText,
  CalendarCheck,
  ClipboardText,
  GearSix,
  GraduationCap,
  HandCoins as PhHandCoins,
  House as PhHouse,
  PenNib,
  Target,
  Trophy as PhTrophy,
  UserCircle,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppearanceButton } from "@/components/college/appearance-button";
import { SupportForm } from "@/components/college/support-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LanguageSwitcher, useT } from "@/components/college/i18n";
import { AIMark } from "@/components/college/ai-mark";
import { FirstRunGuide, openTour } from "@/components/college/first-run-guide";
import { openCookieSettings } from "@/lib/consent";
import { useCollege } from "@/components/college/provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useProgress } from "@/lib/progress-store";
import { utcDay } from "@/lib/student-progress";
import { effectivePlan, limitsOf, onEarlyAccess, UNLIMITED } from "@/lib/plans";
import "./dashboard.css";
import "./dash-kit.css";
import { UserAvatar, avatarOf } from "./user-avatar";

/** Sidebar labels by their English source text. */
const NAV_KEY: Record<string, MessageKey> = {
  Home: "dash.home",
  "My colleges": "d2.nav.colleges",
  Profile: "nav.my_profile",
  Plan: "dash.plan",
  Report: "db.nav.report",
  Essays: "db.nav.essays",
  "Writing desk": "d3.nav.desk",
  Settings: "db.settings",
  "AI assistant": "db.nav.ai",
  Universities: "nav.universities",
  Scholarships: "nav.scholarships",
  Articles: "nav.articles",
  Rankings: "nav.rankings",
  Chances: "d2.nav.chances",
  "Application forms": "d2.nav.forms",
  People: "dash.people",
};

export type OnePrepSection =
  | "Overview"
  | "Practice"
  | "Writing"
  | "Guide"
  | "Universities"
  | "Scholarships"
  | "Comparisons"
  | "Searches"
  | "History"
  | "Checklist"
  | "Lists";

export const ONEPREP_SECTIONS: OnePrepSection[] = [
  "Overview",
  "Practice",
  "Writing",
  "Guide",
  "Universities",
  "Scholarships",
  "Comparisons",
  "Searches",
  "History",
  "Checklist",
  "Lists",
];

type NavIconProps = { size?: number; strokeWidth?: number; active?: boolean };
type AnyIcon = LucideIcon | React.ComponentType<NavIconProps>;

/** Phosphor icons: a calm outline at rest, filled for the page the student is on. */
const ph = (I: PhosphorIcon) => {
  function NavIcon({ size = 17, active }: NavIconProps) {
    return <I size={size} weight={active ? "fill" : "regular"} aria-hidden="true" />;
  }
  return NavIcon;
};
type WorkspaceNavItem = { label: string; icon: AnyIcon; tour?: string } & (
  | { tab: OnePrepSection; counted?: boolean }
  | { href: string; matches?: (pathname: string) => boolean }
);

function NavAIMark(props: NavIconProps) {
  return <AIMark size={props.size ?? 16} />;
}

/** Plan first (the student's next steps), then the everyday places in the
 * order the owner set: Home, My colleges, AI, Writing desk, Application forms,
 * Chances, Scholarships. Discovery sits in one collapsible group; profile and
 * settings close the list. Test prep is hidden for now (its routes redirect home).
 * Workers adding a page add one entry to the fitting list (with a NAV_KEY label above). */
const PRIMARY_NAV: WorkspaceNavItem[] = [
  { label: "Home", icon: ph(PhHouse), tab: "Overview", tour: "home" },
  { label: "Plan", icon: ph(CalendarCheck), tab: "Checklist", counted: true, tour: "plan" },
  { label: "My colleges", icon: ph(GraduationCap), tab: "Universities", counted: true, tour: "colleges" },
  { label: "AI assistant", icon: NavAIMark, href: "/dashboard/assistant", tour: "ai" },
  { label: "Writing desk", icon: ph(PenNib), tab: "Writing" },
  { label: "Chances", icon: ph(Target), href: "/dashboard/admissions-check" },
  {
    label: "Scholarships",
    icon: ph(PhHandCoins),
    href: "/dashboard/library/scholarships",
    matches: (path) => path.startsWith("/dashboard/library/scholarship"),
  },
];
/** The phone bar shows the first four; everything else is one tap away in "More". */
const BOTTOM_NAV = PRIMARY_NAV.slice(0, 4);
const EXPLORE_NAV: WorkspaceNavItem[] = [
  {
    label: "Universities",
    icon: ph(Bank),
    href: "/dashboard/universities",
    matches: (path) => path === "/dashboard/universities" || path.startsWith("/dashboard/university/"),
  },
  { label: "Rankings", icon: ph(PhTrophy), href: "/dashboard/rankings" },
  {
    label: "Articles",
    icon: ph(BookOpenText),
    href: "/dashboard/library/articles",
    matches: (path) => path === "/dashboard/library" || path.startsWith("/dashboard/library/articles"),
  },
];
const PROFILE_NAV: WorkspaceNavItem[] = [
  { label: "Profile", icon: ph(UserCircle), href: "/dashboard/profile", matches: (path) => path.startsWith("/dashboard/profile") || path.startsWith("/dashboard/welcome") },
  { label: "Report", icon: ph(ClipboardText), href: "/dashboard/report" },
  { label: "Settings", icon: ph(GearSix), href: "/dashboard/settings", matches: (path) => path.startsWith("/dashboard/settings") || path.startsWith("/dashboard/plans") },
];
const GROUPS: { key: MessageKey; items: WorkspaceNavItem[] }[] = [
  { key: "oc.home.grp.explore", items: EXPLORE_NAV },
  { key: "oc.nav.you", items: PROFILE_NAV },
];
/** Top-bar title for the current place. */
function titleKey(pathname: string, tab: OnePrepSection): MessageKey {
  const routes: [string, MessageKey][] = [
    ["/dashboard/assistant", "db.nav.ai"],
    ["/dashboard/report", "db.nav.report"],
    ["/dashboard/library/scholarship", "nav.scholarships"],
    ["/dashboard/library", "nav.articles"],
    ["/dashboard/universities", "nav.universities"],
    ["/dashboard/university/", "nav.universities"],
    ["/dashboard/rankings", "nav.rankings"],
    ["/dashboard/compare", "nav.compare"],
    ["/dashboard/admissions-check", "d2.nav.chances"],
    ["/dashboard/application-practice", "d2.nav.forms"],
    ["/dashboard/people", "dash.people"],
    ["/dashboard/plans", "d2.plans.title"],
    ["/dashboard/profile", "nav.my_profile"],
    ["/dashboard/settings", "db.settings"],
  ];
  const hit = routes.find(([prefix]) => pathname.startsWith(prefix));
  if (hit) return hit[1];
  const byTab: Partial<Record<OnePrepSection, MessageKey>> = {
    Checklist: "dash.plan",
    Universities: "d2.nav.colleges",
    Writing: "d3.nav.desk",
    Practice: "dash.prepare",
  };
  return byTab[tab] || "dash.home";
}

function NavItems({
  items,
  isActive,
  onTab,
  counts,
}: {
  items: WorkspaceNavItem[];
  isActive: (item: WorkspaceNavItem) => boolean;
  onTab: (next: OnePrepSection) => void;
  counts: Partial<Record<OnePrepSection, number>>;
}) {
  const t = useT();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon;
        const label = t(NAV_KEY[item.label]);
        const active = isActive(item);
        const count = "tab" in item && item.counted ? counts[item.tab] : undefined;
        return (
          <SidebarMenuItem key={item.label}>
            <SidebarMenuButton asChild isActive={active} tooltip={label} className="db-nav-item">
              {"tab" in item ? (
                <button
                  type="button"
                  data-tour={item.tour}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    onTab(item.tab);
                    setOpenMobile(false);
                  }}
                >
                  <Icon size={17} strokeWidth={1.8} active={active} />
                  <span>{label}</span>
                </button>
              ) : (
                <Link href={item.href} data-tour={item.tour} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                  <Icon size={17} strokeWidth={1.8} active={active} />
                  <span>{label}</span>
                </Link>
              )}
            </SidebarMenuButton>
            {typeof count === "number" && count > 0 && (
              <SidebarMenuBadge className="db-nav-count">{count > 99 ? "99+" : count}</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/** "Scholar · AI 4/100": the plan and today's AI use, for the account row. */
function usePlanLine() {
  const t = useT();
  const { user, profile } = useCollege();
  const { events } = useProgress(user?.id);
  if (!profile) return null;
  const plan = effectivePlan(profile.preferences);
  const max = limitsOf(plan).aiPerDay;
  const today = utcDay();
  const used = events.filter((e) => e.kind === "ai" && e.day === today).length;
  return { plan: t(`d2.plan.${plan}.name` as MessageKey), ai: max === UNLIMITED ? String(used) : `${Math.min(used, max)}/${max}` };
}

/** The plan's two everyday limits, so a student sees what is left before hitting it. */
function PlanUsage({ listCount }: { listCount?: number }) {
  const t = useT();
  const { user, profile } = useCollege();
  const { setOpenMobile } = useSidebar();
  const { events } = useProgress(user?.id);
  const prefs = profile?.preferences;
  const plan = effectivePlan(prefs);
  const limits = limitsOf(plan);
  const today = utcDay();
  const aiUsed = events.filter((e) => e.kind === "ai" && e.day === today).length;
  const meters = [
    { key: "ai", label: t("d3.use.ai"), used: aiUsed, max: limits.aiPerDay },
    { key: "list", label: t("d3.use.list"), used: listCount ?? 0, max: limits.listSize },
  ];
  return (
    <div className="db-usage">
      <div className="db-usage-head">
        <strong>{t(`d2.plan.${plan}.name` as MessageKey)}</strong>
        {onEarlyAccess(prefs) && <small>{t("d2.pf.early")}</small>}
        {plan === "free" && (
          <Link className="db-usage-cta" href="/dashboard/plans" onClick={() => setOpenMobile(false)}>
            {t("d3.use.cta")}
          </Link>
        )}
      </div>
      {meters.map((m) => {
        const capped = m.max !== UNLIMITED;
        const pct = capped ? Math.min(100, (m.used / m.max) * 100) : 0;
        const full = capped && m.used >= m.max;
        return (
          <div key={m.key} className="db-usage-row">
            <span>{m.label}</span>
            <b className={full ? "is-full" : undefined}>{capped ? `${Math.min(m.used, m.max)}/${m.max}` : m.used}</b>
            {capped && (
              <i aria-hidden="true">
                <i style={{ width: pct + "%" }} />
              </i>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "Report a problem" in the interface language; the form itself is shared with Support. */
function ReportProblemItem() {
  const t = useT();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="db-report-icon" aria-label={t("d4.report.label")} title={t("d4.report.label")}>
          <MessageSquareWarning size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="workspace-report-dialog">
        <DialogHeader>
          <DialogTitle>{t("d4.report.title")}</DialogTitle>
          <DialogDescription>{t("d4.report.text")}</DialogDescription>
        </DialogHeader>
        <SupportForm issue />
      </DialogContent>
    </Dialog>
  );
}

function UserMenu({ displayName, listCount }: { displayName: string; listCount?: number }) {
  const t = useT();
  const { signOut, user, profile } = useCollege();
  const email = user?.email || "";
  const { setOpenMobile } = useSidebar();
  const usage = usePlanLine();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="db-user" tooltip={displayName}>
          <UserAvatar {...avatarOf(profile, user)} size={26} className="db-avatar" />
          <span className="db-user-name">
            <strong>{displayName}</strong>
            <small>{usage ? `${usage.plan} · AI ${usage.ai}` : email || t("dash.workspace")}</small>
          </span>
          <ChevronsUpDown size={15} aria-hidden="true" className="db-user-caret" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="db-user-menu">
        <div className="db-user-usage">
          <PlanUsage listCount={listCount} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile" onClick={() => setOpenMobile(false)}>
            <UserRound size={15} aria-hidden="true" /> {t("nav.my_profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings" onClick={() => setOpenMobile(false)}>
            <Settings2 size={15} aria-hidden="true" /> {t("db.settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/people" onClick={() => setOpenMobile(false)}>
            <Users size={15} aria-hidden="true" /> {t("dash.people")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/plans" onClick={() => setOpenMobile(false)}>
            <Crown size={15} aria-hidden="true" /> {t("d2.plans.title")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTimeout(openTour, 120)}>
          <CircleHelp size={15} aria-hidden="true" /> {t("tour.help")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTimeout(openCookieSettings, 120)}>
          <Cookie size={15} aria-hidden="true" /> {t("ck2.label")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut size={15} aria-hidden="true" /> {t("nav.sign_out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone navigation: the four everyday places plus the full menu. */
function BottomNav({
  isActive,
  onTab,
}: {
  isActive: (item: WorkspaceNavItem) => boolean;
  onTab: (next: OnePrepSection) => void;
}) {
  const t = useT();
  const { setOpenMobile } = useSidebar();
  const items = BOTTOM_NAV;
  return (
    <nav className="db-bottom" aria-label={t("nav.mobile")}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        const body = (
          <>
            <Icon size={21} strokeWidth={1.8} active={active} />
            <span>{t(NAV_KEY[item.label])}</span>
          </>
        );
        return "tab" in item ? (
          <button key={item.label} type="button" data-tour={item.tour} aria-current={active ? "page" : undefined} onClick={() => onTab(item.tab)}>
            {body}
          </button>
        ) : (
          <Link key={item.label} href={item.href} data-tour={item.tour} aria-current={active ? "page" : undefined}>
            {body}
          </Link>
        );
      })}
      <button type="button" onClick={() => setOpenMobile(true)}>
        <Menu size={20} strokeWidth={1.8} aria-hidden="true" />
        <span>{t("db.nav.more")}</span>
      </button>
    </nav>
  );
}

/** Tablet (768 to 1023px): the sidebar starts as an icon rail so the page keeps its width. */
function TabletRail() {
  const { setOpen } = useSidebar();
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    if (!wide.matches && window.innerWidth >= 768) setOpen(false);
    const change = (e: MediaQueryListEvent) => window.innerWidth >= 768 && setOpen(e.matches);
    wide.addEventListener("change", change);
    return () => wide.removeEventListener("change", change);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Logo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link className="db-logo" href={href} aria-label="CollegeStat">
      <svg className="db-logo-mark" viewBox="400 270 992 403" aria-hidden="true">
        <image href="/brand/cstat.png" width="1774" height="887" />
      </svg>
      <span className="db-logo-word">
        CollegeStat<span className="db-logo-dot">.</span>
      </span>
    </Link>
  );
}

export function OnePrepShell({
  tab,
  onTab,
  counts,
  status,
  displayName,
  children,
}: {
  tab: OnePrepSection;
  onTab: (next: OnePrepSection) => void;
  counts: Partial<Record<OnePrepSection, number>>;
  status?: string;
  displayName: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const pathname = usePathname() || "/dashboard";
  const onRoot = pathname === "/dashboard" || pathname === "/dashboard/" || pathname === "/dashboard/prepare";
  const isActive = (item: WorkspaceNavItem) =>
    "tab" in item
      ? onRoot && tab === item.tab
      : item.matches
        ? item.matches(pathname)
        : pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <SidebarProvider className="db" style={{ "--sidebar-width": "14rem" } as React.CSSProperties}>
      <a href="#oneprep-main" className="db-skip">
        {t("nav.skip")}
      </a>
      <TabletRail />
      <Sidebar collapsible="icon" className="db-side">
        <SidebarHeader className="db-side-head">
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <NavItems items={PRIMARY_NAV} isActive={isActive} onTab={onTab} counts={counts} />
            </SidebarGroupContent>
          </SidebarGroup>
          {/* No word headings: each group is set apart by a thin line, always open. */}
          {GROUPS.map((group) => (
            <SidebarGroup key={group.key} className="db-group" aria-label={t(group.key)}>
              <SidebarGroupContent>
                <NavItems items={group.items} isActive={isActive} onTab={onTab} counts={counts} />
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="db-side-foot">
          <SidebarMenu>
            <SidebarMenuItem className="db-foot-row">
              <UserMenu displayName={displayName} listCount={counts.Universities} />
              <span className="db-report">
                <ReportProblemItem />
              </span>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <div className="db-main">
        <header className="db-top">
          <SidebarTrigger className="db-icon-btn db-trigger" aria-label={t("db.nav.toggle")} />
          <span className="db-top-title" aria-live="polite">
            {t(titleKey(pathname, tab))}
          </span>
          {status && (
            <span className="db-top-status" role="status">
              {status}
            </span>
          )}
          <button
            type="button"
            className="db-search"
            onClick={() => window.dispatchEvent(new Event("college-search"))}
            aria-label={t("nav.search.label")}
          >
            <Search size={14} aria-hidden="true" />
            <span>{t("db.search")}</span>
            <kbd className="dk-kbd">⌘K</kbd>
          </button>
          <div className="db-top-tools">
            <button type="button" className="db-help" onClick={openTour} aria-label={t("tour.help")} title={t("tour.help")}>
              <CircleHelp size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <LanguageSwitcher compact />
            <AppearanceButton />
          </div>
        </header>
        <div className="db-content" id="oneprep-main" tabIndex={-1}>
          {children}
        </div>
      </div>
      <FirstRunGuide />
      <BottomNav isActive={isActive} onTab={onTab} />
    </SidebarProvider>
  );
}

/** Signed-out view: the same frame, with only public places to go. */
export function OnePrepGateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="db db-gate">
      <header className="db-top db-gate-top">
        <Logo href="/" />
        <div className="db-top-tools">
          <LanguageSwitcher compact />
          <AppearanceButton />
        </div>
      </header>
      <div className="db-content" id="oneprep-main" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
