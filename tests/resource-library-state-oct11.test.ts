import test from "node:test";
import assert from "node:assert/strict";
import { learningResources } from "../lib/learning-resources";
import {
  admissionPlannerHref,
  admissionPlannerSection,
  checkedGuideSteps,
  guideProgressKey,
  reviewedLearningResources,
  prepareRehearsalOwner,
  decodeRehearsalSession,
} from "../lib/resource-library-state";
import { createLearningResourceRefresh } from "../services/learning-resources";

const catalogue = () => ({ resources: structuredClone(learningResources) });
const rehearsal = () => ({
  draft: {
    destination: "us-undergraduate",
    university: "Synthetic university",
    program: "Computer Science",
    qualification: "Synthetic diploma",
    intake: "Autumn 2027",
    completed: ["0", "0", "19"],
  },
  source_steps: learningResources.find((r) => r.slug === "us-undergraduate")!
    .steps,
});
test("rehearsal drafts survive remounts for the same owner but are cleared on A to B to A", () => {
  const map = new Map<string, string>([["unrelated-app-preference", "keep"]]);
  const storage = {
    get length() {
      return map.size;
    },
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    key: (index: number) => [...map.keys()][index] ?? null,
  };
  const A = "11111111-1111-4111-8111-111111111111",
    B = "22222222-2222-4222-8222-222222222222";
  const key = prepareRehearsalOwner(storage, A);
  storage.setItem(key, JSON.stringify(rehearsal()));
  assert.equal(prepareRehearsalOwner(storage, A), key);
  assert.equal(
    decodeRehearsalSession(storage.getItem(key), learningResources)?.university,
    "Synthetic university",
  );
  prepareRehearsalOwner(storage, B);
  assert.equal(storage.getItem(key), null);
  prepareRehearsalOwner(storage, A);
  assert.equal(storage.getItem(key), null);
  assert.equal(storage.getItem("unrelated-app-preference"), "keep");
});
test("rehearsal recovery validates every field and clears checks when official steps change", () => {
  const saved = rehearsal();
  assert.deepEqual(
    decodeRehearsalSession(JSON.stringify(saved), learningResources)?.completed,
    ["0"],
  );
  saved.source_steps = ["A changed official source step"];
  const restored = decodeRehearsalSession(
    JSON.stringify(saved),
    learningResources,
  );
  assert.deepEqual(restored?.completed, []);
  assert.equal(restored?.qualification, "Synthetic diploma");
  for (const modify of [
    (v: ReturnType<typeof rehearsal>) => {
      v.draft.destination = "unknown-guide";
    },
    (v: ReturnType<typeof rehearsal>) => {
      v.draft.qualification = "x".repeat(121);
    },
    (v: ReturnType<typeof rehearsal>) => {
      v.draft.completed = ["-1"];
    },
    (v: ReturnType<typeof rehearsal>) => {
      v.draft.program = {} as never;
    },
  ]) {
    const value = rehearsal();
    modify(value);
    assert.equal(
      decodeRehearsalSession(JSON.stringify(value), learningResources),
      null,
    );
  }
  for (const raw of ["invalid", "{}", "[]", "null", "x".repeat(16385)])
    assert.equal(decodeRehearsalSession(raw, learningResources), null);
});

