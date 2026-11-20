import { type University } from "@/lib/domain";
import { establishedYear } from "@/lib/institution-facts";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

export type JsonLdNode = Record<string, unknown>;
const CONTEXT = "https://schema.org";
const clean = <T extends JsonLdNode>(node: T): T =>
  Object.fromEntries(
    Object.entries(node).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)),
  ) as T;
const httpUrl = (value?: string | null) => (value && /^https?:\/\//i.test(value) ? value : undefined);

export function buildBreadcrumbJsonLd(items: { name: string; path: string }[]): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function buildUniversityJsonLd(u: University, description?: string): JsonLdNode {
  const founded = establishedYear(u);
  return clean({
    "@context": CONTEXT,
    "@type": "CollegeOrUniversity",
    "@id": absoluteUrl("/university/" + u.slug) + "#university",
    name: u.name,
    alternateName: u.short_name && u.short_name !== u.name ? u.short_name : undefined,
    url: absoluteUrl("/university/" + u.slug),
    description,
    sameAs: httpUrl(u.website) ? [httpUrl(u.website)] : undefined,
    foundingDate: founded ? String(founded) : undefined,
    logo: httpUrl(u.logo_url) || httpUrl(u.auto_logo),
    address: clean({
      "@type": "PostalAddress",
      streetAddress: u.address || undefined,
      addressLocality: u.city || undefined,
      addressCountry: u.country_code,
    }),
    geo:
      u.latitude != null && u.longitude != null
        ? { "@type": "GeoCoordinates", latitude: u.latitude, longitude: u.longitude }
        : undefined,
  });
}

export function buildItemListJsonLd(name: string, items: { name: string; path: string }[]): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: /^https?:\/\//.test(item.path) ? item.path : absoluteUrl(item.path),
    })),
  };
}

/** schema.org has no scholarship type; MonetaryGrant (a Grant that funds) is the closest.
 * Takes the normalized record from lib/scholarships-data. Grant has no deadline property,
 * so the deadline stays in the page text rather than in invalid markup. */
export function buildScholarshipJsonLd(s: {
  slug: string;
  name: string;
  provider: string | null;
  description: string | null;
  covers: string | null;
  applicationUrl: string | null;
  sourceUrl: string | null;
  universities?: { name: string; slug: string | null }[];
}): JsonLdNode {
  const funder = s.provider || s.universities?.[0]?.name;
  const same = [httpUrl(s.applicationUrl), httpUrl(s.sourceUrl)].filter((u, i, all): u is string => !!u && all.indexOf(u) === i);
  return clean({
    "@context": CONTEXT,
    "@type": "MonetaryGrant",
    name: s.name,
    url: absoluteUrl("/scholarships/" + s.slug),
    description: [s.covers, s.description].filter(Boolean).join(" ") || undefined,
    funder: funder ? { "@type": "Organization", name: funder } : undefined,
    sameAs: same,
  });
}

export function buildArticleJsonLd(a: {
  slug: string;
  title: string;
  provider: string;
  author?: string | null;
  publishedAt?: string | null;
  checkedAt?: string | null;
  url: string;
  summary?: string;
}): JsonLdNode {
  return clean({
    "@context": CONTEXT,
    "@type": "Article",
    headline: a.title,
    description: a.summary,
    mainEntityOfPage: a.url,
    url: httpUrl(a.url),
    author: a.author ? { "@type": "Person", name: a.author } : { "@type": "Organization", name: a.provider },
    publisher: { "@type": "Organization", name: a.provider },
    datePublished: a.publishedAt || undefined,
    dateModified: a.checkedAt || undefined,
  });
}

export function buildFaqJsonLd(faqs: { question: string; answer: string }[]): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/** Organization + WebSite with the sitelinks search box. */
export function buildSiteJsonLd(): JsonLdNode[] {
  return [
    {
      "@context": CONTEXT,
      "@type": "Organization",
      "@id": SITE_URL + "/#organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/favicon.svg"),
      description: SITE_DESCRIPTION,
    },
    {
      "@context": CONTEXT,
      "@type": "WebSite",
      "@id": SITE_URL + "/#website",
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": SITE_URL + "/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: SITE_URL + "/universities?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}
