import type { Metadata } from "next";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import "./globals.css";
import "./ranking-studio-oct15.css";
import "./product-identity.css";
// Brand tokens load last: the single source for colour, type, spacing, radius, shadow and motion.
import "./brand-tokens.css";
import "./input-focus.css";
import "@/lib/intl-uz";
import { ThemeProvider } from "next-themes";
import { CollegeProvider } from "@/components/college/provider";
import { SiteShell } from "@/components/college/shell";
import { hostedCatalogue } from "@/server/hosted-catalogue";
import { defersPublicCatalogue } from "@/lib/page-bootstrap";
import { I18nProvider } from "@/components/college/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { LANG_COOKIE, resolveLang } from "@/lib/i18n/languages";
import { shortEdgeCache } from "@/server/edge-cache";
import { sharedCataloguePreview } from "@/server/discovery-preview";
import { prefetchRouteData } from "@/server/route-prefetch";
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "CollegeStat — Universities abroad for students from Central Asia",
    template: "%s | CollegeStat",
  },
  description:
    "Find universities abroad you can afford and get into: tuition, IELTS minimums, deadlines and scholarships for 14,000 universities, with sources. For students from Uzbekistan, Kazakhstan, Kyrgyzstan and Tajikistan.",
  // Defaults for any page that sets no share data of its own.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "CollegeStat — Universities abroad for students from Central Asia",
    description: "Tuition, entry requirements, deadlines and scholarships for 14,000 universities, with sources, and an AI counsellor.",
    images: [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: "CollegeStat" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og-default.png"] },
  keywords: [
    "study abroad Uzbekistan", "study abroad Kazakhstan", "universities abroad", "bachelor abroad",
    "scholarships for Uzbek students", "chet elda o'qish", "grantlar", "учёба за границей", "стипендии для студентов из Узбекистана",
    "IELTS requirements", "university tuition", "application deadlines",
  ],
  icons: {
    icon: [{ url: "/favicon.svg?v=cs-3", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/favicon.svg?v=cs-3",
  },
};
const slow = Symbol("slow");
const snapshot = () =>
  import("@/server/catalogue-store").then((local) => local.landingCatalogue());
/** When a render in this isolate first waited on the hosted read that is still
 * pending (0 = none). The router renders the root layout twice per request (a
 * layout probe, then the page) and concurrent requests share one fill, so each
 * waits only for what is left of one 350 ms budget instead of its own. */
let waitingSince = 0;
/** The last complete hosted catalogue this isolate read. Published rows change
 * rarely, so while a refill is slow (the five-minute read cache expired) pages
 * keep serving it instead of dropping to the bundled snapshot, which is only
 * edge-cached briefly. */
let lastHosted:
  | Pick<Awaited<ReturnType<typeof hostedCatalogue>>, "universities" | "scholarships">
  | undefined;
/** The public discovery cards every page hydrates. */
const layoutCatalogue = cache(async () => {
  // A cold hosted read takes seconds; never hold every public page on it.
  // Serve the bundled snapshot when Supabase is slow while the hosted read
  // keeps filling its cache for the next request.
  let fallback = false;
  let catalogue: Pick<
    Awaited<ReturnType<typeof hostedCatalogue>>,
    "universities" | "scholarships"
  >;
  if (process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === "supabase") {
    const read = hostedCatalogue();
    void read.then(
      (value) => (lastHosted = value),
      () => {},
    );
    if (!waitingSince) {
      waitingSince = Date.now();
      void read.then(
        () => (waitingSince = 0),
        () => (waitingSince = 0),
      );
    }
    const budget = Math.max(0, 350 - (Date.now() - waitingSince));
    const hosted = await Promise.race([
      read.catch((): typeof slow => slow),
      new Promise<typeof slow>((done) => setTimeout(() => done(slow), budget)),
    ]);
    const previous = hosted === slow ? lastHosted : undefined;
    fallback = hosted === slow && !previous;
    catalogue = hosted !== slow ? hosted : previous ?? (await snapshot());
  } else catalogue = await snapshot();
  // The hosted read was slow or failed: share this page only briefly.
  if (fallback) shortEdgeCache();
  // Only card fields (plus ranking sources) are read from these shared rows.
  return {
    ...catalogue,
    universities: catalogue.universities.map(sharedCataloguePreview),
  };
});
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const requestPath = requestHeaders.get("x-collegestat-request-path") || "";
  const accountRoute = defersPublicCatalogue(requestPath);
  if (!accountRoute)
    prefetchRouteData(
      requestPath,
      requestHeaders.get("x-collegestat-request-search") || "",
    );
  const lang = resolveLang(
    (await cookies()).get(LANG_COOKIE)?.value,
    requestHeaders.get("accept-language"),
  );
  const catalogue = accountRoute
    ? { universities: [], scholarships: [] }
    : await layoutCatalogue();
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* Inter as one variable font file; a <link> avoids the render-blocking CSS @import chain. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Poppins:wght@500;600&family=Montserrat:wght@500..600&display=swap"
        />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          storageKey="collegestat-appearance-choice"
          enableSystem={false}
          disableTransitionOnChange
        >
          <I18nProvider initial={lang}>
            <CollegeProvider
              initialScholarships={catalogue.scholarships}
              initialUniversities={catalogue.universities}
            >
              <SiteShell>{children}</SiteShell>
            </CollegeProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
