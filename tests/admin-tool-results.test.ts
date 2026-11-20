import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminTools, dispatchMCP, type AdminTool } from "../lib/admin-mcp";
import {
  ADMIN_RESULT_MAX_BYTES,
  adminOutputSchemas,
  adminToolMessages,
  parseAdminToolResult,
} from "../lib/admin-tool-results";
import { runAdminTool } from "../server/admin-tools";

const require = createRequire(import.meta.url);
// Already installed by the locked development dependencies; no application dependency added.
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const validator = new Ajv({ strict: false });
addFormats(validator);
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DATE = "2026-10-10T12:00:00+00:00";
const coverageUniversity = {
  id: ID,
  name: "Source University",
  slug: "source-university",
  country_code: "US",
  website: "https://example.edu/",
  logo_url: null,
};
const university = {
  ...coverageUniversity,
  city: "Cambridge",
  published: true,
};
const sourceFields = {
  name: "Official admissions",
  organization: "Source University",
  url: "https://example.edu/admissions",
  source_type: "official",
  retrieved_at: DATE,
  published_at: null,
  trust_level: "high",
  license_notes: null,
};
const source = { ...sourceFields, id: ID };
const requirement = {
  id: ID,
  label: "English-language qualification",
  kind: "IELTS",
  minimum: 6.5,
  maximum: null,
  student_category: "international undergraduate",
  required: null,
  year: null,
  source_url: "https://example.edu/admissions",
  verified_at: DATE,
  notes: "Programme exceptions apply.",
};
const coverage = {
  university: { ...coverageUniversity, updated_at: DATE },
  categories: [
    "identity",
    "programs",
    "requirements",
    "deadlines",
    "costs",
    "admissions",
    "rankings",
    "media",
  ].map((key) => ({ key, label: key, count: key === "requirements" ? 1 : 0 })),
  requirement_evidence: [requirement],
  pending: 0,
  conflicts: 0,
  last_requirement_check: DATE,
  oldest_requirement_check: DATE,
};
const queueRow = {
  id: ID,
  university_id: ID,
  source_id: ID,
  metric: "enrollment",
  year: 2025,
  normalized_value: 123,
  unit: "students",
  status: "pending",
  source_url: "https://example.edu/enrollment",
  retrieved_at: DATE,
  notes: null,
  evidence: {
    scope: "institution",
    population: "all students",
    reporting_period: "2025–2026",
    publication_year: 2026,
    license_note: "Official published statistic",
  },
  data_sources: sourceFields,
};
const staged = {
  import_id: ID,
  accepted: 1,
  rejected: 0,
  duplicates: 0,
  warnings: ["0 duplicate observations skipped"],
};
const fixtures: Record<AdminTool, unknown> = {
  search_universities: [university],
  university_coverage: coverage,
  list_sources: [source],
  review_queue: [queueRow],
  stage_observations: staged,
};
const args: Record<AdminTool, Record<string, unknown>> = {
  search_universities: {},
  university_coverage: { university_id: ID },
  list_sources: {},
  review_queue: {},
  stage_observations: {
    source_id: ID,
    rows: [
      {
        university_id: ID,
        metric: "enrollment",
        year: 2025,
        value: 123,
        unit: "students",
        source_url: "https://example.edu/enrollment",
      },
    ],
  },
};
async function call(name: AdminTool, value: unknown) {
  const reply = await dispatchMCP(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args[name] },
    },
    async () => value,
  );
  assert.ok(reply && "result" in reply);
  return reply.result as {
    isError: boolean;
    content: { text: string }[];
    structuredContent?: { data: unknown };
  };
}

test("all five discovered output schemas validate actual normalized shapes and matching text results", async () => {
  for (const tool of adminTools) {
    const result = await call(
      tool.name as AdminTool,
      fixtures[tool.name as AdminTool],
    );
    assert.equal(result.isError, false, tool.name);
    const check = validator.compile(tool.outputSchema);
    assert.equal(
      check(result.structuredContent),
      true,
      JSON.stringify(check.errors),
    );
    assert.deepEqual(
      JSON.parse(result.content[0].text),
      result.structuredContent,
    );
  }
});

test("only declared catalogue fields are emitted; missing and non-finite facts fail without exposing the raw result", async () => {
  const result = await call("search_universities", [
    {
      ...university,
      private_email: "private@example.test",
      service_role_key: "secret",
      toJSON: () => ({ credential: "secret" }),
    },
  ]);
  assert.equal(result.isError, false);
  assert.equal(result.content[0].text.includes("private@example"), false);
  assert.equal(result.content[0].text.includes("secret"), false);
  for (const value of [
    null,
    [{ ...university, id: "not-a-uuid" }],
    [{ ...university, published: false }],
  ]) {
    const invalid = await call("search_universities", value);
    assert.equal(invalid.isError, true);
    assert.equal(invalid.content[0].text, adminToolMessages.invalid);
    assert.equal(invalid.structuredContent, undefined);
  }
  assert.throws(() =>
    parseAdminToolResult("review_queue", [
      { ...queueRow, normalized_value: Infinity },
    ]),
  );
});

