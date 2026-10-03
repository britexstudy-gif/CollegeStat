import type { Metadata } from "next";
import "./globals.css";
import { CollegeProvider } from "@/components/college/provider";
import { SiteShell } from "@/components/college/shell";
import { featuredCatalogue } from "@/server/global-catalogue";
import { referenceScholarships } from "@/server/catalogue";
import { hostedCatalogue } from '@/server/hosted-catalogue';
export const metadata: Metadata = {
  title: {
    default: "CollegeStat — University research with evidence",
    template: "%s | CollegeStat",
  },
  description:
    "Explore universities, understand the sources, and compare your possibilities with confidence.",
  icons: {
    icon: [{ url: "/favicon.svg?v=cs-2", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/favicon.svg?v=cs-2",
  },
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  const catalogue = process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === 'supabase'
    ? await hostedCatalogue().catch(() => ({universities:[],scholarships:[]}))
    : {universities:featuredCatalogue,scholarships:referenceScholarships};
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
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
