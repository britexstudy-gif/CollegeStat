"use client";
import { useState } from "react";
import { campusAssets } from "@/lib/university-assets";
import { Media } from "@/lib/domain";
export function CampusImage({
  media,
  priority = false,
}: {
  media: Media | undefined;
  priority?: boolean;
}) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  if (
    !media ||
    !media.reuse_permitted ||
    media.verification_status !== "verified"
  )
    return null;
  return (
    <figure className="campus-image">
      {failedURL === media.url ? (
        <div className="image-fallback">
          Campus photograph unavailable · Visit the original source below.
        </div>
      ) : (
        // Source-sized derivative avoids downloading the full original; attribution remains visible.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={campusAssets[media.url] || media.url}
          alt={media.alt}
          width={media.width || 1280}
          height={media.height || 852}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedURL(media.url)}
        />
      )}
      <figcaption>
        <a
          href={media.source_url || media.data_sources?.url}
          target="_blank"
          rel="noreferrer"
        >
          Photo: {media.creator}
        </a>
        <span> · </span>
        <a href={media.license_url} target="_blank" rel="noreferrer">
          {media.license}
        </a>
        <span> · Display crop / compressed</span>
      </figcaption>
    </figure>
  );
}
