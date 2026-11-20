import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_ENDPOINTS,
  AIConnectionError,
  chatConnections,
  connectedAIJSON,
  openRouterJSON,
  type AIConfig,
} from "../services/openrouter-provider";
import { runAgent } from "../server/agent";
import {
  handleStudentAI,
  type StudentAIHandlerDependencies,
} from "../server/student-ai-handler";
import { fitStudentAIResult, studentAIResult } from "../lib/student-ai";
import { isLang, languageName, resolveLang } from "../lib/i18n/languages";

// Synthetic keys only; every test injects a transport, nothing touches the network.
const config = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  deepseek: "synthetic-deepseek-key",
  deepseekModel: "deepseek-chat",
  groqKeys: ["synthetic-groq-1", "synthetic-groq-2"],
  groqModel: "synthetic/groq",
  openrouter: "synthetic-openrouter-key",
  openrouterModel: "synthetic/openrouter:free",
  openrouterReady: true,
  ...overrides,
});
const ok = (content: string) =>
  Response.json({ choices: [{ message: { content } }] });
const options = {
  system: "Rules",
  input: { text: "Synthetic practice" },
  schema: { type: "object", properties: { checked: { type: "boolean" } } },
  name: "test",
};
const auth = (init?: RequestInit) =>
  (init!.headers as Record<string, string>).Authorization;

test("DeepSeek request uses its endpoint, JSON mode and the schema in the system prompt", async () => {
  let url = "";
  let body: Record<string, unknown> = {};
  let headers: Record<string, string> = {};
  const out = await openRouterJSON({
    ...options,
    key: "synthetic-deepseek-key",
    model: "deepseek-chat",
    provider: "deepseek",
    maxTokens: 99999,
    transport: async (input, init) => {
      url = String(input);
      headers = init!.headers as Record<string, string>;
      body = JSON.parse(init!.body as string);
      return ok('{"checked":true}');
    },
  });
  assert.deepEqual(out, { checked: true });
  assert.equal(url, "https://api.deepseek.com/chat/completions");
  assert.equal(headers.Authorization, "Bearer synthetic-deepseek-key");
  assert.equal("X-OpenRouter-Title" in headers, false);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.model, "deepseek-chat");
  assert.equal(body.max_tokens, 2000);
  // OpenRouter/Groq-only fields must not be sent to DeepSeek.
  assert.equal("provider" in body, false);
  assert.equal("reasoning_effort" in body, false);
  const messages = body.messages as { role: string; content: string }[];
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /^Rules\n/);
  assert.match(messages[0].content, /JSON/);
  assert.ok(messages[0].content.includes(JSON.stringify(options.schema)));
  assert.equal(messages[1].content, JSON.stringify(options.input));
  assert.equal(JSON.stringify(body).includes("synthetic-deepseek-key"), false);
});

test("Groq and OpenRouter keep strict json_schema and do not get the schema prompt", async () => {
  for (const provider of ["groq", "openrouter"] as const) {
    let body: Record<string, unknown> = {};
    await openRouterJSON({
      ...options,
      key: "k",
      model: "m",
      provider,
      transport: async (_url, init) => {
        body = JSON.parse(init!.body as string);
        return ok("{}");
      },
    });
    assert.equal(
      (body.response_format as { type: string }).type,
      "json_schema",
    );
    assert.equal(
      (body.messages as { content: string }[])[0].content,
      "Rules",
    );
  }
});

test("DeepSeek fenced JSON content is accepted", async () => {
  const out = await openRouterJSON({
    ...options,
    key: "k",
    model: "m",
    provider: "deepseek",
    transport: async () => ok('```json\n{"checked":true}\n```'),
  });
  assert.deepEqual(out, { checked: true });
});

test("fallback order is DeepSeek, then each Groq key, then OpenRouter", async () => {
  const calls: string[] = [];
  const replies = [
    () => new Response("synthetic-deepseek-key rejected", { status: 401 }),
    () => new Response("busy", { status: 429 }),
    () => ok("not JSON from synthetic-groq-2"),
    () => ok('{"checked":"openrouter"}'),
  ];
  const out = await connectedAIJSON(config(), {
    ...options,
    transport: async (url, init) => {
      calls.push(String(url) + " " + auth(init));
      return replies[calls.length - 1]();
    },
  });
  assert.deepEqual(out, { checked: "openrouter" });
  assert.deepEqual(calls, [
    AI_ENDPOINTS.deepseek + " Bearer synthetic-deepseek-key",
    AI_ENDPOINTS.groq + " Bearer synthetic-groq-1",
    AI_ENDPOINTS.groq + " Bearer synthetic-groq-2",
    AI_ENDPOINTS.openrouter + " Bearer synthetic-openrouter-key",
  ]);
});

