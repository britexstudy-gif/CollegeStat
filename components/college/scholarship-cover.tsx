import "./scholarship-cover.css";
import type { ScholarshipImage } from "@/lib/scholarships-data";

/** Small stable hash so each award keeps the same calm pattern. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** A licensed campus photo, or a quiet generated pattern when there is none.
 * The pattern is pure CSS, so nothing is fetched and nothing needs a licence. */
export function ScholarshipCover({
  slug,
  image,
  label,
  className = "",
  eager = false,
}: {
  slug: string;
  image: ScholarshipImage | null;
  /** Big quiet word inside the pattern (usually the country). */
  label?: string | null;
  className?: string;
  eager?: boolean;
}) {
  if (image) {
    return (
      <div className={"sc-cover is-photo " + className}>
        <img src={image.src} alt={image.alt} loading={eager ? "eager" : "lazy"} decoding="async" />
      </div>
    );
  }
  const h = hash(slug);
  const style = {
    "--sc-a": `${205 + (h % 30)}`,
    "--sc-x": `${15 + (h % 70)}%`,
    "--sc-y": `${20 + ((h >> 3) % 60)}%`,
  } as React.CSSProperties;
  return (
    <div className={"sc-cover is-pattern " + className} style={style} aria-hidden="true">
      {label && <span>{label}</span>}
    </div>
  );
}

/** "Photo: Name, CC BY-SA 4.0" with links, for the hero caption. */
export function CoverCredit({ image, label }: { image: ScholarshipImage; label: string }) {
  return (
    <p className="sc-credit">
      {label}{" "}
      {image.sourceUrl ? (
        <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">
          {image.credit ?? "Wikimedia Commons"}
        </a>
      ) : (
        image.credit
      )}
      {image.licence && (
        <>
          {", "}
          {image.licenceUrl ? (
            <a href={image.licenceUrl} target="_blank" rel="noopener noreferrer license">
              {image.licence}
            </a>
          ) : (
            image.licence
          )}
        </>
      )}
    </p>
  );
}
