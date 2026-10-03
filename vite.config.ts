import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import { datasetJSONGuard } from "./build/dataset-json-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
};

export default defineConfig(async ({ mode }) => {
  const publicEnv = loadEnv(mode, process.cwd(), [
    "NEXT_PUBLIC_",
    "VITE_SUPABASE_",
  ]);
  publicEnv.NEXT_PUBLIC_SUPABASE_URL ||= publicEnv.VITE_SUPABASE_URL || "";
  publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||=
    publicEnv.VITE_SUPABASE_ANON_KEY || "";
  publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||=
    publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // Large published datasets stay JSON.parse payloads instead of becoming
    // thousands of individual bindings during server module transformation.
    json: { stringify: true, namedExports: false },
    define: Object.fromEntries(
      [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "NEXT_PUBLIC_CATALOGUE_SOURCE",
        "NEXT_PUBLIC_SUPPORT_URL",
        "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED",
        "NEXT_PUBLIC_AUTH_APPLE_ENABLED",
        "NEXT_PUBLIC_AUTH_TELEGRAM_ENABLED",
        "NEXT_PUBLIC_AUTH_EMAIL_ENABLED",
        "NEXT_PUBLIC_MAP_STYLE_URL",
      ].map((key) => [
        `process.env.${key}`,
        JSON.stringify(publicEnv[key] || process.env[key] || ""),
      ]),
    ),
    server: {
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      datasetJSONGuard(),
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
