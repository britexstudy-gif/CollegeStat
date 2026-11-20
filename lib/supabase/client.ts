import { createClient, SupabaseClient } from "@supabase/supabase-js";
// NOTE: NEXT_PUBLIC_* env is baked at build time (see vite.config.ts `define`).
// Changing Supabase URL/keys requires a rebuild; a server restart alone is not enough.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(
  url && key && url.startsWith("https://"),
);
let client: SupabaseClient | null = null;
export function getSupabase() {
  if (!supabaseConfigured) return null;
  if (!client)
    client = createClient(url!, key!, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  return client;
}
