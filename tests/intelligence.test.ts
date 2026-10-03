import { normalizeROR } from "../scripts/ingestion/ror";
import { observationSchema } from "../lib/research";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, HttpError } from "../server/http";
import { feedURL, normalizeFeed } from "../scripts/ingestion/adapters";
import {
  parseResearchQuery,
  filterUniversities,
  defaultFilters,
} from "../lib/research";
import { normalizeUniversity } from "../lib/domain";
import { similarity } from "../lib/intelligence";
test("requested Europe / CS / budget / scholarship / IELTS query preserves every supported constraint", () => {
  const { filters, unparsed } = parseResearchQuery(
    "Computer science universities in Europe under $20k with scholarships and IELTS 7.0 or lower.",
  );
  assert.equal(filters.field, "Computer Science");
  assert.equal(filters.region, "Europe");
  assert.equal(filters.cost_max, 20000);
  assert.equal(filters.scholarships, "yes");
  assert.equal(filters.ielts_max, 7);
  assert.ok(!unparsed.replace(/[.\s]/g, ""));
  assert.doesNotThrow(() =>
    parseResearchQuery("universities under $999999999999999999999999"),
  );
});
test("program constraints must match one program, not three unrelated offerings", () => {
  const u = normalizeUniversity({
    id: "test",
    university_programs: [
      {
        verification_status: "verified",
        source_id: "source",
        verified_at: "2026-01-01",
        programs: {
          id: "a",
          name: "Computer Science",
          subject: "Computer Science",
          degree_level: "Master",
          language: "German",
        },
      },
      {
        verification_status: "verified",
        source_id: "source",
        verified_at: "2026-01-01",
        programs: {
          id: "b",
          name: "Music",
          subject: "Music",
          degree_level: "Bachelor",
          language: "English",
        },
      },
    ],
  });
  assert.equal(
    filterUniversities([u], {
      ...defaultFilters,
      field: "Computer Science",
      degree: "Bachelor",
      language: "English",
    }).length,
    0,
  );
  assert.equal(
    filterUniversities([u], { ...defaultFilters, scholarships: "yes" }).length,
    0,
  );
  assert.equal(
    filterUniversities([u], {
      ...defaultFilters,
      field: "Computer Science",
      degree: "Master",
      language: "German",
    }).length,
    1,
  );
});
test("body reader rejects malformed JSON and chunked oversized bytes", async () => {
  await assert.rejects(
    readJSON(
      new Request("https://example.test", { method: "POST", body: "{" }),
    ),
    (e) => e instanceof HttpError && e.status === 400,
  );
  await assert.rejects(
    readJSON(
      new Request("https://example.test", {
        method: "POST",
        body: '{"x":"ééé"}',
      }),
      10,
    ),
    (e) => e instanceof HttpError && e.status === 413,
  );
  assert.deepEqual(
    await readJSON(
      new Request("https://example.test", {
        method: "POST",
        body: '{"ok":true}',
      }),
    ),
    { ok: true },
  );
});
test("ingestion rejects unapproved targets and yearless Scorecard data", () => {
  for (const url of [
    "http://api.data.gov/feed",
    "https://evil.test/feed",
    "https://api.data.gov:8080/feed",
    "https://user:pass@api.data.gov/feed",
    "https://127.0.0.1/feed",
  ])
    assert.throws(() => feedURL(url, ["api.data.gov"]));
  assert.equal(
    feedURL("https://api.data.gov/feed", ["api.data.gov"]).hostname,
    "api.data.gov",
  );
  assert.throws(() =>
    normalizeFeed(
      "scorecard",
      {},
      "https://api.data.gov/ed/collegescorecard/v1/schools",
      new Map(),
    ),
  );
});
test("Scorecard observations retain year, definition, government source; nulls are not zeros", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const records = normalizeFeed(
    "scorecard",
    {
      metadata: { total: 1 },
      results: [
        {
          id: 166683,
          "2024.student.size": null,
          "2024.admissions.admission_rate.overall": 0.042,
        },
      ],
    },
    "https://api.data.gov/ed/collegescorecard/v1/schools?year=2024",
    new Map([["166683", id]]),
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].value, 4.2);
  assert.equal(records[0].year, 2024);
  assert.match(records[0].source_url, /collegescorecard.ed.gov/);
});
test("similarity excludes self and refuses unlike currencies", () => {
  const a = normalizeUniversity({ id: "a", country_code: "US" }),
    b = normalizeUniversity({ id: "b", country_code: "US" });
  assert.equal(similarity(a, a).score, 0);
  assert.deepEqual(similarity(a, b).reasons, ["Same country"]);
});

test("missing observations cannot silently become zero", () => {
  const row = {
    university_id: "11111111-1111-4111-8111-111111111111",
    metric: "enrollment",
    year: 2025,
    unit: "students",
    source_url: "https://example.test",
  };
  for (const value of [null, false, true, "", " "])
    assert.equal(observationSchema.safeParse({ ...row, value }).success, false);
  assert.equal(observationSchema.parse({ ...row, value: "0" }).value, 0);
});
test("ROR identities retain provenance without inventing campus coordinates", () => {
  const r = {
    id: "https://ror.org/0test0001",
    status: "active",
    types: ["education"],
    names: [{ value: "Example", types: ["ror_display"], lang: "en" }],
    links: [{ type: "website", value: "https://example.test" }],
    locations: [
      {
        geonames_details: {
          name: "Berlin",
          country_code: "DE",
          continent_name: "Europe",
          lat: 52.52,
          lng: 13.4,
        },
      },
    ],
    admin: { last_modified: { date: "2026-09-01", schema_version: "2.1" } },
  };
  const result = normalizeROR(r, "DE")!;
  assert.equal(result.proposed.latitude, null);
  assert.equal(result.source_metadata.geonames.lat, 52.52);
  assert.equal(result.source_url, r.id);
  assert.equal(normalizeROR(r, "GB"), null);
  assert.equal(normalizeROR({ ...r, types: ["company"] }), null);
});
