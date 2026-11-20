import test from "node:test";
import assert from "node:assert/strict";
import type { University } from "../lib/domain";
import type { Scholarship } from "../lib/scholarships-data";
import type { AssistantEvent } from "../lib/ai-assistant";
import { countryCodes, createAssistantTools, scamFlags, toolArgs, type ToolDeps } from "../server/ai-tools";
import { MAX_STEPS, markupFilter, runAssistant } from "../server/ai-agent";
import { AI_ENDPOINTS } from "../services/openrouter-provider";

// Synthetic records only; nothing touches the network or the database.
const uni = (slug: string, o: { rate?: number; fee?: number; sat?: [number, number]; ielts?: number; deadline?: string } = {}) =>
  ({
    id: "id-" + slug,
    slug,
    name: slug.toUpperCase() + " University",
    short_name: null,
    city: "Seoul",
    country_code: "KR",
    website: "https://" + slug + ".example",
    logo_url: null,
    data_points: [],
    imported_records: [],
    rankings: [],
    ranking_entries: [],
    university_programs: [],
    admissions:
      o.rate != null || o.sat
        ? [{ id: "a", year: 2025, program_id: null, acceptance_rate: o.rate ?? null, sat_min: o.sat?.[0] ?? null, sat_max: o.sat?.[1] ?? null }]
        : [],
    costs: o.fee ? [{ id: "c", year: 2025, program_id: null, category: "tuition", period: "year", student_category: "international", amount: o.fee, currency: "USD" }] : [],
    requirements: o.ielts ? [{ id: "r", year: 2025, kind: "IELTS", label: "IELTS", minimum: o.ielts, program_id: null }] : [],
    deadlines: o.deadline
      ? [{ id: "d", year: 2026, title: "Regular decision", due_at: o.deadline, timezone: "UTC", cycle: "2027", student_category: "international", verification_status: "verified", source_url: "https://" + slug + ".example/apply", application_url: "" }]
      : [],
  }) as unknown as University;

const KAIST = uni("kaist", { rate: 12, fee: 8000, sat: [1450, 1550], ielts: 6.5, deadline: "2027-01-10" });
const SNU = uni("snu", { rate: 45, fee: 6000, ielts: 6, deadline: "2027-02-01" });
const prefs = {
  countries: ["KR"],
  budget: 10000,
  intake: { english_test: "ielts", english_score: 6.5, sat: 1380, details: { home_country: "UZ", english_status: "taken", sat_status: "taken", sat_score: 1380 } },
};
const scholarship = (slug: string, country: string, o: Partial<Scholarship> = {}) =>
  ({ slug, name: slug, provider: "Gov", description: null, covers: null, funding: "full", fundingKind: "full", country, level: "Bachelor", eligibleText: null, openToAll: false, eligibleCodes: ["UZ"], eligibility: [], deadline: "2027-03-01", deadlineNote: null, timeline: [], steps: [], documents: [], applicationUrl: "https://gov.example", sourceUrl: null, checkedAt: null, universities: [], year: 2026, ...o }) as Scholarship;

function deps(over: Partial<ToolDeps> = {}) {
  const seen: { filters: unknown[] } = { filters: [] };
  const d: ToolDeps = {
    explore: async (f) => (seen.filters.push(f), [KAIST, SNU]),
    search: async (q) => [KAIST, SNU].filter((u) => u.name.toLowerCase().includes(q.toLowerCase().split(" ")[0])),
    university: async (s) => [KAIST, SNU].find((u) => u.slug === s) || null,
    scholarships: async () => [scholarship("gks", "KR"), scholarship("kz-only", "KR", { eligibleCodes: ["KZ"] }), scholarship("de", "DE")],
    preferences: async () => prefs,
    newId: () => "proposal-1",
    today: () => "2026-11-15",
    ...over,
  };
  return { d, seen };
}
const ctx = { signal: AbortSignal.timeout(5000), language: "English" };

test("search_universities maps model filters to catalogue filters and labels chances from the profile", async () => {
  const { d, seen } = deps();
  const out = await createAssistantTools(d).run("search_universities", JSON.stringify({ country: "South Korea", major: "Computer Science", budget: 10000, ielts: 6.5 }), ctx);
  assert.equal(out.ok, true);
  assert.deepEqual(seen.filters[0], { q: "", country: "KR", field: "Computer Science", cost_max: 10000, ielts_max: 6.5, sort: "rank" });
  assert.equal(out.card?.kind, "universities");
  if (out.card?.kind !== "universities") return;
  const [k] = out.card.items;
  assert.equal(k.slug, "kaist");
  assert.deepEqual(k.stats.map((s) => s.k), ["tuition", "admission", "ielts"]);
  // 12% admit rate is always a reach (lib/admissions-check categoryFor).
  assert.equal(k.chance, "reach");
  const result = out.result as { results: { page: string }[] };
  assert.equal(result.results[0].page, "/dashboard/university/kaist");
});

