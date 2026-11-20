import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatchMCP,
  adminTools,
  parseTool,
  MCP_VERSION,
} from "../lib/admin-mcp";
import { localPlanDate, plannerWeek } from "../lib/workspace-planner";
test("MCP initialization and discovery expose only bounded catalogue tools", async () => {
  const never = async () => {
    throw new Error("Unexpected execution");
  };
  const initialized = await dispatchMCP(
    {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: MCP_VERSION,
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    },
    never,
  );
  assert.equal(
    (initialized as { result: { protocolVersion: string } }).result
      .protocolVersion,
    MCP_VERSION,
  );
  const listed = await dispatchMCP(
    { jsonrpc: "2.0", id: "tools", method: "tools/list" },
    never,
  );
  assert.equal(
    (listed as { result: { tools: unknown[] } }).result.tools.length,
    5,
  );
  assert.ok(
    !adminTools.some((t) => /sql|approve|delete|user|secret/.test(t.name)),
  );
  assert.equal(adminTools.filter((t) => !t.annotations.readOnlyHint).length, 1);
});
test("MCP rejects batches, arbitrary methods, unbounded limits and unlisted arguments", async () => {
  let executions = 0;
  const run = async () => {
    executions++;
    return { ok: true };
  };
  assert.ok("error" in (await dispatchMCP([], run))!);
  assert.ok(
    "error" in
      (await dispatchMCP(
        { jsonrpc: "2.0", id: 1, method: "execute_sql" },
        run,
      ))!,
  );
  for (const args of [
    { limit: 1000 },
    { query: "x", table: "profiles" },
    { query: "x", limit: -1 },
    { query: "x", limit: 1.1 },
  ]) {
    const reply = await dispatchMCP(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "search_universities", arguments: args },
      },
      run,
    );
    assert.equal(
      (reply as { result: { isError: boolean } }).result.isError,
      true,
    );
  }
  assert.equal(executions, 0);
});
test("MCP notifications never stage records and tool errors have MCP result framing", async () => {
  let executions = 0;
  const run = async () => {
    executions++;
    return { accepted: 1 };
  };
  const notification = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: { name: "stage_observations", arguments: {} },
  };
  assert.equal(await dispatchMCP(notification, run), null);
  assert.equal(executions, 0);
  const failure = await dispatchMCP(
    {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "review_queue" },
    },
    async () => {
      throw new Error("Verify your authenticator");
    },
  );
  assert.equal(
    (failure as { result: { isError: boolean } }).result.isError,
    true,
  );
  assert.equal(
    (failure as { result: { content: { text: string }[] } }).result.content[0]
      .text,
    "Tool failed. Retry or inspect the record in the staff console.",
  );
});
test("staging validates evidence, percentage bounds and mandatory original HTTPS URL", () => {
  const args = {
    source_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    rows: [
      {
        university_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        metric: "admission_rate",
        year: 2026,
        value: 50,
        unit: "%",
        source_url: "https://example.edu/admissions",
      },
    ],
  };
  assert.doesNotThrow(() => parseTool("stage_observations", args));
  assert.throws(() =>
    parseTool("stage_observations", {
      ...args,
      rows: [{ ...args.rows[0], value: 101 }],
    }),
  );
  assert.throws(() =>
    parseTool("stage_observations", {
      ...args,
      rows: [{ ...args.rows[0], source_url: "http://example.edu" }],
    }),
  );
  assert.throws(() =>
    parseTool("stage_observations", {
      ...args,
      rows: Array(26).fill(args.rows[0]),
    }),
  );
  assert.throws(() => parseTool("approve_observation", args));
});
test("planner week crosses year boundaries without changing a date-only deadline", () => {
  assert.deepEqual(plannerWeek("2026-01-01"), [
    "2025-12-29",
    "2025-12-30",
    "2025-12-31",
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
    "2026-01-04",
  ]);
  assert.equal(plannerWeek("2026-10-03", 1)[0], "2026-10-05");
  assert.deepEqual(plannerWeek("2026-02-30"), []);
  const day = new Date(2026, 9, 3, 0, 1);
  assert.equal(localPlanDate(day), "2026-10-03");
});
