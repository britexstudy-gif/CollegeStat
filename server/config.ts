import { HttpError } from "./http";
import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
export function serverConfig() {
  const e = env as unknown as Record<string, string | undefined>;
  return {
    url: e.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anon:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    service: e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY || "",
    openai: e.OPENAI_API_KEY || "",
    model: e.OPENAI_MODEL || "",
    openrouter: e.OPENROUTER_API_KEY || "",
    openrouterModel: e.OPENROUTER_MODEL || "liquid/lfm-2.5-2.6b:free",
    openrouterReady: e.OPENROUTER_CONNECTION_READY === "true",
    groqKeys: (e.GROQ_API_KEYS || e.GROQ_API_KEY || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
    groqModel: e.GROQ_MODEL || "openai/gpt-oss-120b",
    // DeepSeek is tried first when its key is set; Groq and OpenRouter stay as fallbacks.
    deepseek: e.DEEPSEEK_API_KEY || "",
    deepseekModel: e.DEEPSEEK_MODEL || "deepseek-chat",
  };
}
export function serviceClient() {
  const e = serverConfig();
  if (!e.url || !e.service) return null;
  return createClient(e.url, e.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authenticate(request: Request) {
  const e = serverConfig(),
    token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!e.url || !e.anon || !token) return null;
  const db = createClient(e.url, e.anon, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(token);
  return error ? null : { user: data.user, db, token };
}
export function sameOrigin(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Mutations must carry an origin signal; reject missing Origin/Referer
    // on POST/PUT/etc. GET/HEAD stay open for curl health checks.
    if (!origin && !referer) return false;
  }
  if (origin) return origin === url.origin;
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  return true;
}
export function serverError(code: string, error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    JSON.stringify({
      event: code,
      error_type: error instanceof Error ? error.name : "UnknownError",
      time: new Date().toISOString(),
    }),
  );
  return Response.json(
    { error: "The request could not be completed. Please retry." },
    { status: 500 },
  );
}