test("the library begins with destination guidance and preserves explicit study and rehearsal links", () => {
  for (const value of [undefined, null, "", "unknown", ["practice"]])
    assert.equal(admissionPlannerSection(value), "destinations");
  assert.equal(admissionPlannerSection("practice"), "practice");
  assert.equal(admissionPlannerSection("application"), "application");
  assert.equal(admissionPlannerSection("destinations"), "destinations");
  assert.equal(
    admissionPlannerHref(
      "/dashboard/library/resources?university=university-one&view=sources&section=practice#handbook",
      "application",
    ),
    "/dashboard/library/resources?university=university-one&view=sources&section=application#handbook",
  );
});
test("guide progress is isolated between signed-in owners and anonymous visitors", () => {
  const A = "11111111-1111-4111-8111-111111111111",
    B = "22222222-2222-4222-8222-222222222222";
  const known = [
    "Get transcripts",
    "Check the official deadline",
    "Request recommendations",
  ];
  const storage = new Map([
    [guideProgressKey(A, "applications"), JSON.stringify([known[0]])],
    ["college-guide:applications", JSON.stringify(known)],
  ]);
  assert.deepEqual(
    checkedGuideSteps(
      storage.get(guideProgressKey(A, "applications")) ?? null,
      known,
    ),
    [known[0]],
  );
  assert.deepEqual(
    checkedGuideSteps(
      storage.get(guideProgressKey(B, "applications")) ?? null,
      known,
    ),
    [],
  );
  assert.deepEqual(
    checkedGuideSteps(
      storage.get(guideProgressKey(null, "applications")) ?? null,
      known,
    ),
    [],
  );
  assert.notEqual(
    guideProgressKey(A, "applications"),
    guideProgressKey(A, "funding"),
  );
});
test("restored progress contains only current known steps in their source order", () => {
  const known = ["One", "Two", "Three"];
  assert.deepEqual(
    checkedGuideSteps('["Two","Unknown","One","Two",3,null]', known),
    ["One", "Two"],
  );
  for (const raw of [
    "invalid",
    "{}",
    "null",
    JSON.stringify(Array(101).fill("One")),
    "x".repeat(16385),
  ])
    assert.deepEqual(checkedGuideSteps(raw, known), []);
  assert.deepEqual(checkedGuideSteps('["Old step"]', known), []);
});
test("checked source metadata validates without silently admitting malformed or imported content", () => {
  assert.equal(reviewedLearningResources(catalogue()).length, 19);
  const modifications = [
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].url = "javascript:alert(1)";
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].url = "https://user:password@example.org/";
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].evidence.source_url = "https://other.example.org/";
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].evidence.content_imported = true;
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].evidence.question_count = 20;
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].evidence.scope = "Different population";
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].verification_state = "needs_review";
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].retrieved_at = "unknown";
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].steps = [null] as never;
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[0].summary = "x".repeat(5001);
    },
    (v: ReturnType<typeof catalogue>) => {
      v.resources[1].id = v.resources[0].id;
    },
  ];
  for (const modify of modifications) {
    const value = catalogue();
    modify(value);
    assert.throws(() => reviewedLearningResources(value), /verified/);
  }
  for (const value of [
    null,
    [],
    { resources: [] },
    { resources: [null] },
    { resources: "invalid" },
  ])
    assert.throws(() => reviewedLearningResources(value));
});
test("a successful bounded refresh returns reviewed links without modifying the installed catalogue", async () => {
  const initial = JSON.stringify(learningResources);
  let captured: RequestInit | undefined;
  const refresh = createLearningResourceRefresh({
    fetch: async (input, init) => {
      assert.equal(input, "/api/learning-resources");
      captured = init;
      return Response.json(catalogue());
    },
  });
  const rows = await refresh();
  assert.equal(rows.length, 19);
  assert.equal(JSON.stringify(learningResources), initial);
  assert.equal(
    captured?.signal?.aborted,
    true,
    "request cleaned up after completion",
  );
});
test("a partial refresh preserves destination guidance and cannot roll back a newer installed source", async () => {
  const old = structuredClone(learningResources[0]);
  old.retrieved_at = "2025-01-01T00:00:00Z";
  old.evidence.retrieved_at = old.retrieved_at;
  old.summary = "Older reviewed synopsis";
  const rows = await createLearningResourceRefresh({
    fetch: async () => Response.json({ resources: [old] }),
  })();
  assert.equal(rows.length, learningResources.length);
  assert.equal(
    rows.find((r) => r.slug === old.slug)?.summary,
    learningResources[0].summary,
  );
  assert.equal(rows.filter((r) => r.kind === "destination").length, 11);
});
for (const stage of ["fetch", "body"] as const)
  test(`resource refresh ${stage} stall settles with one deadline even when cancellation is ignored`, async () => {
    let captured: AbortSignal | null | undefined;
    const refresh = createLearningResourceRefresh({
      timeoutMs: 5,
      fetch: async (_input, init) => {
        captured = init?.signal;
        if (stage === "fetch") return new Promise<never>(() => {});
        return new Response(
          new ReadableStream<Uint8Array>({
            pull: () => new Promise<never>(() => {}),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    });
    await assert.rejects(refresh(), /took too long/);
    assert.equal(captured?.aborted, true);
  });
test("leaving the library cancels a refresh before a late response can replace resources", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const dispatch = new Promise<void>((resolve) => {
    started = resolve;
  });
  let reply!: (r: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    reply = resolve;
  });
  const refresh = createLearningResourceRefresh({
    fetch: async () => {
      started();
      return delayed;
    },
  });
  const pending = refresh(controller.signal);
  await dispatch;
  controller.abort(new Error("Left library"));
  await assert.rejects(pending, /Left library/);
  reply(Response.json(catalogue()));
});
test("an already cancelled refresh never dispatches", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Cancelled owner"));
  let requests = 0;
  const refresh = createLearningResourceRefresh({
    fetch: async () => {
      requests++;
      return Response.json(catalogue());
    },
  });
  await assert.rejects(refresh(controller.signal), /Cancelled owner/);
  assert.equal(requests, 0);
});
test("503, empty, malformed and oversized updates reject so the installed fallback remains visible", async () => {
  const cases = [
    new Response("Unavailable", { status: 503 }),
    Response.json({ resources: [] }),
    new Response("not JSON"),
    new Response(null),
    Response.json(catalogue(), { headers: { "Content-Length": "9999999" } }),
    Response.json(catalogue(), { headers: { "Content-Length": "bad" } }),
  ];
  const installed = JSON.stringify(learningResources);
  for (const response of cases) {
    const refresh = createLearningResourceRefresh({
      fetch: async () => response,
    });
    await assert.rejects(refresh());
    assert.equal(JSON.stringify(learningResources), installed);
  }
  const chunks = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(80));
        controller.enqueue(new Uint8Array(80));
        controller.close();
      },
    }),
  );
  await assert.rejects(
    createLearningResourceRefresh({
      maxBytes: 100,
      fetch: async () => chunks,
    })(),
    /too large/,
  );
});