test("tool arguments are validated: bad slugs, unknown tools and broken JSON never reach the data layer", async () => {
  let called = false;
  const { d } = deps({ university: async () => ((called = true), null) });
  const tools = createAssistantTools(d);
  assert.equal((await tools.run("get_university", '{"slug":"../etc/passwd"}', ctx)).ok, false);
  assert.equal((await tools.run("get_university", "{not json", ctx)).ok, false);
  assert.equal((await tools.run("drop_tables", "{}", ctx)).ok, false);
  assert.equal(called, false);
  assert.equal(toolArgs.compare.safeParse({ slugs: ["a"] }).success, false);
  assert.deepEqual(countryCodes("Korea, Германия, uk"), ["KR", "DE", "GB"]);
});

test("unknown universities are reported, not invented", async () => {
  const out = await createAssistantTools(deps().d).run("get_university", '{"slug":"atlantis-tech"}', ctx);
  assert.equal(out.ok, false);
  assert.match(JSON.stringify(out.result), /No university/);
  assert.equal(out.card, undefined);
});

test("get_profile never sends name or email to the model", async () => {
  const { d } = deps({ preferences: async () => ({ ...prefs, display_name: "Secret Name", email: "a@b.c" }) });
  const out = await createAssistantTools(d).run("get_profile", "{}", ctx);
  const text = JSON.stringify(out.result);
  assert.doesNotMatch(text, /Secret Name|a@b\.c/);
  assert.match(text, /Uzbekistan/);
  assert.match(text, /South Korea/);
});

test("estimate_chance reuses the shared chance logic and says what is missing", async () => {
  const out = await createAssistantTools(deps().d).run("estimate_chance", '{"slug":"snu"}', ctx);
  assert.equal(out.card?.kind, "chance");
  if (out.card?.kind !== "chance") return;
  assert.equal(out.card.category, "target");
  assert.equal(out.card.english?.meets, true);
  assert.deepEqual(out.card.missing, []);
});

test("write tools only propose: add_to_my_colleges and create_deadline_plan return cards and write nothing", async () => {
  const tools = createAssistantTools(deps().d);
  const add = await tools.run("add_to_my_colleges", '{"slug":"kaist","fit":"reach"}', ctx);
  if (add.card?.kind !== "add") return assert.fail("no add card");
  assert.equal(add.card.proposal, "proposal-1");
  assert.equal(add.card.university.id, "id-kaist");
  assert.equal(add.card.fit, "reach");
  assert.match(JSON.stringify(add.result), /Nothing is saved yet/);
  const plan = await tools.run("create_deadline_plan", '{"slugs":["kaist","snu"]}', ctx);
  assert.equal(plan.card?.kind, "plan");
  if (plan.card?.kind !== "plan") return;
  assert.deepEqual(
    plan.card.items.map((i) => [i.date, i.kind]),
    [
      ["2026-12-20", "prep"],
      ["2027-01-10", "deadline"],
      ["2027-01-11", "prep"],
      ["2027-02-01", "deadline"],
    ],
  );
  assert.equal(plan.card.items[1].source_url, "https://kaist.example/apply");
});

test("find_scholarships keeps only awards the student's home country can apply for", async () => {
  const out = await createAssistantTools(deps().d).run("find_scholarships", '{"country":"KR"}', ctx);
  assert.equal(out.card?.kind, "scholarships");
  if (out.card?.kind !== "scholarships") return;
  assert.deepEqual(out.card.items.map((s) => s.slug), ["gks"]);
});

test("scam_check flags common agency red flags in English, Russian and Uzbek and checks named universities", async () => {
  const ids = (t: string) => scamFlags(t).map((f) => f.id).sort();
  assert.deepEqual(ids("We offer guaranteed admission to KAIST. Pay a $500 fee for the scholarship application."), ["guarantee", "paid_scholarship"]);
  assert.deepEqual(ids("Гарантия поступления! Оплата 300$ за грант, переведите на карту."), ["guarantee", "paid_scholarship", "personal_payment"]);
  assert.deepEqual(ids("Qabul kafolatlanadi, IELTSsiz o'qish"), ["guarantee", "no_test"]);
  assert.deepEqual(ids("Full 100% scholarship available, apply on the official site."), []);
  const out = await createAssistantTools(deps().d).run("scam_check", JSON.stringify({ text: "Guaranteed admission to KAIST and Fakeville Institute", universities: ["KAIST", "Fakeville Institute"] }), ctx);
  if (out.card?.kind !== "scam") return assert.fail("no scam card");
  assert.deepEqual(out.card.universities.map((u) => u.found), [true, false]);
});

/* ── The loop, with a mocked model ─────────────────────────────────── */

