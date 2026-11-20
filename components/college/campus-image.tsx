"use client";
import { useState } from "react";
import { campusAssets } from "@/lib/university-assets";
import { Media } from "@/lib/domain";
export function CampusImage({
  media,
  priority = false,
  universityName,
}: {
  media: Media | undefined;
  priority?: boolean;
  universityName?: string;
}) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  if (
    !media ||
    !media.reuse_permitted ||
    media.verification_status !== "verified"
  )
    return null;
  const alt =
    typeof media.alt === "string" && media.alt.trim()
      ? media.alt
      : universityName
        ? `${universityName} campus`
        : "University campus";
  const sourceURL = media.source_url || media.data_sources?.url;
  const creator =
    typeof media.creator === "string" && media.creator.trim()
      ? media.creator
      : undefined;
  const license =
    typeof media.license === "string" && media.license.trim()
      ? media.license
      : undefined;
  const licenseURL =
    typeof media.license_url === "string" && media.license_url.trim()
      ? media.license_url
      : undefined;
  const capture = media.evidence?.reporting_period;
  const captureYear = typeof capture === "string" && /^\d{4}-\d{2}-\d{2}/.test(capture)
    ? capture.slice(0, 4)
    : undefined;
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
          key={media.url}
          src={campusAssets[media.url] || media.url}
          alt={alt}
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
        {sourceURL ? (
          <a href={sourceURL} target="_blank" rel="noreferrer">
            Photo{creator ? `: ${creator}` : ""}
          </a>
        ) : (
          <span>Photo{creator ? `: ${creator}` : ""}</span>
        )}
        {license && (
          <>
            <span> · </span>
            {licenseURL ? (
              <a href={licenseURL} target="_blank" rel="noreferrer">
                {license}
              </a>
            ) : (
              <span>{license}</span>
            )}
          </>
        )}
        {captureYear && <span> · Photographed {captureYear}</span>}
        {/* CC licences ask us to flag edits; keep it short for students. */}
        <span> · Cropped</span>
      </figcaption>
    </figure>
  );
}
