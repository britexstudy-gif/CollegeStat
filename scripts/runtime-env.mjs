import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const runtimeRoot = path.join(projectRoot, ".wrangler");

// Tool state stays inside the checkout; public and private application config
// belongs in ignored .env.local and .dev.vars files.
process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
process.env.WRANGLER_SEND_METRICS ??= "false";
process.env.WRANGLER_WRITE_LOGS ??= "false";
process.env.WRANGLER_LOG_PATH ??= path.join(runtimeRoot, "logs");
process.env.WRANGLER_REGISTRY_PATH ??= path.join(runtimeRoot, "dev-registry");
process.env.MINIFLARE_REGISTRY_PATH ??= path.join(runtimeRoot, "registry");

process.chdir(projectRoot);
for (const directory of [
  process.env.WRANGLER_LOG_PATH,
  process.env.WRANGLER_REGISTRY_PATH,
  process.env.MINIFLARE_REGISTRY_PATH,
])
  mkdirSync(directory, { recursive: true });
