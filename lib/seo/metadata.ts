import type { Metadata } from "next";
import { countryName, type University } from "@/lib/domain";
import { profileKeyFacts } from "@/lib/profile-key-facts";
import { absoluteUrl, SITE_NAME } from "./site";

/** Default share image: the existing brand mark until real campus art is chosen per page. */
const DEFAULT_IMAGE = "/brand/og-default.png";

export function pageMetadata(input: {
  title: string;
  description: string;
  path: string;
  /** `card: true` marks a generated 1200x630 PNG (app/og/*). */
  image?: { url: string; alt?: string; card?: boolean } | null;
  noindex?: boolean;
  alternates?: Metadata["alternates"];
}): Metadata {
  const url = absoluteUrl(input.path);
  const image = input.image ?? { url: absoluteUrl(DEFAULT_IMAGE), alt: "CollegeStat: universities abroad for students from Central Asia" };
  const isDefault = !input.image;
  const sized = isDefault || !!input.image?.card;
  const images = [
    {
      url: image.url.startsWith("/") ? absoluteUrl(image.url) : image.url,
      ...(image.alt ? { alt: image.alt } : {}),
      // The default and generated cards are exactly 1200x630, so previews (Telegram, WhatsApp, X) render without a fetch-and-guess.
      ...(sized ? { width: 1200, height: 630, type: "image/png" } : {}),
    },
  ];
  const full = `${input.title} | ${SITE_NAME}`;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url, ...input.alternates },
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: "website", url, siteName: SITE_NAME, locale: "en_US", alternateLocale: ["ru_RU", "uz_UZ"], title: full, description: input.description, images },
    twitter: { card: "summary_large_image", title: full, description: input.description, images: images.map((i) => i.url) },
  };
}

/** Plain-text key facts (rank, tuition, ...) used by descriptions and the machine-readable view. */
export function universityFactLines(u: University) {
  const words = { per_year: "per year", out_of_state: "out-of-state", minimum: "minimum", varies: "varies", mid50: "middle 50% of admitted students", average: "average of admitted students" } as const;
  return profileKeyFacts(u).map((f) => ({
    id: f.id,
    value: f.value,
    detail: f.detail.map((d) => (typeof d === "string" ? d : words[d.t])).join(", "),
    href: f.href,
  }));
}

export function universityDescription(u: University) {
  const facts = universityFactLines(u);
  const rank = facts.find((f) => f.id === "rank");
  const tuition = facts.find((f) => f.id === "tuition");
  const place = [u.city, countryName(u.country_code)].filter(Boolean).join(", ");
  const parts = [
    `${u.name} is ${u.university_type ? "a " + u.university_type.toLowerCase() + " " : "a "}university in ${place}.`,
    rank ? `World ranking ${rank.value} (${rank.detail}).` : "",
    tuition ? `International tuition ${tuition.value}${tuition.detail ? " " + tuition.detail.replace(/,/g, "") : ""}.` : "",
    "Sourced admissions, costs, programmes and requirements.",
  ];
  return parts.filter(Boolean).join(" ").slice(0, 300);
}

export function universityMetadata(u: University): Metadata {
  const place = [u.city, countryName(u.country_code)].filter(Boolean).join(", ");
  const path = "/university/" + u.slug;
  return pageMetadata({
    title: `${u.name}${place ? " — " + place : ""}`,
    description: universityDescription(u),
    path,
    image: { url: "/og/university/" + u.slug, alt: u.name + (place ? " — " + place : "") + ": tuition, entry requirements, deadlines", card: true },
    alternates: { types: { "application/json": absoluteUrl("/api/public/university/" + u.slug), "text/markdown": absoluteUrl("/api/public/university/" + u.slug + "?format=md") } },
  });
}
