"use client";
import { useEffect, useState } from "react";
import { ConsentBar } from "./consent-bar";
import { openCookieSettings } from "@/lib/consent";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Bookmark,
  ArrowRight,
  ArrowUpRight,
  Scale,
  X,
  Plus,
  Home,
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  Globe2,
  User,
  LogOut,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { useCollege } from "./provider";
import { Brand, UniversityLogo } from "./primitives";
import { useLiquidGlass } from "./use-liquid-glass";
import { isStaffPath } from "@/lib/staff-route";
import { AppearanceButton } from "./appearance-button";

import { SearchCommand } from "./search-command";
import { FooterWordmark } from "./footer-wordmark";
import { workspaceHref } from "@/lib/workspace-navigation";
import { LanguageSwitcher, useT } from "./i18n";
import { UserAvatar, avatarOf } from "./user-avatar";
function Navbar() {
  const glass = useLiquidGlass<HTMLElement>();
  const s = useCollege(),
    path = usePathname(),
    params = useSearchParams();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useT();
  const links = [
    [t("nav.universities"), "/universities"],
    [t("nav.rankings"), "/rankings"],
    [t("nav.scholarships"), "/scholarships"],
    [t("nav.support"), "/support"],
    [t("nav.articles"), "/articles"],
  ];
  const active = (url: string) =>
    path === url ||
    (url === "/articles" && path?.startsWith("/articles/")) ||
    (url === "/universities" && path?.startsWith("/university/"));
  useEffect(() => setMobileOpen(false), [path]);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <header
      ref={glass}
      data-glass="rim"
      className={
        "site-navigation navigation-restored-oct09 " + (scrolled ? "scrolled" : "")
      }
    >
      <Brand />
      <nav className="navbar-primary-links" aria-label={t("nav.main")}>
        {links.map(([name, url]) => (
          <Link
            key={url}
            href={url}
            className={active(url) ? "active" : ""}
            aria-current={active(url) ? "page" : undefined}
          >
            {name}
          </Link>
        ))}

      </nav>
      <div className="navbar-actions">
        <span className="navbar-language">
          <LanguageSwitcher compact />
        </span>
        <span className="navbar-appearance">
          <AppearanceButton />
        </span>
        <button
          className="nav-search"
          aria-label={t("nav.search.label")}
          onClick={() => window.dispatchEvent(new Event("college-search"))}
        >
          <Search size={18} />
          <span>{t("nav.search")}</span>
        </button>
        {s.user ? (
          <>
            <Link
              href="/dashboard"
              className="nav-dashboard"
              aria-label={t("nav.dashboard")}
              aria-current={path === "/dashboard" ? "page" : undefined}
            >
              <LayoutDashboard size={16} />
              <span>{t("nav.dashboard")}</span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="avatar nav-profile-avatar"
                  aria-label="Open profile menu"
                >
                  <UserAvatar {...avatarOf(s.profile, s.user)} size={36} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="liquid-glass">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    {t("nav.my_dashboard")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User />
                    {t("nav.my_profile")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={s.signOut}>
                  <LogOut />
                  {t("nav.sign_out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : s.authReady ? (
          <Link
            className="sign-in-button"
            href={
              "/auth/sign-in?next=" +
              encodeURIComponent(
                (path || "/") +
                  (params.toString() ? "?" + params.toString() : ""),
              )
            }
          >
            {t("nav.sign_in")}
            <ArrowUpRight size={15} />
          </Link>
        ) : (
          <span className="nav-auth-loading" aria-label="Restoring account" />
        )}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="navbar-mobile-trigger"
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>
          </SheetTrigger>
          <SheetContent className="navbar-mobile-sheet" side="right">
            <SheetHeader>
              <SheetTitle>CollegeStat</SheetTitle>
              <SheetDescription>{t("nav.tagline")}</SheetDescription>
            </SheetHeader>
            <nav aria-label="All navigation" className="navbar-mobile-links">
              {[
                ...links,
                [t("nav.sources"), "/sources"],
                ...(s.user
                  ? [
                      [t("nav.my_dashboard"), "/dashboard"],
                      [t("nav.my_profile"), "/profile"],
                    ]
                  : []),
              ].map(([name, href]) => (
                <SheetClose asChild key={href}>
                  <Link
                    href={href}
                    aria-current={active(href) ? "page" : undefined}
                  >
                    <span>{name}</span>
                    <ArrowUpRight size={17} />
                  </Link>
                </SheetClose>
              ))}
            </nav>
            <div className="navbar-mobile-appearance">
              <span>{t("lang.label")}</span>
              <LanguageSwitcher />
            </div>
            <div className="navbar-mobile-appearance">
              <span>{t("nav.appearance")}</span>
              <AppearanceButton />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
function CompareTray() {
  const s = useCollege(),
    path = usePathname();
  const list = s.compare
    .map((id) => s.universities.find((u) => u.id === id))
    .filter(Boolean);
  if (
    !list.length ||
    path === "/compare" ||
    isStaffPath(path) ||
    path?.startsWith("/auth/")
  )
    return null;
  return (
    <div className="compare-tray liquid-glass">
      <div className="tray-label">
        <Scale size={17} />
        <span>Your shortlist</span>
      </div>
      <div className="tray-universities">
        {list.map((u) => (
          <div key={u!.id}>
            <UniversityLogo university={u!} size="sm" />
            <span>
              {u!.short_name === "S" ? "Stanford" : u!.short_name || u!.name}
            </span>
            <button
              aria-label={"Remove " + u!.name + " from comparison"}
              onClick={() => s.toggleCompare(u!.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {list.length < 5 && (
        <Link
          href="/universities"
          className="tray-add"
          aria-label="Add another university"
        >
          <Plus size={16} />
        </Link>
      )}
      <span className="tray-count">{list.length}/5</span>
      <Link href="/compare" className="button button-primary">
        Compare
        <ArrowRight size={15} />
      </Link>
      <button
        className="icon-button tray-clear"
        aria-label="Clear comparison"
        onClick={() => s.setCompare([])}
      >
        <X size={17} />
      </button>
    </div>
  );
}
function Footer({ expressive = false }: { expressive?: boolean }) {
  const s = useCollege();
  const t = useT();
  return (
    <footer className={"footer" + (expressive ? "" : " footer-utility")}>
      <div className="footer-main">
        <div className="footer-brand-block">
          <Brand />
          <p>
            {t("foot.tagline.a")}
            <br />
            {t("foot.tagline.b")}
          </p>
          <div className="footer-language">
            <LanguageSwitcher align="start" />
          </div>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <div className="footer-link-group">
            <h2>{t("foot.explore")}</h2>
            <Link href="/universities">{t("nav.universities")}</Link>
            <Link href="/rankings">{t("nav.rankings")}</Link>
            <Link href="/compare">{t("nav.compare")}</Link>
            <Link href="/scholarships">{t("nav.scholarships")}</Link>
          </div>
          <div className="footer-link-group">
            <h2>{t("foot.workspace")}</h2>
            <Link href="/dashboard">{t("nav.dashboard")}</Link>
            <Link href="/articles">{t("foot.articles")}</Link>
            {s.user ? (
              <Link href="/profile">{t("dock.profile")}</Link>
            ) : (
              <button onClick={s.openAuth}>{t("nav.sign_in")}</button>
            )}
          </div>
          <div className="footer-link-group">
            <h2>{t("foot.about")}</h2>
            <Link href="/sources">{t("foot.sources")}</Link>
            <Link href="/methodology">{t("foot.methodology")}</Link>
            <Link href="/support">{t("foot.support")}</Link>
          </div>
        </nav>
      </div>
      {expressive && <FooterWordmark />}
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} CollegeStat</span>
        <span>{t("foot.independent")}</span>
        <span>
          <Link href="/privacy">{t("foot.privacy")}</Link> ·{" "}
          <Link href="/terms">{t("foot.terms")}</Link> ·{" "}
          <button type="button" className="footer-cookie-link" onClick={openCookieSettings}>
            {t("ck2.label")}
          </button>
        </span>
      </div>
    </footer>
  );
}
export function SiteShell({ children }: { children: React.ReactNode }) {
  const dockGlass = useLiquidGlass<HTMLElement>();
  const router = useRouter();
  const path = usePathname(),
    s = useCollege();
  const t = useT();
  const admin = isStaffPath(path);
  const workspace =
    path === "/dashboard" ||
    path?.startsWith("/dashboard/") ||
    path === "/saved" ||
    // The dev-only dashboard preview (app/zz-d2) renders like the real workspace.
    path === "/zz-d2";
  const auth =
    path?.startsWith("/auth/") || ["/login", "/signup"].includes(path || "");
  useEffect(() => {
    if (!s.authReady || !s.user || !path || workspace || admin || auth) return;
    const current = path + window.location.search + window.location.hash;
    const destination = workspaceHref(current, true);
    if (destination !== current) router.replace(destination);
  }, [s.authReady, s.user, path, workspace, admin, auth, router]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    // Move keyboard focus to the main content on route change so screen
    // reader and keyboard users land on the new page content.
    document.getElementById("main")?.focus({ preventScroll: true });
    if (!path?.startsWith("/auth/")) {
      try {
        sessionStorage.setItem(
          "collegestat:return-to",
          path + window.location.search,
        );
      } catch {}
    }
  }, [path]);
  return (
    <>
      <Toaster position="bottom-right" />
      <a href="#main" className="skip-link">
        {t("nav.skip")}
      </a>
      {!admin && !auth && !workspace && <Navbar />}
      <main
        id="main"
        tabIndex={-1}
        className={
          admin
            ? "admin-route"
            : auth
              ? "auth-page"
              : workspace
                ? "workspace-route"
                : "site-main"
        }
      >
        {s.error && !admin && (
          <div className="error-banner">
            {s.error}
            <button onClick={s.refresh}>Try again</button>
          </div>
        )}
        {children}
      </main>
      {!admin && !auth && !workspace && (
        <>
          <Footer expressive={path === "/"} />
          <nav
            ref={dockGlass}
            className="site-dock"
            data-glass="rim"
            aria-label={t("nav.mobile")}
          >
            {(
              [
                [Home, t("dock.home"), "/"],
                [Globe2, t("dock.explore"), "/universities"],
                [GraduationCap, t("dock.funding"), "/scholarships"],
                ...(s.user
                  ? ([
                      [Bookmark, t("dock.saved"), "/saved"],
                      [User, t("dock.profile"), "/profile"],
                    ] as const)
                  : ([[BookOpen, t("nav.articles"), "/articles"]] as const)),
              ] as const
            ).map(([Icon, name, url]) => (
              <Link
                key={url}
                href={url}
                className={path === url ? "active" : ""}
                aria-current={path === url ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{name}</span>
              </Link>
            ))}
          </nav>
          <CompareTray />
        </>
      )}
      {!admin && <ConsentBar />}
      <SearchCommand key={s.user?.id || "anonymous"} />
    </>
  );
}
