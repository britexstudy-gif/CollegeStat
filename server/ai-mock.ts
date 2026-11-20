/** DEV ONLY. A scripted stand-in for the model so the assistant UI can be
 * exercised and screenshotted without a key or a signed-in account. The route
 * only reaches this behind `import.meta.env.DEV` and an explicit request
 * header; production builds compile that branch away. The tools it calls are
 * the real ones, so every card shows real catalogue data. */

export const DEV_PROFILE = {
  countries: ["KR", "DE"],
  budget: 12000,
  field: "Computer Science",
  intake: {
    english_test: "ielts",
    english_score: 6.5,
    sat: 1380,
    start_year: 2027,
    details: { home_country: "UZ", english_status: "taken", sat_status: "taken", sat_score: 1380, subjects: ["Computer Science"], funding: "partial" },
  },
};

type Msg = { role: string; content?: string | null; tool_calls?: unknown[] };
const sse = (chunks: unknown[], delay = 0) => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(c) {
        for (const chunk of chunks) {
          if (delay) await new Promise((r) => setTimeout(r, delay));
          c.enqueue(encoder.encode("data: " + JSON.stringify(chunk) + "\n\n"));
        }
        c.enqueue(encoder.encode("data: [DONE]\n\n"));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
};
const calls = (list: [string, Record<string, unknown>][]) =>
  sse(list.map(([name, args], index) => ({ choices: [{ delta: { tool_calls: [{ index, id: "mock_" + name + index, function: { name, arguments: JSON.stringify(args) } }] } }] })), 120);
const text = (s: string) => sse((s.match(/.{1,14}/gs) || []).map((content) => ({ choices: [{ delta: { content } }] })), 25);

export const scriptedModel: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body || "{}")) as { messages: Msg[] };
  const tools = body.messages.filter((m) => m.role === "tool");
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content || "";
  if (/agency|agent|агентств|guarantee|гарант/i.test(lastUser)) {
    if (!tools.length) return calls([["scam_check", { text: lastUser, universities: ["Seoul National University", "Global Elite University of Prague"] }]]);
    return text(
      "I checked the offer against CollegeStat.\n\n- **Guaranteed admission** isn't something any agency can promise: only the university decides.\n- **A fee to apply for a scholarship** is a red flag. Official scholarships are free to apply for on the provider's own site.\n\n[Seoul National University](/dashboard/university/seoul-national-university-6a9e2556) is in CollegeStat. The second name isn't, so check it in the national accreditation register before paying anything.",
    );
  }
  const read = (i: number) => {
    try {
      return JSON.parse(tools[i]?.content || "{}");
    } catch {
      return {};
    }
  };
  if (!tools.length)
    return calls([
      ["get_profile", {}],
      ["search_universities", { country: "South Korea", major: "Computer Science", budget: 12000, sort: "rank" }],
    ]);
  const results = (read(1).results || []) as { slug: string; name: string }[];
  if (!results.length) return text("CollegeStat doesn't have universities matching these filters yet. Try a wider budget or another country.");
  if (tools.length === 2)
    return calls([
      ["estimate_chance", { slug: results[0].slug }],
      ...(results[1] ? ([["compare", { slugs: results.slice(0, 3).map((r) => r.slug) }]] as [string, Record<string, unknown>][]) : []),
    ]);
  if (tools.length <= 4 && !tools.some((t) => (t.content || "").includes('"proposed"')))
    return calls([
      ["add_to_my_colleges", { slug: results[0].slug, fit: "reach" }],
      ["create_deadline_plan", { slugs: results.slice(0, 3).map((r) => r.slug) }],
    ]);
  const [a, b] = results;
  return text(
    `Here's a first shortlist for **Computer Science in South Korea** within your $12,000 budget.\n\n- [${a.name}](/dashboard/university/${a.slug}) is the strongest option on rankings. With an IELTS 6.5 and SAT 1380 it is a **reach** for you.\n${b ? `- [${b.name}](/dashboard/university/${b.slug}) is a good second choice to compare.\n` : ""}\nI've prepared two things for you to confirm below: adding ${a.name} to **My colleges**, and a dated plan from the published deadlines.\n\nWant me to look for scholarships in Korea next, like the Global Korea Scholarship?`,
  );
};
