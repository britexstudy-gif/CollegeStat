import { z } from "zod";
import { abortable } from "@/lib/abortable";

export class AIConnectionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type StructuredAIOptions = {
  key: string;
  model: string;
  system: string;
  input: unknown;
  schema: Record<string, unknown>;
  name: string;
  maxTokens?: number;
  signal?: AbortSignal;
  transport?: typeof fetch;
  /** Defaults to OpenRouter; Groq and DeepSeek use their OpenAI-compatible endpoints. */
  provider?: "openrouter" | "groq" | "deepseek";
};

export const AI_ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
} as const;
const ENDPOINTS = AI_ENDPOINTS;
/** Fixed provider endpoint, bounded output and no provider error/body logging. */
export async function openRouterJSON(
  options: StructuredAIOptions,
): Promise<unknown> {
  if (!options.key || !options.model)
    throw new AIConnectionError(503, "AI is not connected yet.");
  const inputText = JSON.stringify(options.input);
  const provider = options.provider || "openrouter";
  // DeepSeek has JSON mode but no strict schema, so the schema travels in the
  // prompt and the caller still validates the parsed reply.
  const system =
    provider === "deepseek"
      ? options.system +
        "\nReply with one JSON object only, matching this JSON schema exactly: " +
        JSON.stringify(options.schema)
      : options.system;
  // Measured without the appended schema, which is ours and bounded.
  if (new TextEncoder().encode(options.system + inputText).byteLength > 18000)
    throw new AIConnectionError(
      413,
      "This text and its source context are too long. Shorten the text or remove university context before retrying.",
    );
  const signal = AbortSignal.any([
    options.signal || new AbortController().signal,
    AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
  ]);
  // Network failures and timeouts before headers arrive must surface as the
  // same safe AIConnectionError as HTTP failures (raw fetch errors can carry
  // URLs/causes, and callers only map AIConnectionError to user messages).
  const response = await abortable(
    (options.transport || fetch)(
      ENDPOINTS[provider],
      {
        method: "POST",
        signal,
        headers: {
          Authorization: "Bearer " + options.key,
          "Content-Type": "application/json",
          ...(provider === "openrouter"
            ? { "X-OpenRouter-Title": "CollegeStat" }
            : {}),
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: Math.min(options.maxTokens || 1500, 2000),
          temperature: 0.3,
          ...(provider === "groq"
            ? { reasoning_effort: "low" }
            : provider === "openrouter"
              ? {
                  provider: {
                    data_collection: "deny",
                    require_parameters: true,
                    max_price: { prompt: 0.15, completion: 0.6 },
                  },
                }
              : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: inputText },
          ],
          response_format:
            provider === "deepseek"
              ? { type: "json_object" }
              : {
                  type: "json_schema",
                  json_schema: {
                    name: options.name,
                    strict: true,
                    schema: options.schema,
                  },
                },
        }),
      },
    ),
    signal,
  ).catch(() => {
    logProviderFailure(provider, signal.aborted ? "timeout" : "network");
    throw new AIConnectionError(
      503,
      signal.aborted
        ? "AI took too long or was cancelled. Your text is kept."
        : "The AI connection could not complete this request. Your text is kept; please retry.",
    );
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    logProviderFailure(provider, response.status);
    throw new AIConnectionError(
      response.status === 429 ? 429 : 503,
      response.status === 429
        ? "The AI provider is busy. Please try again later."
        : "The AI connection could not complete this request. Your text is kept; please retry.",
    );
  }
  try {
    const envelope = z
      .object({
        choices: z
          .array(
            z.object({ message: z.object({ content: z.string().max(30000) }) }),
          )
          .min(1)
          .max(8),
      })
      .parse(JSON.parse(await readBoundedText(response, signal)));
    return JSON.parse(jsonContent(envelope.choices[0].message.content));
  } catch (error) {
    if (error instanceof AIConnectionError) throw error;
    logProviderFailure(provider, signal.aborted ? "timeout" : "invalid_json");
    if (signal.aborted)
      throw new AIConnectionError(
        503,
        "AI took too long or was cancelled. Your text is kept.",
      );
    throw new AIConnectionError(
      503,
      "The AI response could not be verified. Your text is kept; please retry.",
    );
  }
}

