import type { MetadataRoute } from "next";
import { siteDescription, siteName } from "@/lib/seo";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteName} — University research with evidence`,
    short_name: siteName,
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0563ff",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
