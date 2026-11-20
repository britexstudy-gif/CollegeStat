import { authAvailability } from "@/lib/auth-availability";
import { serverConfig, serviceClient } from "@/server/config";

export async function GET() {
  const config = serverConfig();
  if (!config.url || !config.anon)
    return Response.json(
      { available: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const response = await fetch(config.url + "/auth/v1/settings", {
      headers: { apikey: config.anon },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Auth settings unavailable");
    const settings: unknown = await response.json();
    // The public settings endpoint omits custom providers. A server-only client
    // can attest to Telegram without sending credentials or provider records.
    const admin = serviceClient();
    let providers: unknown = [];
    if (admin) {
      try {
        const result = await admin.auth.admin.customProviders.listProviders();
        if (!result.error) providers = result.data.providers;
      } catch {
        /* Custom provider availability fails closed; email still works. */
      }
    }
    return Response.json(
      { available: authAvailability(settings, providers) },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch {
    return Response.json(
      { available: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
