"use client";
import { recordRecent } from "@/lib/consent";
import { DataGaps } from "@/components/college/data-gaps";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { EmptyState } from "@/components/college/primitives";
import { useCollege } from "@/components/college/provider";
import { useT } from "@/components/college/i18n";
import { rememberUniversity } from "@/components/college/recent-exploration";
import { UniversityQuickStart } from "@/components/college/university-quickstart";
import { useChanceProfile } from "@/components/college/admission-chip";
import { SectionNav, UniversityHeader } from "@/components/college/university-profile-header";
import { EssentialsCheck } from "@/components/college/essentials-check";
import {
  ApplyBody, CheckedLine, CostsBody, FaqBody, applyChecked, costsChecked, GuidesBody, SourcesLine, OutcomesBody, OverviewBody, ProfileCard, RankingsBody, ScholarshipsBody, outcomesData,
} from "@/components/college/university-profile-sections";
import { profileSections, universityView } from "@/lib/university-view";
import { studentScores } from "@/lib/my-colleges";
import { readPersonalization } from "@/lib/personalize-ai";
import { UniversityMedia, hasMedia } from "@/components/college/university-media";
import { displayName } from "@/lib/university-display-name";
import { countryName, type University } from "@/lib/domain";
import { publicRequest, universityBySlug } from "@/lib/supabase/catalogue";
import { mergeHeavyProfile, type HeavyProfile } from "@/lib/profile-defer";
import { recordProviderView } from "@/services/provider-account";
import { legacyTabSection, type SectionId } from "@/lib/university-profile-data";
import type { ProfileExtras } from "@/server/profile-extras";
import "@/components/college/university-profile.css";

const ProgramLibrary = dynamic(() => import("@/components/college/program-library").then((m) => m.ProgramLibrary), {
  loading: () => <p className="up-note" role="status">…</p>,
});
const hasOutcomes = (u: University) => {
  const o = outcomesData(u);
  return !!(o.tiles.length || o.earnings.length || o.snapshot.length || o.split);
};
const noExtras: ProfileExtras = { programmes: [] };

