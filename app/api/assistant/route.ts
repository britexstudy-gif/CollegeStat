import { z } from "zod";
import { authenticate, sameOrigin, serverConfig } from "@/server/config";
import { chatConnections } from "@/services/openrouter-provider";
import { readJSON } from "@/server/http";
import { LANG_CODES, languageName } from "@/lib/i18n/languages";
import { assistantStream, runAssistant } from "@/server/ai-agent";
import { createAssistantTools } from "@/server/ai-tools";
import { assistantToolData, readPreferences, readTasks } from "@/server/ai-tool-data";
import { consumePlanQuota } from "@/server/plan-quota";

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(12000) }))
    .min(1)
    .max(24),
  language: z.enum(LANG_CODES).optional(),
});

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Compiled away in production builds: Vite sets DEV=false statically. */
const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/** The agentic counsellor. Streams NDJSON AssistantEvents (lib/ai-assistant.ts). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "invalid" });
  const config = serverConfig();
  const parsed = body.safeParse(await readJSON(request, 600000).catch(() => null));
  if (!parsed.success) return json(400, { error: "invalid" });
  const history = parsed.data.messages;
  if (history[history.length - 1].role !== "user") return json(400, { error: "invalid" });
  const language = languageName(parsed.data.language);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90000)]);

  // DEV ONLY: "script" runs a scripted model, "model" the real one; both with a
  // synthetic profile and no sign-in, so the UI can be tested locally.
  const devMode = DEV ? request.headers.get("x-cs-ai-dev") : null;
  if (devMode === "script" || devMode === "model") {
    const { DEV_PROFILE, scriptedModel } = await import("@/server/ai-mock");
    const connections =
      devMode === "script" ? [{ url: "https://mock.invalid/chat", key: "mock", model: "mock", extra: {} }] : chatConnections(config);
    if (!connections.length) return json(503, { error: "offline" });
    const tools = createAssistantTools(assistantToolData({ config, preferences: async () => DEV_PROFILE }));
    return assistantStream((emit) =>
      runAssistant({ connections, language, history, tools, emit, signal, transport: devMode === "script" ? scriptedModel : undefined }),
    );
  }

  const connections = chatConnections(config);
  if (!connections.length) return json(503, { error: "offline" });
  const auth = await authenticate(request);
  if (!auth?.user?.id) return json(401, { error: "signin" });
  // The same per-account AI quota as every other student AI tool: one unit per question.
  // Plan allowance first (lib/plans.ts), then the database's hard per-account cap.
  if (!(await consumePlanQuota(auth.db, auth.user.id, "ai", signal)).ok) return json(429, { error: "quota" });
  const { data: allowed, error: limitError } = await auth.db.rpc("consume_student_ai_limit");
  if (limitError || allowed !== true) return json(429, { error: "quota" });
  const tools = createAssistantTools(assistantToolData({ config, preferences: readPreferences(auth.db, auth.user.id), tasks: readTasks(auth.db, auth.user.id) }));
  return assistantStream((emit) => runAssistant({ connections, language, history, tools, emit, signal }));
}
