// Read-only integration check. MFA denial is tested before any mutation can execute.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const values = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split("\n")
    .filter((line) => line.startsWith("NEXT_PUBLIC_SUPABASE_"))
    .map((line) => {
      const pos = line.indexOf("=");
      return [
        line.slice(0, pos),
        line.slice(pos + 1).replace(/^['\"]|['\"]$/g, ""),
      ];
    }),
);
const account = JSON.parse(
  await readFile("outputs/review-account.json", "utf8"),
);
const db = createClient(
  values.NEXT_PUBLIC_SUPABASE_URL,
  values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const login = await db.auth.signInWithPassword({
  email: account.email,
  password: account.password,
});
assert.equal(login.error, null, "review login");
const headers = {
  "Content-Type": "application/json",
  Origin: base,
  Accept: "application/json, text/event-stream",
  Authorization: "Bearer " + login.data.session.access_token,
};
const request = (path, body, extra = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { ...headers, ...extra },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
const rpc = async (method, params) => {
  const response = await request("/api/staff/mcp", {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });
  assert.equal(response.status, 200, method);
  const data = await response.json();
  assert.equal(data.error, undefined, method);
  assert.notEqual(data.result.isError, true, method);
  return data.result;
};
assert.equal(
  (
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "staff-smoke", version: "1" },
    })
  ).protocolVersion,
  "2025-06-18",
);
assert.equal((await rpc("tools/list")).tools.length, 5);
const universities = (
  await rpc("tools/call", {
    name: "search_universities",
    arguments: { query: "Massachusetts Institute of Technology", limit: 5 },
  })
).structuredContent.data;
const acronym = (
  await rpc("tools/call", {
    name: "search_universities",
    arguments: { query: "MIT", limit: 5 },
  })
).structuredContent.data;
assert.equal(acronym[0].slug, "mit", "MCP uses alias-aware catalogue search");
assert.ok(universities.length > 0);
const university = universities.find((u) => u.slug === "mit");
assert.ok(university);
const coverage = (
  await rpc("tools/call", {
    name: "university_coverage",
    arguments: { university_id: university.id },
  })
).structuredContent.data;
assert.equal(coverage.university.id, university.id);
assert.equal(coverage.categories.length, 8);
assert.ok(coverage.requirement_evidence.length > 0);
assert.ok(
  (
    await rpc("tools/call", {
      name: "list_sources",
      arguments: { query: "", limit: 3 },
    })
  ).structuredContent.data.length > 0,
);
await rpc("tools/call", {
  name: "review_queue",
  arguments: { status: "pending", limit: 3 },
});
const write = await request("/api/staff/mcp", {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: { name: "stage_observations", arguments: {} },
});
assert.equal(
  write.status,
  403,
  "MFA protects staging before arguments are processed",
);
assert.equal(
  (
    await request("/api/admin", {
      action: "save",
      entity: "universities",
      record: {},
    })
  ).status,
  403,
  "MFA protects legacy admin API too",
);
const cross = await request(
  "/api/staff/mcp",
  { jsonrpc: "2.0", id: 1, method: "tools/list" },
  { Origin: "https://untrusted.example" },
);
assert.equal(cross.status, 403);
const anonymous = await fetch(base + "/api/staff/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: "{}",
});
assert.equal(anonymous.status, 401);
const unknown = await rpc("tools/call", {
  name: "search_universities",
  arguments: { query: "xyzxyzxyzxyzxyzxyzxyzxy9", limit: 1 },
});
assert.equal(unknown.structuredContent.data.length, 0);
const assistant = await request("/api/staff/assistant", {
  question: "Inspect coverage",
  university_id: university.id,
});
assert.equal(assistant.status, 200);
const answer = await assistant.json();
assert.equal(answer.tool, "university_coverage");
assert.equal(answer.data.university.id, university.id);
for (const path of [
  "/staff/college-console/mcp",
  "/staff/college-console/coverage",
  "/staff/college-console/security",
]) {
  assert.equal((await fetch(base + path)).status, 200);
}
await db.auth.signOut();
console.log(
  "PASS real staff login; MCP initialization, discovery, four read tools, assistant; MFA and origin denial; hidden workspace routes.",
);
