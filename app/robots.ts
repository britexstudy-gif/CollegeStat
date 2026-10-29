import type { MetadataRoute } from "next";
import { absoluteURL, indexable } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  // Previews and staging (no https NEXT_PUBLIC_SITE_URL) stay out of search.
  if (!indexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/staff/", "/auth/", "/dashboard", "/saved", "/profile", "/compare?"],
    },
    sitemap: absoluteURL("/sitemap.xml"),
  };
}
