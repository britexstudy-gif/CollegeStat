// Dev-server loaders for every dataset under data/. Production builds replace this
// module with an empty one (build/asset-data-dev-plugin.ts): the Worker reads the
// same files from its static assets instead (server/asset-data.ts).
export const devFiles = import.meta.glob("../data/{published,review,generated}/**/*.json", {
  import: "default",
}) as Record<string, () => Promise<unknown>>;
