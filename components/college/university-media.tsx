"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { Media, OfficialVideo, University } from "@/lib/domain";
import { campusAssets } from "@/lib/university-assets";
import { universityEnrichment, youtubeEmbedUrl } from "@/lib/university-enrichment";
import { campusPhotos } from "@/lib/university-profile-data";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Translate } from "./i18n";
import { useT } from "./i18n";

/** Every video the profile knows, once per YouTube id. */
function profileVideos(u: University): OfficialVideo[] {
  const seen = new Set<string>();
  const reviewed = universityEnrichment(u)?.videos || [];
  const all: OfficialVideo[] = [
    ...(u.official_videos || []),
    ...reviewed.map((v) => ({
      youtube_id: v.youtube_id, title: v.title, kind: "campus_tour", channel: "", channel_url: "", source_url: v.source_url, checked_at: "",
    })),
  ];
  return all.filter((v) => youtubeEmbedUrl(v.youtube_id) && !seen.has(v.youtube_id) && !!seen.add(v.youtube_id));
}
export const hasMedia = (u: University) => campusPhotos(u).length > 0 || profileVideos(u).length > 0;

const kindKey = {
  campus_tour: "up.media.kind.campus_tour",
  admissions: "up.media.kind.admissions",
  student_life: "up.media.kind.student_life",
  introduction: "up.media.kind.introduction",
} as const;

/** Click-to-load YouTube (privacy-enhanced domain). The iframe only exists after
 * the visitor presses play, and it starts playing at once so one click is enough.
 * A thumbnail that fails to load means the video is gone: it is dropped. */
function VideoPlayer({ videos, t }: { videos: OfficialVideo[]; t: Translate }) {
  const [gone, setGone] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const list = videos.filter((v) => !gone.includes(v.youtube_id));
  if (!list.length) return null;
  const active = list[Math.min(index, list.length - 1)];
  const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return (
    <div className="up-video">
      <div className="up-video-stage">
        {playing === active.youtube_id ? (
          <iframe
            key={active.youtube_id}
            src={`https://www.youtube-nocookie.com/embed/${active.youtube_id}?autoplay=1&rel=0&playsinline=1`}
            title={active.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" className="up-video-poster" onClick={() => setPlaying(active.youtube_id)} aria-label={t("up.media.play", { title: active.title })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(active.youtube_id)} alt="" width={640} height={360} decoding="async" onError={() => setGone((g) => [...g, active.youtube_id])} />
            <span className="up-video-play" aria-hidden="true"><Play size={26} fill="currentColor" /></span>
          </button>
        )}
      </div>
      <div className="up-video-meta">
        <strong>{active.title}</strong>
        <a href={`https://www.youtube.com/watch?v=${active.youtube_id}`} target="_blank" rel="noreferrer">
          {t("up.media.youtube")} <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      {list.length > 1 && (
        <ul className="up-video-list" aria-label={t("up.media.videos")}>
          {list.map((v, i) => (
            <li key={v.youtube_id}>
              <button type="button" aria-current={v.youtube_id === active.youtube_id} onClick={() => { setIndex(i); setPlaying(null); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(v.youtube_id)} alt="" width={160} height={90} loading="lazy" decoding="async" onError={() => setGone((g) => [...g, v.youtube_id])} />
                <span>{v.title}</span>
                {v.kind in kindKey && <small>{t(kindKey[v.kind as keyof typeof kindKey])}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const photoSrc = (m: Media) => campusAssets[m.url] || m.url;

function Gallery({ photos, name, t }: { photos: Media[]; name: string; t: Translate }) {
  const [broken, setBroken] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const shown = useMemo(() => photos.filter((p) => !broken.includes(p.url)), [photos, broken]);
  const step = useCallback((d: number) => setOpen((i) => (i == null ? i : (i + d + shown.length) % shown.length)), [shown.length]);
  useEffect(() => {
    if (open == null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, step]);
  if (!shown.length) return null;
  const current = open == null ? null : shown[Math.min(open, shown.length - 1)];
  const alt = (m: Media) => (typeof m.alt === "string" && m.alt.trim() ? m.alt : t("up.media.alt", { name }));
  return (
    <>
      <ul className={"up-gallery is-n" + Math.min(shown.length, 5)}>
        {shown.map((p, i) => (
          <li key={p.url}>
            <button type="button" onClick={() => setOpen(i)} aria-label={t("up.media.open", { n: i + 1 })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(p)} alt={alt(p)} width={p.width || 800} height={p.height || 560} loading={i < 4 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setBroken((b) => [...b, p.url])} />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="up-lightbox" aria-describedby="up-lightbox-caption">
          <DialogTitle className="sr-only">{t("up.media.photos")}</DialogTitle>
          {current && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(current)} alt={alt(current)} referrerPolicy="no-referrer" onError={() => setBroken((b) => [...b, current.url])} />
              <DialogDescription asChild>
                <figcaption id="up-lightbox-caption">
                  <span>{alt(current)}</span>
                  <small>
                    {t("up.media.of", { n: Math.min(open!, shown.length - 1) + 1, total: shown.length })}
                    {current.creator ? " · " + t("up.media.credit", { name: current.creator }) : ""}
                    {current.license ? " · " + current.license : ""}
                    {(current.source_url || current.data_sources?.url) && (
                      <>
                        {" · "}
                        <a href={current.source_url || current.data_sources?.url} target="_blank" rel="noreferrer">{t("up.source")}</a>
                      </>
                    )}
                  </small>
                </figcaption>
              </DialogDescription>
            </figure>
          )}
          {shown.length > 1 && (
            <>
              <button type="button" className="up-lb-nav is-prev" onClick={() => step(-1)} aria-label={t("up.media.prev")}><ChevronLeft size={22} /></button>
              <button type="button" className="up-lb-nav is-next" onClick={() => step(1)} aria-label={t("up.media.next")}><ChevronRight size={22} /></button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Campus & media: photographs with a lightbox and a click-to-play video. */
export function UniversityMedia({ university: u }: { university: University }) {
  const t = useT();
  const photos = campusPhotos(u);
  const videos = profileVideos(u);
  if (!photos.length && !videos.length) return null;
  return (
    <div className="up-media">
      <Gallery photos={photos} name={u.short_name || u.name} t={t} />
      <VideoPlayer videos={videos} t={t} />
    </div>
  );
}
