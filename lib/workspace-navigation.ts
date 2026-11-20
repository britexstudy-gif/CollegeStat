/** Only these discovery destinations belong to the signed-in workspace.
 * External sources, authentication and staff routes keep their original URLs.
 */
export function workspaceHref(href: string, context: string | boolean): string {
  const inWorkspace =
    context === true ||
    (typeof context === "string" && /^\/dashboard(?:\/|$)/.test(context));
  if (!inWorkspace || !href.startsWith("/") || href.startsWith("//"))
    return href;
  const split = href.search(/[?#]/);
  const path = split < 0 ? href : href.slice(0, split);
  const suffix = split < 0 ? "" : href.slice(split);
  const routes: [RegExp, string][] = [
    [/^\/universities$/, "/dashboard/universities"],
    [/^\/university(?=\/|$)/, "/dashboard/university"],
    [/^\/rankings$/, "/dashboard/rankings"],
    [/^\/compare$/, "/dashboard/compare"],
    [/^\/research$/, "/dashboard/assistant"],
    [/^\/profile$/, "/dashboard/profile"],
    [/^\/resources(?=\/|$)/, "/dashboard/library/resources"],
    [/^\/articles(?=\/|$)/, "/dashboard/library/articles"],
    [/^\/scholarships$/, "/dashboard/library/scholarships"],
    [/^\/scholarships(?=\/)/, "/dashboard/library/scholarship"],
    [/^\/scholarship(?=\/|$)/, "/dashboard/library/scholarship"],
  ];
  for (const [pattern, replacement] of routes) {
    if (pattern.test(path)) return path.replace(pattern, replacement) + suffix;
  }
  return href;
}

export type WorkspaceDestination =
  "Home" | "Universities" | "Library" | "Prepare" | "Profile";

export function workspaceDestination(
  pathname: string,
  section: string,
): WorkspaceDestination {
  if (pathname === "/dashboard/profile") return "Profile";
  if (pathname === "/dashboard/assistant") return "Library";
  if (/^\/dashboard\/library(?:\/|$)/.test(pathname)) return "Library";
  if (
    /^\/dashboard\/(?:universities|university|rankings|compare|research)(?:\/|$)/.test(
      pathname,
    )
  )
    return "Universities";
  if (section === "Checklist") return "Home";
  if (["Writing", "Guide"].includes(section)) return "Library";
  if (section === "Practice") return "Prepare";
  if (["Universities", "Comparisons"].includes(section)) return "Universities";
  if (["Scholarships", "Searches", "History", "Lists"].includes(section))
    return "Library";
  return "Home";
}

export function workspaceSectionHref(section: string, track?: string): string {
  if (section === "Overview") return "/dashboard";
  const params = new URLSearchParams({ section });
  if (track) params.set("track", track);
  const base = ["Practice", "Writing", "Guide"].includes(section)
    ? "/dashboard/prepare"
    : "/dashboard";
  return base + "?" + params;
}

/** Update one profile tab without discarding filters, comparison context or hash. */
export function profileTabHref(
  pathname: string,
  query: string,
  tab: string,
  hash = "",
): string {
  const params = new URLSearchParams(query);
  params.set("tab", tab);
  params.delete("view");
  return pathname + "?" + params + hash;
}
