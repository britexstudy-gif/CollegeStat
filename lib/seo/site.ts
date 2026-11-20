/** The one place the public origin is defined. Set NEXT_PUBLIC_SITE_URL (or SITE_URL)
 * when the real domain exists; scripts/build-sitemap.mjs reads the same variables. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  "https://collegestat.xyz"
).replace(/\/+$/, "");
export const SITE_NAME = "CollegeStat";
export const SITE_DESCRIPTION =
  "Research universities with sourced admissions, tuition, rankings and scholarships in one calm place.";
export const absoluteUrl = (path = "/") =>
  SITE_URL + (path.startsWith("/") ? path : "/" + path);