test("coverage caps requirement evidence with a truthful total and preserves nullable year and required status", () => {
  const result = parseAdminToolResult("university_coverage", {
    ...coverage,
    requirement_evidence: Array.from({ length: 38 }, (_, i) => ({
      ...requirement,
      label: "Requirement " + i,
    })),
  });
  assert.equal(result.requirement_evidence.length, 25);
  assert.equal(result.requirement_evidence_total, 38);
  assert.equal(result.requirement_evidence_truncated, true);
  assert.equal(result.requirement_evidence[0].year, null);
  assert.equal(result.requirement_evidence[0].required, null);
  assert.deepEqual(
    parseAdminToolResult("university_coverage", result),
    result,
    "shared runner and dispatcher may both validate",
  );
  assert.throws(() =>
    parseAdminToolResult("university_coverage", {
      ...result,
      requirement_evidence_total: 3,
    }),
  );
});

test("query and serialized UTF-8 result bounds do not pretend to return a complete dataset", async () => {
  assert.throws(() =>
    parseAdminToolResult("search_universities", Array(26).fill(university)),
  );
  const oversized = await call(
    "review_queue",
    Array(25).fill({ ...queueRow, notes: "学".repeat(3000) }),
  );
  assert.equal(oversized.isError, true);
  assert.equal(oversized.content[0].text, adminToolMessages.oversized);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(oversized)).byteLength <
      ADMIN_RESULT_MAX_BYTES,
  );
  const largeField = await call("list_sources", [
    { ...source, license_notes: "x".repeat(4001) },
  ]);
  assert.equal(largeField.isError, true);
  assert.equal(largeField.content[0].text, adminToolMessages.invalid);
});

test("staging validates receipt counts and source URLs cannot become executable links", () => {
  assert.throws(() =>
    parseAdminToolResult("stage_observations", {
      ...staged,
      accepted: 25,
      duplicates: 1,
    }),
  );
  assert.throws(() =>
    parseAdminToolResult("stage_observations", { ...staged, rejected: 1 }),
  );
  assert.throws(() =>
    parseAdminToolResult("list_sources", [
      { ...source, url: "javascript:alert(1)" },
    ]),
  );
  assert.throws(() =>
    parseAdminToolResult("list_sources", [
      { ...source, url: "https://token:secret@example.edu/" },
    ]),
  );
  assert.throws(
    () =>
      parseAdminToolResult("list_sources", [{ ...source, url: "https://" }]),
    { message: adminToolMessages.invalid },
  );
  assert.throws(() =>
    parseAdminToolResult("university_coverage", {
      ...coverage,
      requirement_evidence: [
        { ...requirement, source_url: "http://example.edu/" },
      ],
    }),
  );
});

test("unknown runner errors cannot expose credentials, SQL or exception details; known recovery instructions survive", async () => {
  const input = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "review_queue" },
  };
  for (const message of [
    "SELECT secret FROM auth.users",
    "Authorization: Bearer secret",
    "https://secret-host?apikey=secret",
  ]) {
    const response = await dispatchMCP(input, async () => {
      throw new Error(message);
    });
    assert.equal(JSON.stringify(response).includes(message), false);
  }
  for (const message of Object.values(adminToolMessages)) {
    const response = await dispatchMCP(input, async () => {
      throw new Error(message);
    });
    assert.ok(JSON.stringify(response).includes(message));
  }
});

function mockDB(data: unknown, error: unknown = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const response = { data, error };
  const builder = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return builder;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return builder;
    },
    ilike: (...args: unknown[]) => {
      calls.push({ method: "ilike", args });
      return builder;
    },
    then: (resolve: (value: typeof response) => unknown) =>
      Promise.resolve(response).then(resolve),
  };
  const db = {
    from: (...args: unknown[]) => {
      calls.push({ method: "from", args });
      return builder;
    },
    rpc: (...args: unknown[]) => {
      calls.push({ method: "rpc", args });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

test("shared database runner includes bounded provenance, removes raw blobs and validates assistant results", async () => {
  const { evidence, ...row } = queueRow;
  const mocked = mockDB([
    {
      ...row,
      raw_value: {
        evidence: { ...evidence, private_document: "never export" },
        private_document: "never export",
      },
    },
  ]);
  const result = await runAdminTool(mocked.db, "review_queue", { limit: 3 });
  assert.deepEqual(result, [queueRow]);
  assert.equal(JSON.stringify(result).includes("never export"), false);
  assert.ok(
    String(mocked.calls.find((v) => v.method === "select")?.args[0]).includes(
      "license_notes",
    ),
  );
  assert.deepEqual(mocked.calls.find((v) => v.method === "limit")?.args, [3]);
  await assert.rejects(
    runAdminTool(
      mockDB([{ private: "unexpected" }]).db,
      "search_universities",
      {},
    ),
    { status: 503, message: adminToolMessages.invalid },
  );
});

test("database errors remain safe and staging cannot call an RPC before verified write authority", async () => {
  await assert.rejects(
    runAdminTool(
      mockDB(null, { message: "secret PostgreSQL detail" }).db,
      "list_sources",
      {},
    ),
    { status: 503, message: adminToolMessages.unavailable },
  );
  const staging = mockDB(staged);
  await assert.rejects(
    runAdminTool(staging.db, "stage_observations", args.stage_observations),
    { status: 403, message: adminToolMessages.mfa },
  );
  assert.equal(staging.calls.length, 0);
  assert.deepEqual(
    await runAdminTool(
      staging.db,
      "stage_observations",
      args.stage_observations,
      true,
    ),
    staged,
  );
});

test("output schemas prohibit extra top-level data and limits are discoverable", () => {
  const check = validator.compile(adminOutputSchemas.search_universities);
  assert.equal(check({ data: [university], private: "extra" }), false);
  assert.equal(check({ data: Array(26).fill(university) }), false);
  assert.equal(check({ data: [{ ...university, private: "extra" }] }), false);
});
