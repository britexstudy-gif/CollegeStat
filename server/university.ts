import redirects from "@/data/published/identity-redirects.json";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "./public-config";
import { universitySelect } from "@/lib/supabase/catalogue";
import { normalizeUniversity, University } from "@/lib/domain";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import { withAutoLogo } from "./auto-logos";
import videoIndex from "@/data/published/university-videos-oct18.json";
import briefs from "@/data/published/application-briefs.json";
import historyIndex from "@/data/published/university-history-oct20.json";
import commonApp from "@/data/published/common-app-members.json";
import commonDataSet from "@/data/published/common-data-set.json";
import { canonicalComparisonIDs } from "@/lib/comparison";
import { publicReadCache } from "./public-read-cache";
import { assetRecord } from "./asset-data";
import { universityEnrichment } from "@/lib/university-enrichment";
import { warmProfileMore } from "./profile-more";

// Published, anonymous profile rows only (same data every visitor sees). One
// hosted profile query takes ~1-2 s; repeat views within five minutes reuse it.
const profileCache = publicReadCache<University | null>(24, 5 * 60000);
const pageProfileCache = publicReadCache<University | null>(24, 5 * 60000);
/** The profile page ships a "lite" record: research_metrics (about a third of a
 * large profile's payload) are deferred to the client (lib/profile-defer.ts),
 * so the server render does not download them. */
const pageSelect = universitySelect.replace("research_metrics(*),", "");
const PROFILE_READ_TIMEOUT_MS = 15000;
export async function publicUniversities(ids: string[]) {
  const selected = canonicalComparisonIDs(ids);
  if (!selected.length) return [];
  if (!usesHostedCatalogue()) {
    const { universitiesByIds } = await import("./catalogue-store");
    const rows = await universitiesByIds(selected);
    return (await Promise.all(rows.map(withReviewedMedia))).map(withAutoLogo);
  }
  const config = publicConfig();
  if (!config.url || !config.anon)
    throw new Error("Public catalogue is not connected");
  const db = createClient(config.url, config.anon, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from("universities")
    .select(universitySelect)
    .eq("published", true)
    .in("id", selected)
    .abortSignal(AbortSignal.timeout(PROFILE_READ_TIMEOUT_MS));
  if (error) throw new Error("Public comparison unavailable");
  const rows = (data as unknown as University[]).map(normalizeUniversity);
  // Compare renders logos for these rows; resolve them so the icon map stays server-side.
  const ordered = selected.flatMap((id) => rows.filter((u) => u.id === id));
  return (await Promise.all(ordered.map(withReviewedMedia))).map(withAutoLogo);
}
// Request-scoped memoization shares one public RLS query between SEO and the page.
export const publicUniversity = cache(async (slug: string) => {
  const university = await loadPublicUniversity(slug);
  // The page reads the profile's facts shard next (profileMore); start it now.
  if (university) warmProfileMore(university.id);
  return university && (await withReviewedMedia(university));
});

/** Same as publicUniversity without research_metrics: for the profile page,
 * its metadata and layout, which never read them (the deferred view loads the
 * full record from /api/catalog). Cold render ~0.5 s faster on large profiles. */
export const publicUniversityForPage = cache(async (slug: string) => {
  const university = await loadPublicUniversity(slug, true);
  if (university) warmProfileMore(university.id);
  return university && (await withReviewedMedia(university));
});

/** Reviewed official videos and admissions briefs live in published files and
 * are attached server-side, so the indexes never ship to the browser. The two
 * large US datasets are read one record at a time (server/asset-data.ts). */
export async function withReviewedMedia(university: University): Promise<University> {
  const videos = (
    videoIndex.records as Record<string, University["official_videos"]>
  )[university.id];
  const brief = university.application_brief
    ? null
    : (briefs as Record<string, University["application_brief"]>)[
        university.id
      ];
  const history = (historyIndex.records as Record<string, University["history"]>)[university.id];
  const [us, facts, current] = await Promise.all([
    assetRecord<University["us_stats"]>("published/ipeds-us-stats-2023.json", university.id),
    assetRecord<University["scorecard"]>("published/college-scorecard.json", university.id),
    university.country_code === "US" ? assetRecord<University["us_current"]>("review/scorecard-2026-11.json", university.id) : undefined,
  ]);
  const member = commonApp.records[university.id];
  const cds = commonDataSet.records[university.id];
  // The profile's Established row prefers this reviewed year; Compare reads it too.
  const identity = universityEnrichment(university)?.identity;
  return {
    ...university,
    ...(identity ? { reviewed_identity: { founded_year: identity.founded_year } } : {}),
    ...(us ? { us_stats: us } : {}),
    ...(facts ? { scorecard: facts } : {}),
    ...(current ? { us_current: current } : {}),
    ...(member ? { common_app: member } : {}),
    ...(cds ? { cds } : {}),
    ...(videos?.length ? { official_videos: videos } : {}),
    ...(history ? { history } : {}),
    ...(brief ? { application_brief: brief } : {}),
  };
}

async function loadPublicUniversity(slug: string, forPage = false) {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return undefined;
  slug =
    Object.values(redirects).find((r) => r.old_slug === slug)?.slug || slug;
  const config = publicConfig();
  if (!usesHostedCatalogue()) {
    const { universityBySlug } = await import("./catalogue-store");
    return universityBySlug(slug);
  }
  if (!config.url || !config.anon)
    throw new Error("Public catalogue is not connected");
  const row = await (forPage ? pageProfileCache : profileCache)(config.url + ":" + slug, async () => {
    const db = createClient(config.url, config.anon, {
      auth: { persistSession: false },
    });
    const { data, error } = await db
      .from("universities")
      .select(forPage ? pageSelect : universitySelect)
      .eq("published", true)
      .eq("slug", slug)
      .abortSignal(AbortSignal.timeout(PROFILE_READ_TIMEOUT_MS))
      .maybeSingle();
    if (error) throw new Error("Public university unavailable");
    return data ? normalizeUniversity(data as unknown as University) : null;
  });
  return row ?? undefined;
}
