import type { Plugin } from "vite";

/** JSON modules cannot contain CommonJS. The compatibility plugin's comment
 * stripper backtracks over URL-heavy JSON strings before its user filter runs.
 * Bypass only JSON modules, preserving the converter for actual JS packages.
 */
export function datasetJSONGuard(): Plugin {
  return {
    name: "collegestat:dataset-json-guard",
    configResolved(config) {
      for (const plugin of config.plugins) {
        if (plugin.name !== "vite-plugin-commonjs" || !plugin.transform)
          continue;
        const hook = plugin.transform;
        const handler = typeof hook === "function" ? hook : hook.handler;
        plugin.transform = function (code, id, ...options) {
          if (/\.json(?:\?|$)/i.test(id)) return null;
          return handler.call(this, code, id, ...options);
        };
      }
    },
  };
}
