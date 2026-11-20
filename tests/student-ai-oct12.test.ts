import test from "node:test";
import assert from "node:assert/strict";
import {
  handleStudentAI,
  type StudentAIHandlerDependencies,
} from "../server/student-ai-handler";
import { openRouterJSON } from "../services/openrouter-provider";
import { studentAIInput } from "../lib/student-ai";
const valid = {
  mode: "application_review",
  text: "My synthetic application plan.",
  consent: true,
};
const result = {
  summary: "Review the course context.",
  strengths: [],
  next_steps: [
    { title: "Confirm your intake", detail: "Use the official course page." },
  ],
  practice_questions: [],
  evidence_ids: ["known", "invented", "known"],
  limitations: ["Not an admission decision."],
};
function request(body: unknown = valid) {
  return new Request("https://college.example/api/student-ai", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://college.example",
    },
    body: JSON.stringify(body),
  });
}
function dependencies(overrides: Partial<StudentAIHandlerDependencies> = {}) {
  let calls = 0;
  const deps: StudentAIHandlerDependencies = {
    sameOrigin: () => true,
    authenticate: async () => ({
      owner: "synthetic-account",
      consumeLimit: async () => true,
    }),
    configured: () => true,
    evidence: async () => [
      {
        id: "known",
        title: "Official evidence",
        detail: "Source scoped fact.",
        url: "https://example.edu/admissions",
        reporting_year: 2026,
        population: "Specified course",
      },
    ],
    generate: async (_system, input) => {
      calls++;
      assert.equal((input as { text: string }).text, valid.text);
      assert.equal("owner" in (input as object), false);
      return result;
    },
    ...overrides,
  };
  return { deps, calls: () => calls };
}
test("student AI rejects anonymous requests before reading private input or calling a provider", async () => {
  const d = dependencies({
    authenticate: async () => null,
    evidence: async () => {
      throw Error("Must not read");
    },
  });
  const response = await handleStudentAI(request(), d.deps);
  assert.equal(response.status, 401);
  assert.equal(d.calls(), 0);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("student AI requires origin, explicit consent, bounded input and a known mode", async () => {
  for (const input of [
    { ...valid, consent: false },
    { ...valid, mode: "admin_sql" },
    { ...valid, text: "x".repeat(8001) },
    { ...valid, private_profile_id: "another-user" },
  ]) {
    const d = dependencies();
    assert.equal((await handleStudentAI(request(input), d.deps)).status, 400);
    assert.equal(d.calls(), 0);
  }
  const d = dependencies({ sameOrigin: () => false });
  assert.equal((await handleStudentAI(request(), d.deps)).status, 403);
  assert.equal(d.calls(), 0);
});
test("student AI fails closed on unavailable configuration or quota", async () => {
  for (const [override, status] of [
    [{ configured: () => false }, 503],
    [
      {
        authenticate: async () => ({
          owner: "synthetic-account",
          consumeLimit: async () => false,
        }),
      },
      429,
    ],
  ] as const) {
    const d = dependencies(override);
    assert.equal((await handleStudentAI(request(), d.deps)).status, status);
    assert.equal(d.calls(), 0);
  }
});
test("student AI keeps only server-owned evidence IDs and never appends private profile fields", async () => {
  const d = dependencies();
  const response = await handleStudentAI(request(), d.deps);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    result: { evidence_ids: string[] };
    evidence: unknown[];
    private_records_attached: boolean;
  };
  assert.deepEqual(body.result.evidence_ids, ["known"]);
  assert.equal(body.evidence.length, 1);
  assert.equal(body.private_records_attached, false);
  assert.equal(d.calls(), 1);
});
test("student AI rejects malformed model feedback instead of displaying unverified success", async () => {
  const d = dependencies({
    generate: async () => ({ summary: "invented", acceptance_probability: 99 }),
  });
  const response = await handleStudentAI(request(), d.deps);
  assert.equal(response.status, 503);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /could not be verified/,
  );
});
test("student AI rejects dishonest dates/modes/extra personal data at its request boundary", () => {
  assert.equal(
    studentAIInput.safeParse({ ...valid, certificate: "fake-certificate" })
      .success,
    false,
  );
  assert.equal(
    studentAIInput.safeParse({ ...valid, all_private_essays: true }).success,
    false,
  );
  assert.equal(
    studentAIInput.safeParse({ ...valid, university_id: "not-a-uuid" }).success,
    false,
  );
});
test("OpenRouter uses a fixed endpoint, private routing and bounded structured output", async () => {
  let captured: Record<string, unknown> | undefined;
  const transport: typeof fetch = async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(
      (options!.headers as Record<string, string>).Authorization,
      "Bearer synthetic-only-key",
    );
    captured = JSON.parse(options!.body as string);
    return Response.json({
      choices: [{ message: { content: '{"checked":true}' } }],
    });
  };
  const out = await openRouterJSON({
    key: "synthetic-only-key",
    model: "synthetic:free",
    system: "Rules",
    input: { text: "Synthetic practice" },
    schema: { type: "object" },
    name: "test",
    maxTokens: 99999,
    transport,
  });
  assert.deepEqual(out, { checked: true });
  assert.equal(captured!.max_tokens, 2000);
  assert.deepEqual(captured!.provider, {
    data_collection: "deny",
    require_parameters: true,
    max_price: { prompt: 0.15, completion: 0.6 },
  });
  assert.equal(JSON.stringify(captured).includes("synthetic-only-key"), false);
});
test("OpenRouter does not expose upstream bodies, keys or prompts on errors", async () => {
  const transport: typeof fetch = async () =>
    new Response("synthetic-only-key and private content", { status: 500 });
  await assert.rejects(
    openRouterJSON({
      key: "synthetic-only-key",
      model: "synthetic:free",
      system: "Rules",
      input: {},
      schema: {},
      name: "test",
      transport,
    }),
    (error) => {
      assert.doesNotMatch(String(error), /synthetic-only-key|private content/);
      return true;
    },
  );
});
test("OpenRouter cancels an oversized streaming result and rejects invalid JSON", async () => {
  for (const transport of [
    async () => new Response("x".repeat(100001)),
    async () =>
      Response.json({ choices: [{ message: { content: "not JSON" } }] }),
  ])
    await assert.rejects(
      openRouterJSON({
        key: "synthetic-only-key",
        model: "synthetic:free",
        system: "Rules",
        input: {},
        schema: {},
        name: "test",
        transport: transport as typeof fetch,
      }),
    );
});
