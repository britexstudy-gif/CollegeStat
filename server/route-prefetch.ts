import { readFilters } from "@/lib/research";
import { hostedExplore } from "./hosted-catalogue";
import { publicUniversityForPage } from "./university";

/** Start a public page's own hosted reads while the root layout still waits on
 * the shared catalogue. Without this, React renders the page (and so issues its
 * Supabase queries) only after every layout above it has resolved, so a cold
 * render paid the layout's wait and then the page's round trips in series.
 *
 * Both reads are shared with the page: publicUniversityForPage is request-memoized
 * (React cache) and hostedExplore goes through the in-isolate read cache with
 * the same normalized key. Errors are left for the page to handle. */
export function prefetchRouteData(pathname: string, search: string) {
  if (process.env.NEXT_PUBLIC_CATALOGUE_SOURCE !== "supabase") return;
  const profile = /^\/university\/([a-z0-9-]{1,160})$/.exec(pathname);
  if (profile) {
    void publicUniversityForPage(profile[1]).catch(() => {});
    return;
  }
  if (pathname === "/universities") {
    const query = new URLSearchParams(search);
    // That request only redirects (app/universities/page.tsx).
    if (query.get("interpret") === "1") return;
    void hostedExplore(readFilters(query)).catch(() => {});
  }
}