test("a working DeepSeek answers alone; unconfigured providers are skipped", async () => {
  const calls: string[] = [];
  await connectedAIJSON(config(), {
    ...options,
    transport: async (url) => {
      calls.push(String(url));
      return ok("{}");
    },
  });
  assert.deepEqual([...calls], [AI_ENDPOINTS.deepseek]);
  calls.length = 0;
  await connectedAIJSON(
    config({ deepseek: "", groqKeys: [] }),
    {
      ...options,
      transport: async (url) => {
        calls.push(String(url));
        return ok("{}");
      },
    },
  );
  assert.deepEqual([...calls], [AI_ENDPOINTS.openrouter]);
  calls.length = 0;
  // OpenRouter only joins when explicitly marked ready.
  await assert.rejects(
    connectedAIJSON(config({ groqKeys: [], openrouterReady: false }), {
      ...options,
      transport: async (url) => {
        calls.push(String(url));
        return new Response("", { status: 500 });
      },
    }),
    AIConnectionError,
  );
  assert.deepEqual([...calls], [AI_ENDPOINTS.deepseek]);
});

test("all providers failing gives a safe error without keys, prompts or bodies", async () => {
  await assert.rejects(
    connectedAIJSON(config(), {
      ...options,
      system: "secret system prompt",
      transport: async (_url, init) => {
        // A network failure whose message carries the key must not escape.
        if (auth(init).includes("groq-1"))
          throw new TypeError("fetch failed " + auth(init));
        return new Response("upstream body with " + auth(init), {
          status: 401,
        });
      },
    }),
    (error) => {
      assert.ok(error instanceof AIConnectionError);
      assert.doesNotMatch(
        String(error) + JSON.stringify(error),
        /synthetic|secret system prompt|upstream body/,
      );
      return true;
    },
  );
});

test("an over-long input or a cancelled caller does not try the next provider", async () => {
  let calls = 0;
  await assert.rejects(
    connectedAIJSON(config(), {
      ...options,
      input: { text: "x".repeat(20000) },
      transport: async () => {
        calls++;
        return ok("{}");
      },
    }),
    (error) => error instanceof AIConnectionError && error.status === 413,
  );
  assert.equal(calls, 0);
  const controller = new AbortController();
  await assert.rejects(
    connectedAIJSON(config(), {
      ...options,
      signal: controller.signal,
      transport: async () => {
        calls++;
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      },
    }),
    AIConnectionError,
  );
  assert.equal(calls, 1);
});

test("chatConnections lists DeepSeek first, then Groq keys with their extras", () => {
  const list = chatConnections(config());
  assert.deepEqual(
    list.map((c) => [c.url, c.key, c.model]),
    [
      [AI_ENDPOINTS.deepseek, "synthetic-deepseek-key", "deepseek-chat"],
      [AI_ENDPOINTS.groq, "synthetic-groq-1", "synthetic/groq"],
      [AI_ENDPOINTS.groq, "synthetic-groq-2", "synthetic/groq"],
    ],
  );
  assert.deepEqual(list[0].extra, {});
  assert.deepEqual(list[1].extra, { reasoning_effort: "low" });
  assert.equal(chatConnections(config({ deepseek: "" })).length, 2);
});

const agentInput = {
  history: [{ role: "user" as const, content: "Help me plan" }],
  brainstorm: "Personal statement",
};

test("agent falls back from DeepSeek to Groq and keeps the reply language", async () => {
  const calls: string[] = [];
  let system = "";
  const result = await runAgent({
    ...agentInput,
    connections: chatConnections(config()),
    language: "Russian",
    signal: AbortSignal.timeout(5000),
    transport: async (url, init) => {
      calls.push(String(url));
      system = JSON.parse(init!.body as string).messages[0].content;
      return calls.length === 1
        ? new Response("quota", { status: 402 })
        : Response.json({
            choices: [{ message: { content: " Привет " } }],
          });
    },
  });
  assert.deepEqual([...calls], [AI_ENDPOINTS.deepseek, AI_ENDPOINTS.groq]);
  assert.equal(result.reply, "Привет");
  assert.match(system, /Write your replies in Russian/);
});

test("agent errors never contain provider bodies, JSON parser snippets or keys", async () => {
  await assert.rejects(
    runAgent({
      ...agentInput,
      connections: chatConnections(config()),
      signal: AbortSignal.timeout(5000),
      transport: async (_url, init) =>
        auth(init).includes("deepseek")
          ? new Response("<html>synthetic-deepseek-key leaked</html>")
          : Promise.reject(new TypeError("fetch failed " + auth(init))),
    }),
    (error: Error) => {
      assert.equal(error.message, "The AI could not answer. Please retry.");
      return true;
    },
  );
});

