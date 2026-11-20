"use client";
import { useState } from "react";
import { rankingSystems, type RankingSystemSlug } from "@/lib/ranking-systems";
const marks = {
  qs: { name: "QS World University Rankings", src: "/logos/publishers/qs.png" },
  the: { name: "Times Higher Education", src: "/logos/publishers/the.svg" },
  arwu: { name: "ShanghaiRanking", src: "/logos/publishers/arwu.svg" },
  leiden: { name: "CWTS Leiden Ranking", src: "/logos/publishers/leiden.png" },
  cwur: { name: "Center for World University Rankings", src: "/logos/publishers/cwur.svg" },
  herd: { name: "NCSES Higher Education R&D Survey", src: "/logos/publishers/herd.svg" },
  unirank: { name: "uniRank", src: "/logos/publishers/unirank.png" },
  time: { name: "TIME", src: "/logos/publishers/time.png" },
  usnews: { name: "U.S. News & World Report", src: "/logos/publishers/usnews.svg" },
  webometrics: { name: "Webometrics", src: "/logos/publishers/webometrics.png" },
  urap: { name: "URAP", src: "/logos/publishers/urap.png" },
  nirf: { name: "NIRF India Rankings", src: "/logos/publishers/nirf.png" },
};
export function PublisherMark({
  provider,
  priority,
}: {
  provider: RankingSystemSlug;
  priority?: boolean;
}) {
  const mark = marks[provider as keyof typeof marks];
  const system = rankingSystems.find((s) => s.slug === provider);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const image = mark && failedSource !== mark.src ? mark : null;
  const shown = !!image && loadedSource === image.src;
  // The publisher's name stays visible until its mark has actually painted,
  // so a slow, lazy or blocked image never leaves an empty plate.
  const settle = (img: HTMLImageElement | null) => {
    if (!img || !image || !img.complete) return;
    if (img.naturalWidth || /\.svg$/.test(image.src)) setLoadedSource(image.src);
    else setFailedSource(image.src);
  };
  return (
    <span
      className={
        `publisher-mark publisher-identification publisher-${provider}` +
        (shown ? " has-publisher-image" : " has-publisher-text")
      }
    >
      {image && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={settle}
          src={image.src}
          alt={shown ? image.name : ""}
          aria-hidden={shown ? undefined : true}
          width={100}
          height={40}
          loading="eager"
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          hidden={!shown}
          onLoad={(event) => settle(event.currentTarget)}
          onError={() => setFailedSource(image.src)}
        />
      )}
      {!shown && (
        <span
          className="publisher-text-mark"
          aria-label={system?.name ?? provider}
        >
          {system?.shortName || provider}
        </span>
      )}
    </span>
  );
}
