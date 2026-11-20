"use client";
import { useState } from "react";
import { Play } from "lucide-react";
import { useT } from "./i18n";
import "./content-video.css";

/** One official YouTube video, click-to-load on the privacy-enhanced domain.
 * Nothing from YouTube loads except the thumbnail until the reader presses play. */
export function ContentVideo({ id, title, channel }: { id: string; title: string; channel?: string | null }) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return (
    <figure className="cv">
      <div className="cv-stage">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" className="cv-poster" onClick={() => setPlaying(true)} aria-label={t("sch.video.play", { title })}>
            <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" onError={() => setGone(true)} />
            <span className="cv-play" aria-hidden="true">
              <Play size={22} fill="currentColor" />
            </span>
          </button>
        )}
      </div>
      <figcaption>
        <strong>{title}</strong>
        {channel && <span>{t("sch.video.by", { channel })}</span>}
      </figcaption>
    </figure>
  );
}
