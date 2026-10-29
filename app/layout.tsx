import type { Metadata } from "next";
import "./globals.css";
import { CollegeProvider } from "@/components/college/provider";
import { SiteShell } from "@/components/college/shell";
import { featuredCatalogue } from "@/server/global-catalogue";
import { referenceScholarships } from "@/server/catalogue";
import { hostedCatalogue } from '@/server/hosted-catalogue';
import { absoluteURL, defaultImage, indexable, jsonLD, siteDescription, siteName, siteURL } from "@/lib/seo";
export const metadata: Metadata = {
  metadataBase: new URL(siteURL()),
  applicationName: siteName,
  title: {
    default: "CollegeStat — University research with evidence",
    template: "%s | CollegeStat",
  },
  description: siteDescription,
  keywords: [
    "university search",
    "compare universities",
    "college admissions",
    "acceptance rates",
    "tuition",
    "university rankings",
    "scholarships",
    "study abroad",
  ],
  openGraph: {
    type: "website",
    siteName,
    title: "CollegeStat — University research with evidence",
    description: siteDescription,
    images: [defaultImage],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "CollegeStat — University research with evidence",
    description: siteDescription,
    images: [defaultImage.url],
  },
  robots: indexable()
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } }
    : { index: false, follow: false },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? {
        verification: {
          google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
          other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
            ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
            : undefined,
        },
      }
    : {}),
  icons: {
    icon: [{ url: "/favicon.svg?v=cs-2", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/favicon.svg?v=cs-2",
    apple: "/brand/cstat.png",
  },
};
const siteSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": absoluteURL("/#organization"),
      name: siteName,
      url: absoluteURL("/"),
      logo: absoluteURL("/brand/cstat.png"),
    },
    {
      "@type": "WebSite",
      "@id": absoluteURL("/#website"),
      name: siteName,
      url: absoluteURL("/"),
      description: siteDescription,
      publisher: { "@id": absoluteURL("/#organization") },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: absoluteURL("/universities?q={search_term_string}") },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  const catalogue = process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === 'supabase'
    ? await hostedCatalogue().catch(() => ({universities:[],scholarships:[]}))
    : {universities:featuredCatalogue,scholarships:referenceScholarships};
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLD(siteSchema)} />
        <CollegeProvider
          initialScholarships={catalogue.scholarships}
          initialUniversities={catalogue.universities}
        >
          <SiteShell>{children}</SiteShell>
        </CollegeProvider>
      </body>
    </html>
  );
}
