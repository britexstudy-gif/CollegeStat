"use client";
import { Images, ArrowUpRight } from "lucide-react";
import { CampusImage } from "./campus-image";
import { campusGallery } from "@/lib/campus-gallery";
import type { University } from "@/lib/domain";

export function CampusGallery({ university }: { university: University }) {
  const photos = campusGallery(university.media);
  const official = university.official_web?.links.campus?.url || university.website;
  return <section className="gallery-section">
    <header className="section-title-row"><div><span className="eyebrow">CAMPUS GALLERY</span>
      <h2>See the place you could study.</h2>
      <p className="caption">{photos.length ? `${photos.length} sourced campus ${photos.length === 1 ? "photograph" : "photographs"}. Open an original for its full size and attribution.` : "Explore campus photographs and tours on the university’s website."}</p>
    </div><a className="button button-secondary" href={official || undefined} target="_blank" rel="noreferrer">Campus website <ArrowUpRight size={16}/></a></header>
    {photos.length ? <div className="campus-gallery-grid">{photos.map((photo) => <article key={photo.id}>
      <CampusImage media={photo}/><div className="gallery-photo-label"><span>{photo.alt || university.name + " campus"}</span>
      <a href={photo.source_url} target="_blank" rel="noreferrer" aria-label={"Open original: " + photo.alt}>Original <ArrowUpRight size={14}/></a></div>
    </article>)}</div> : <div className="gallery-empty"><Images size={30} aria-hidden="true"/><h3>Explore the campus online</h3>
      <p>Licensed photographs have not been linked to this profile yet. The official website is the best place to find current campus tours, accommodation and facilities.</p>
      <a className="text-link" href={official || undefined} target="_blank" rel="noreferrer">Visit {university.short_name || university.name} <ArrowUpRight size={15}/></a></div>}
  </section>;
}