test("fitStudentAIResult trims a non-strict reply to the published limits", () => {
  const fitted = fitStudentAIResult({
    summary: "  " + "s".repeat(2000) + "  ",
    strengths: ["a", "", 7, ...Array(8).fill("b".repeat(500))],
    next_steps: [
      { title: "t".repeat(150), detail: "d".repeat(700), extra: true },
      { title: "", detail: "dropped" },
      "not an object",
      ...Array(8).fill({ title: "x", detail: "y" }),
    ],
    practice_questions: "not a list",
    evidence_ids: Array(30).fill("id"),
    limitations: ["Not an admission decision."],
    unexpected_key: "removed",
  }) as Record<string, unknown[]> & { summary: string };
  assert.equal(fitted.summary.length, 1600);
  assert.equal(fitted.strengths.length, 5);
  assert.equal(fitted.strengths[0], "a");
  assert.ok((fitted.strengths as string[]).every((s) => s.length <= 400));
  assert.equal(fitted.next_steps.length, 6);
  assert.deepEqual(fitted.next_steps[0], {
    title: "t".repeat(100),
    detail: "d".repeat(600),
  });
  assert.deepEqual(fitted.practice_questions, []);
  assert.equal(fitted.evidence_ids.length, 20);
  assert.equal("unexpected_key" in fitted, false);
  assert.equal(studentAIResult.safeParse(fitted).success, true);
  // Missing required content still fails strict validation afterwards.
  assert.equal(
    studentAIResult.safeParse(fitStudentAIResult({ summary: "x" })).success,
    false,
  );
  assert.equal(fitStudentAIResult(null), null);
  assert.deepEqual(fitStudentAIResult([1]), [1]);
});

const studentResult = {
  summary: "Review the course context.",
  strengths: [],
  next_steps: [{ title: "Confirm intake", detail: "Use the official page." }],
  practice_questions: [],
  evidence_ids: [],
  limitations: ["Not an admission decision."],
};
function studentRequest(body: unknown) {
  return new Request("https://college.example/api/student-ai", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://college.example",
    },
    body: JSON.stringify(body),
  });
}
function studentDeps(onSystem: (system: string) => void) {
  const deps: StudentAIHandlerDependencies = {
    sameOrigin: () => true,
    authenticate: async () => ({
      owner: "synthetic",
      consumeLimit: async () => true,
    }),
    configured: () => true,
    evidence: async () => [],
    generate: async (system, input) => {
      onSystem(system);
      assert.equal("language" in (input as object), false);
      return studentResult;
    },
  };
  return deps;
}
const studentBody = {
  mode: "essay_feedback",
  text: "My synthetic essay draft.",
  consent: true,
};

test("student AI asks the model to answer in the chosen language", async () => {
  let system = "";
  const response = await handleStudentAI(
    studentRequest({ ...studentBody, language: "uz" }),
    studentDeps((s) => (system = s)),
  );
  assert.equal(response.status, 200);
  assert.match(system, /Write every text value in Uzbek;/);
  for (const body of [studentBody, { ...studentBody, language: "en" }]) {
    await handleStudentAI(
      studentRequest(body),
      studentDeps((s) => (system = s)),
    );
    assert.doesNotMatch(system, /Write every text value in/);
  }
});

test("student AI rejects an unknown language before calling a provider", async () => {
  let called = false;
  for (const language of ["fr", "EN", "en; drop", 1]) {
    const response = await handleStudentAI(
      studentRequest({ ...studentBody, language }),
      studentDeps(() => (called = true)),
    );
    assert.equal(response.status, 400);
  }
  assert.equal(called, false);
});

test("isLang, languageName and resolveLang", () => {
  for (const code of ["en", "uz", "ru", "es", "de", "zh"])
    assert.equal(isLang(code), true);
  for (const value of ["", "EN", "fr", "english", null, undefined, 1, ["en"]])
    assert.equal(isLang(value), false);
  assert.equal(languageName("zh"), "Simplified Chinese");
  assert.equal(languageName("xx"), "English");
  assert.equal(languageName(undefined), "English");
  // A saved cookie wins over the browser list.
  assert.equal(resolveLang("de", "ru-RU,ru;q=0.9"), "de");
  // An invalid cookie falls through to Accept-Language in order.
  assert.equal(resolveLang("fr", "fr-FR, ES;q=0.8, ru;q=0.5"), "es");
  assert.equal(resolveLang(undefined, "zh-CN,zh;q=0.9"), "zh");
  // q=0 means "not acceptable".
  assert.equal(resolveLang(null, "ru;q=0, de;q=0.5"), "de");
  assert.equal(resolveLang(null, "ru;q=0.0"), "en");
  assert.equal(resolveLang(null, ""), "en");
  assert.equal(resolveLang(null, null), "en");
  assert.equal(resolveLang(null, "x".repeat(100000) + ",ru"), "en");
});