export default function UniversityPage({
  slug,
  initialUniversity,
  extras = noExtras,
  viewer,
}: {
  slug: string;
  initialUniversity?: University;
  extras?: ProfileExtras;
  /** Screenshot harness only (app/zz-u2): a signed-in student without an account. */
  viewer?: { prefs: unknown };
}) {
  const s = useCollege();
  const t = useT();
  const pathname = usePathname();
  const params = useSearchParams();
  const [u, setU] = useState<University | undefined>(initialUniversity || s.universities.find((x) => x.slug === slug));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const owner = s.user?.id || null;
  // Recently viewed (only recorded when the student allowed personalization).
  useEffect(() => recordRecent(slug), [slug]);
  const generation = useSyncExternalStore(
    useCallback((listener) => s.accountScope.subscribe(listener), [s.accountScope]),
    () => s.accountScope.capture().generation,
    () => 0,
  );
  useEffect(() => {
    if (initialUniversity?.slug === slug) {
      // A re-render of the route sends the same lite record; keep the lists
      // already merged instead of downloading them again.
      setU((current) =>
        initialUniversity.deferred && current?.id === initialUniversity.id && !current.deferred ? current : initialUniversity,
      );
      setError("");
      setLoading(false);
      return;
    }
    let live = true;
    universityBySlug(slug)
      .then((row) => {
        if (live) {
          setU(row);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setError(t("up.error"));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [slug, initialUniversity, t]);
  // Keyed on the id: merging the deferred lists replaces the record and is not a second visit.
  const universityId = u?.id;
  useEffect(() => {
    if (universityId) rememberUniversity(universityId);
    const token = { owner, generation };
    if (!universityId || !owner || !s.accountScope.isCurrent(token)) return;
    void recordProviderView(s.accountScope, universityId, token).catch(() => {
      if (s.accountScope.isCurrent(token)) toast.error(t("up.history.error"), { id: "research-history" });
    });
  }, [universityId, owner, generation, s.accountScope, t]);

  // The programme list ships separately (lib/profile-defer.ts) and loads when its section nears the viewport.
  const deferredCount = u?.deferred ? u.deferred.official_programmes + u.deferred.current_programmes : 0;
  const [near, setNear] = useState(false);
  const [heavyFailed, setHeavyFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const needHeavy = !!u?.deferred && deferredCount > 0;
  useEffect(() => {
    if (!needHeavy) return;
    const node = document.getElementById("up-programmes");
    if (!node || typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "900px 0px" });
    io.observe(node);
    // Also load once the page has settled, so a jump, a fast scroll or a printed page never waits on the observer.
    const timer = window.setTimeout(() => setNear(true), 2000);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [needHeavy]);
  const deferredSlug = needHeavy && near ? u!.slug : null;
  useEffect(() => {
    if (!deferredSlug) return;
    const controller = new AbortController();
    publicRequest<HeavyProfile>("slug=" + encodeURIComponent(deferredSlug) + "&part=heavy", controller.signal)
      .then((heavy) =>
        setU((current) => (current?.deferred && current.slug === deferredSlug ? mergeHeavyProfile(current, heavy) : current)),
      )
      .catch(() => {
        if (!controller.signal.aborted) setHeavyFailed(true);
      });
    return () => controller.abort();
  }, [deferredSlug, attempt]);

  // One view-model drives every block: signed-in state and missing data are decided there, not in the markup.
  const profile = useChanceProfile();
  const signedIn = !!s.user || !!viewer;
  const prefs = viewer ? viewer.prefs : s.user ? s.profile?.preferences : undefined;
  const model = useMemo(() => {
    if (!u) return null;
    const view = universityView(u, extras, { signedIn, profile, scores: studentScores(prefs), report: readPersonalization(prefs) });
    const programmes = (u.reported_programs?.length || 0) + (u.deferred ? deferredCount : 0) + extras.programmes.length;
    const listed = u.deferred ? programmes : programmes + u.university_programs.length;
    const sections = profileSections(u, view, extras, { programmes: listed > 0, media: hasMedia(u), outcomes: hasOutcomes(u) });
    return { view, sections };
  }, [u, extras, deferredCount, signedIn, profile, prefs]);

  // Old ?tab= links and #hash links land on their section.
  const legacy = params.get("tab");
  const target = useMemo<SectionId | null>(() => {
    const hash = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return (legacyTabSection[legacy || ""] ?? (hash as SectionId)) || null;
  }, [legacy]);
  const ready = !!model;
  useEffect(() => {
    if (!ready || !target) return;
    const node = document.getElementById("up-" + target);
    if (node && target !== "overview") requestAnimationFrame(() => node.scrollIntoView({ block: "start" }));
  }, [ready, target]);

  if (!u || !model)
    return (
      <EmptyState
        title={loading ? t("up.loading") : error || t("up.notfound")}
        description={t("up.notfound.text")}
        action={<Link href="/universities" className="button button-primary">{t("up.open.explorer")}</Link>}
      />
    );
  const name = displayName(u.name);
  const { sections, view } = model;
  const dashboard = pathname.startsWith("/dashboard");
  const card = (id: SectionId) => {
    switch (id) {
      case "costs":
        return (
          <ProfileCard key={id} id="costs" title={t("up.nav.costs")}>
            <CostsBody university={u} model={view.costs} extras={extras} />
            <CheckedLine date={costsChecked(u)} />
          </ProfileCard>
        );
      case "programmes":
        return (
          <ProfileCard key={id} id="programmes" title={t("up.nav.programmes")}>
            {u.deferred && deferredCount > 0 ? (
              heavyFailed ? (
                <p className="up-note" role="status">
                  {t("up.prog.failed")}{" "}
                  <button type="button" className="up-linkbtn" onClick={() => { setHeavyFailed(false); setAttempt((n) => n + 1); }}>{t("up.retry")}</button>
                </p>
              ) : (
                <p className="up-note" role="status">{t("up.prog.loading")}</p>
              )
            ) : (
              <ProgramLibrary key={u.id} university={u} extras={extras.programmes} />
            )}
          </ProfileCard>
        );
      case "scholarships":
        return extras.scholarships ? (
          <ProfileCard key={id} id="scholarships" title={t("ud.sch.title")}>
            <ScholarshipsBody items={extras.scholarships} />
          </ProfileCard>
        ) : null;
      case "apply":
        return (
          <ProfileCard key={id} id="apply" title={t("up.nav.apply")}>
            <ApplyBody university={u} model={view.apply} />
            <CheckedLine date={applyChecked(u)} />
          </ProfileCard>
        );
      case "rankings":
        return (
          <ProfileCard key={id} id="rankings" title={t("up.nav.rankings")}>
            <RankingsBody positions={view.positions} />
          </ProfileCard>
        );
      case "media":
        return (
          <ProfileCard key={id} id="media" title={t("up.nav.media")}>
            <UniversityMedia university={u} />
          </ProfileCard>
        );
      case "overview":
        return (
          <ProfileCard key={id} id="overview" title={t("uni.about.title", { name: u.short_name || name })}>
            <OverviewBody university={u} extras={extras} />
          </ProfileCard>
        );
      case "outcomes":
        return (
          <ProfileCard key={id} id="outcomes" title={t("up.nav.outcomes")}>
            <OutcomesBody university={u} />
          </ProfileCard>
        );
      case "faq":
        return (
          <ProfileCard key={id} id="faq" title={t("oc.faq.title")}>
            <FaqBody university={u} />
          </ProfileCard>
        );
    }
  };
  return (
    <div className="up-page" data-shell={dashboard ? "dashboard" : "public"}>
      <Link className="up-back" href="/universities">← {t("up.back")}</Link>
      <UniversityHeader university={u} foundedFallback={extras.facts?.founded?.year} typeFallback={extras.facts?.type?.value} />
      <EssentialsCheck university={u} />
      <UniversityQuickStart university={u} view={view} signedIn={signedIn} />
      {sections.length > 1 && <SectionNav sections={sections} initial={target && sections.includes(target) ? target : null} />}
      <div className="up-sections">
        {sections.map(card)}
        {extras.guides && (
          <ProfileCard id="guides" title={t("ud.guides.title", { country: countryName(u.country_code) })}>
            <GuidesBody items={extras.guides} />
          </ProfileCard>
        )}
      </div>
      <DataGaps name={name} website={u.website} present={sections} />
      <SourcesLine university={u} />
    </div>
  );
}