/** Per-provider-call deadline; the caller's own signal still bounds the chain. */
const AI_CALL_TIMEOUT_MS = 30000;
const AI_RESPONSE_MAX_BYTES = 100000;

/** Reads a provider body with a byte cap instead of trusting Content-Length. */
export async function readBoundedText(
  response: Response,
  signal: AbortSignal,
  limit = AI_RESPONSE_MAX_BYTES,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new AIConnectionError(503, "The AI provider returned no response.");
  const decoder = new TextDecoder();
  let body = "",
    bytes = 0;
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        throw new AIConnectionError(
          503,
          "The AI response was too large. Please retry.",
        );
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** JSON-mode providers occasionally wrap the object in a Markdown fence. */
function jsonContent(content: string) {
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : content;
}

/** Operators need to see a bad key or quota (e.g. DeepSeek 401/402/429) in
 * Worker logs. Only the provider name and status are logged: never keys,
 * prompts, student text or provider bodies. */
export function logProviderFailure(provider: string, status: number | string) {
  console.warn(
    JSON.stringify({ event: "ai_provider_failed", provider, status }),
  );
}

export type AIConfig = {
  deepseek?: string;
  deepseekModel?: string;
  groqKeys: string[];
  groqModel: string;
  openrouter: string;
  openrouterModel: string;
  openrouterReady: boolean;
};

/** OpenAI-compatible chat connections in the order they are tried:
 * DeepSeek first when its key is set, then each Groq key. */
export function chatConnections(config: AIConfig) {
  return [
    ...(config.deepseek
      ? [
          {
            url: AI_ENDPOINTS.deepseek,
            key: config.deepseek,
            model: config.deepseekModel || "deepseek-chat",
            extra: {} as Record<string, unknown>,
          },
        ]
      : []),
    ...config.groqKeys.map((key) => ({
      url: AI_ENDPOINTS.groq as string,
      key,
      model: config.groqModel,
      extra: { reasoning_effort: "low" } as Record<string, unknown>,
    })),
  ];
}
export type ChatConnection = ReturnType<typeof chatConnections>[number];

/** Tries DeepSeek when configured, then each Groq key in turn when one is
 * rate-limited or rejected, then OpenRouter when that is configured. */
export async function connectedAIJSON(
  config: AIConfig,
  options: Omit<StructuredAIOptions, "key" | "model" | "provider">,
): Promise<unknown> {
  const attempts: Pick<StructuredAIOptions, "key" | "model" | "provider">[] = [
    ...(config.deepseek
      ? [
          {
            key: config.deepseek,
            model: config.deepseekModel || "deepseek-chat",
            provider: "deepseek" as const,
          },
        ]
      : []),
    ...config.groqKeys.map((key) => ({
      key,
      model: config.groqModel,
      provider: "groq" as const,
    })),
    ...(config.openrouter && config.openrouterModel && config.openrouterReady
      ? [
          {
            key: config.openrouter,
            model: config.openrouterModel,
            provider: "openrouter" as const,
          },
        ]
      : []),
  ];
  let last: unknown = new AIConnectionError(503, "AI is not connected yet.");
  for (const attempt of attempts) {
    try {
      return await openRouterJSON({ ...options, ...attempt });
    } catch (error) {
      last = error;
      // A cancelled caller or an over-long input fails the same way everywhere.
      if (
        options.signal?.aborted ||
        (error instanceof AIConnectionError && error.status === 413)
      )
        throw error;
    }
  }
  throw last;
}

export const aiConnected = (config: AIConfig) =>
  !!config.deepseek ||
  config.groqKeys.length > 0 ||
  (!!config.openrouter && !!config.openrouterModel && config.openrouterReady);
