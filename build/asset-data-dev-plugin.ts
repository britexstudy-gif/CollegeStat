import type { Plugin } from "vite";

/** server/asset-data-dev.ts globs every file under data/ for the dev server.
 * In a production build that glob would bundle ~300 MB into the Worker, so the
 * module is replaced with an empty one; datasets are published as static assets. */
export function assetDataDevStub(): Plugin {
  return {
    name: "collegestat:asset-data-dev-stub",
    apply: "build",
    enforce: "pre",
    load(id) {
      if (/\/server\/asset-data-dev\.ts(?:\?|$)/.test(id)) return "export const devFiles = {};";
    },
  };
}

/** Client components fetch these datasets lazily, in the browser only. The SSR
 * pass bundles every dynamic import it can see, which would put ~350 KB of
 * data into the Worker for code that never runs there. Empty in the SSR
 * environment only; the RSC (server) and browser builds keep the real files. */
const BROWSER_ONLY_DATA = [
  "/data/published/auto-logos.json",
  "/data/published/ipeds-admissions-2023.json",
  "/data/published/ipeds-fees-2023.json",
];
export function ssrBrowserOnlyDataStub(): Plugin {
  return {
    name: "collegestat:ssr-browser-only-data-stub",
    apply: "build",
    enforce: "pre",
    load(id) {
      if (this.environment?.name === "ssr" && BROWSER_ONLY_DATA.some((file) => id.endsWith(file))) return "{}";
    },
  };
}
