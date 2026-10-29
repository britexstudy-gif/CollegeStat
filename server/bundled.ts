/**
 * Loads the bundled reference catalogue on demand. Vite replaces the source
 * variable at build time, so hosted builds fold this to a rejection and the
 * published JSON snapshots (about 45 MB) never enter the server bundle.
 */
export function bundledCatalogue(): Promise<
  typeof import("./bundled-catalogue")
> {
  return process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === "supabase"
    ? Promise.reject(
        new Error("The bundled catalogue is not included in hosted builds."),
      )
    : import("./bundled-catalogue");
}