const sse = (chunks: unknown[]) =>
  new Response(chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
const toolCall = (name: string, args: object, index = 0) => ({ choices: [{ delta: { tool_calls: [{ index, id: "c" + name, function: { name, arguments: JSON.stringify(args) } }] } }] });
const words = (...parts: string[]) => parts.map((content) => ({ choices: [{ delta: { content } }] }));
const connections = [
  { url: AI_ENDPOINTS.deepseek, key: "synthetic-deepseek", model: "deepseek-chat", extra: {} },
  { url: AI_ENDPOINTS.groq, key: "synthetic-groq", model: "groq", extra: { reasoning_effort: "low" } },
];

test("multi-step run: streams steps, cards and text, sends tool results back, answers in the UI language", async () => {
  const bodies: { messages: { role: string; content: string }[]; stream: boolean; tools?: unknown[] }[] = [];
  const events: AssistantEvent[] = [];
  const script = [
    sse([toolCall("get_profile", {}), toolCall("search_universities", { country: "KR" }, 1)]),
    sse([toolCall("estimate_chance", { slug: "kaist" })]),
    sse(words("KAIST ", "is a [reach](/dashboard/university/kaist).")),
  ];
  await runAssistant({
    connections,
    language: "Russian",
    history: [{ role: "user", content: "Найди вузы в Корее" }],
    tools: createAssistantTools(deps().d),
    emit: (e) => events.push(e),
    signal: AbortSignal.timeout(5000),
    transport: async (_u, init) => (bodies.push(JSON.parse(String(init!.body))), script[bodies.length - 1]),
  });
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0].stream, true);
  assert.ok(bodies[0].tools?.length);
  assert.match(bodies[0].messages[0].content, /Reply in Russian/);
  assert.match(bodies[0].messages[0].content, /Never invent/);
  assert.deepEqual(bodies[1].messages.filter((m) => m.role === "tool").length, 2);
  assert.deepEqual(
    events.map((e) => e.t),
    ["step", "step_done", "step", "step_done", "card", "step", "step_done", "card", "text", "text", "done"],
  );
  assert.deepEqual(events[2], { t: "step", id: "s2", tool: "search_universities", args: { where: "South Korea" } });
  assert.equal(events.filter((e) => e.t === "text").map((e) => (e as { d: string }).d).join(""), "KAIST is a [reach](/dashboard/university/kaist).");
});

test("the loop stops after MAX_STEPS and the last turn is sent without tools", async () => {
  let turns = 0;
  let lastHadTools = true;
  const events: AssistantEvent[] = [];
  await runAssistant({
    connections,
    language: "English",
    history: [{ role: "user", content: "loop" }],
    tools: createAssistantTools(deps().d),
    emit: (e) => events.push(e),
    signal: AbortSignal.timeout(5000),
    transport: async (_u, init) => {
      turns++;
      lastHadTools = !!JSON.parse(String(init!.body)).tools;
      return lastHadTools ? sse([toolCall("get_profile", {})]) : sse(words("Done."));
    },
  });
  assert.equal(turns, MAX_STEPS);
  assert.equal(lastHadTools, false);
  assert.equal(events.at(-1)?.t, "done");
});

test("falls back to Groq before anything streamed; errors are fixed codes without provider text or keys", async () => {
  const calls: string[] = [];
  const events: AssistantEvent[] = [];
  await runAssistant({
    connections,
    language: "English",
    history: [{ role: "user", content: "hi" }],
    tools: createAssistantTools(deps().d),
    emit: (e) => events.push(e),
    signal: AbortSignal.timeout(5000),
    transport: async (url) => (calls.push(String(url)), calls.length === 1 ? new Response("synthetic-deepseek leaked", { status: 402 }) : sse(words("Hello"))),
  });
  assert.deepEqual(calls, [AI_ENDPOINTS.deepseek, AI_ENDPOINTS.groq]);
  assert.deepEqual(events.at(-1), { t: "done" });

  const failed: AssistantEvent[] = [];
  await runAssistant({
    connections,
    language: "English",
    history: [{ role: "user", content: "hi" }],
    tools: createAssistantTools(deps().d),
    emit: (e) => failed.push(e),
    signal: AbortSignal.timeout(5000),
    transport: async () => new Response("<html>synthetic-groq</html>", { status: 429 }),
  });
  assert.deepEqual(failed, [{ t: "error", code: "busy" }]);
});

test("tool-call markup the model writes as text is never shown, even split across chunks", () => {
  const out: string[] = [];
  const f = markupFilter((d) => out.push(d));
  for (const d of ["Let me retry. <", "｜｜DSML｜｜ calls>", "<｜｜DSML｜｜ invoke>"]) f.push(d);
  f.end();
  assert.equal(out.join(""), "Let me retry. ");
  const plain: string[] = [];
  const g = markupFilter((d) => plain.push(d));
  g.push("a < b and 3 <");
  g.push(" 4");
  g.end();
  assert.equal(plain.join(""), "a < b and 3 < 4");
});
