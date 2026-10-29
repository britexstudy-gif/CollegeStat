import type { Metadata } from "next";

export const siteName = "CollegeStat";
export const siteDescription =
  "Research 8,900+ universities in 175 countries with sourced admissions, tuition, rankings, scholarships, and programs. Compare your options with evidence.";
export const defaultImage = {
  url: "/og-default.jpg",
  width: 1200,
  height: 630,
  alt: "CollegeStat — university research with evidence",
};

/**
 * Production origin from NEXT_PUBLIC_SITE_URL. Without it the site is treated as
 * a preview: canonicals point at localhost and every page is served noindex.
 */
export function siteURL() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "";
  return /^https?:\/\//.test(raw) ? raw.replace(/\/+$/, "") : "http://localhost:5173";
}
export function indexable() {
  return /^https:\/\//.test(process.env.NEXT_PUBLIC_SITE_URL || "");
}
export function absoluteURL(path: string) {
  return /^https?:\/\//.test(path) ? path : siteURL() + (path.startsWith("/") ? path : "/" + path);
}

/** Search results show roughly 160 characters; cut on a word boundary. */
export function clip(text: string, max = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, clean.lastIndexOf(" ", max - 1)).replace(/[,;:.\s]+$/, "") + "…";
}

type PageSEO = {
  title: string;
  description?: string;
  path: string;
  image?: { url: string; alt?: string } | null;
  noindex?: boolean;
  /** Use the title as-is instead of the "| CollegeStat" template. */
  absoluteTitle?: boolean;
};

/** Per-page metadata with canonical, Open Graph and Twitter cards kept in sync. */
export function pageMetadata({ title, description: text = siteDescription, path, image, noindex, absoluteTitle }: PageSEO): Metadata {
  const description = clip(text);
  const images = [image ? { url: image.url, alt: image.alt || title } : defaultImage];
  const socialTitle = absoluteTitle ? title : `${title} | ${siteName}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName, url: path, title: socialTitle, description, images, locale: "en_US" },
    twitter: { card: "summary_large_image", title: socialTitle, description, images: images.map((i) => i.url) },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Private, per-user pages: never indexed, never canonicalised. */
export const privateMetadata = (title: string): Metadata => ({
  title,
  robots: { index: false, follow: false },
});

/** Serialise JSON-LD safely for a <script> tag. */
export function jsonLD(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
