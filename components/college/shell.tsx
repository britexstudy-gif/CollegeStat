/* eslint-disable @next/next/no-img-element -- Small account avatars use the supplied URL without an image proxy. */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  Moon,
  Sun,
  LogOut,
  SlidersHorizontal,
} from "lucide-react";
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
import { STAFF_PATH, isStaffPath } from "@/lib/staff-route";
import { SearchCommand } from "./search-command";
export function Navbar() {
  const glass = useLiquidGlass<HTMLElement>();
  const s = useCollege(),
    path = usePathname(),
    params = useSearchParams();
  const [dark, setDark] = useState(false),
    [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let pref = false;
    try {
      const saved = localStorage.getItem("collegestat-theme");
      if (s.user && saved) pref = saved === "dark";
    } catch {}
    setDark(pref);
    document.documentElement.classList.toggle("dark", pref);
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, [s.user]);
  const theme = () => {
    const v = !dark;
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    try {
      localStorage.setItem("collegestat-theme", v ? "dark" : "light");
    } catch {}
  };
  return (
    <header
      ref={glass}
      data-glass="rim"
      className={"site-navigation " + (scrolled ? "scrolled" : "")}
    >
      <Brand />
      <nav aria-label="Main navigation">
        {[
          ["Universities", "/universities"],
          ["Rankings", "/rankings"],
          ["Compare", "/compare"],
          ["Scholarships", "/scholarships"],
          ["Support", "/support"],
          ["Resources", "/resources"],
        ].map(([name, url]) => (
          <Link
            key={url}
            href={url}
            className={path === url ? "active" : ""}
            aria-current={path === url ? "page" : undefined}
          >
            {name}
          </Link>
        ))}
      </nav>
      <div className="navbar-actions">
        {s.profile?.role === "admin" && (
          <Link
            className="staff-entry"
            href={STAFF_PATH}
            aria-label="Open admin workspace"
          >
            <SlidersHorizontal size={16} />
            <span>Admin</span>
          </Link>
        )}
        <button
          className="nav-search"
          aria-label="Search CollegeStat"
          onClick={() => window.dispatchEvent(new Event("college-search"))}
        >
          <Search size={18} />
          <span>Search</span>
        </button>
        {s.user ? (
          <>
            <Link
              href="/dashboard"
              className="nav-dashboard"
              aria-current={path === "/dashboard" ? "page" : undefined}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="avatar nav-profile-avatar"
                  aria-label="Open profile menu"
                >
                  <AccountAvatar
                    url={s.profile?.avatar_url}
                    label={(s.profile?.display_name ||
                      s.user.email ||
                      "U")[0].toUpperCase()}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="liquid-glass">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    My dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User />
                    My profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={theme}>
                  {dark ? <Sun /> : <Moon />}
                  {dark ? "Light appearance" : "Dark appearance"}
                </DropdownMenuItem>
                {s.profile?.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link href={STAFF_PATH}>
                      <SlidersHorizontal />
                      Admin workspace
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={s.signOut}>
                  <LogOut />
                  Sign out
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
            Sign in
            <ArrowUpRight size={15} />
          </Link>
        ) : (
          <span className="nav-auth-loading" aria-label="Restoring account" />
        )}
      </div>
    </header>
  );
}
function AccountAvatar({ url, label }: { url?: string | null; label: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const safe = !!url && (/^https:\/\//.test(url) || /^\/(?!\/)/.test(url));
  return safe && !failed ? (
    <img
      src={url!}
      alt=""
      width={36}
      height={36}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span>{label}</span>
  );
}
export function CompareTray() {
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
function Footer() {
  const s = useCollege();
  return (
    <footer className="footer">
      <div className="footer-main">
        <div>
          <Brand />
          <p>An atlas for better university decisions.</p>
        </div>
        <div className="footer-links">
          <Link href="/universities">Universities</Link>
          <Link href="/rankings">Rankings</Link>
          <Link href="/compare">Compare</Link>
          <Link href="/scholarships">Scholarships</Link>
          <Link href="/resources">Resources</Link>
          <Link href="/support">Support CollegeStat</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/sources">Sources</Link>
          {s.user ? (
            <Link href="/profile">Profile</Link>
          ) : (
            <button onClick={s.openAuth}>Sign in</button>
          )}
          {s.profile?.role === "admin" && (
            <Link href={STAFF_PATH}>Staff console</Link>
          )}
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} CollegeStat</span>
        <span>Independent university research.</span>
        <span>
          <Link href="/privacy">Privacy</Link> ·{" "}
          <Link href="/terms">Terms</Link> ·{" "}
          <Link href="/methodology">Methodology</Link>
        </span>
      </div>
    </footer>
  );
}
export function SiteShell({ children }: { children: React.ReactNode }) {
  const dockGlass = useLiquidGlass<HTMLElement>();
  const path = usePathname(),
    s = useCollege();
  const admin = isStaffPath(path);
  const auth =
    path?.startsWith("/auth/") || ["/login", "/signup"].includes(path || "");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
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
        Skip to content
      </a>
      {!admin && !auth && <Navbar />}
      <main
        id="main"
        className={admin ? "admin-route" : auth ? "auth-page" : "site-main"}
      >
        {s.error && !admin && (
          <div className="error-banner">
            {s.error}
            <button onClick={s.refresh}>Try again</button>
          </div>
        )}
        {children}
      </main>
      {!admin && !auth && (
        <>
          <Footer />
          <nav
            ref={dockGlass}
            className="site-dock"
            data-glass="rim"
            aria-label="Mobile navigation"
          >
            {(
              [
                [Home, "Home", "/"],
                [Globe2, "Explore", "/universities"],
                [Scale, "Compare", "/compare"],
                [GraduationCap, "Funding", "/scholarships"],
                ...(s.user
                  ? ([
                      [Bookmark, "Saved", "/saved"],
                      [User, "Profile", "/profile"],
                    ] as const)
                  : ([[BookOpen, "Resources", "/resources"]] as const)),
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
      <SearchCommand />
    </>
  );
}
