import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../data/published/study-resources-oct09.json";
import {
  destinationGuides,
  latestResources,
  learningResources,
  rehearsalTasks,
  type ApplicationRehearsal,
  type LearningResource,
} from "../lib/learning-resources";

function resource(patch: Partial<LearningResource> = {}): LearningResource {
  return {
    ...learningResources[0],
    id: "resource-original",
    slug: "official-practice",
    retrieved_at: "2025-10-09T00:00:00Z",
    ...patch,
  };
}

function draft(
  patch: Partial<ApplicationRehearsal> = {},
): ApplicationRehearsal {
  return {
    destination: "us-undergraduate",
    university: "Example University",
    program: "Computer Science",
    qualification: "National school diploma",
    intake: "Autumn 2027",
    completed: [],
    ...patch,
  };
}

test("the published resource catalogue contains link metadata and no imported questions", () => {
  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.status, "reviewed_link_metadata");
  assert.equal(snapshot.question_imports, 0);
  assert.ok(learningResources.length > 0);
  const metadataFields = new Set([
    "id",
    "slug",
    "title",
    "provider",
    "subject",
    "kind",
    "url",
    "summary",
    "access",
    "country_code",
    "population",
    "publication_year",
    "retrieved_at",
    "verification_state",
    "reuse_mode",
    "steps",
    "evidence",
  ]);
  const evidenceFields = new Set([
    "source_url",
    "provider",
    "retrieved_at",
    "publication_year",
    "scope",
    "verification_method",
    "rights_url",
    "content_imported",
    "question_count",
  ]);
  const ids = new Set<string>();
  const versions = new Set<string>();
  for (const row of learningResources) {
    assert.equal(row.verification_state, "verified", row.slug);
    assert.equal(row.reuse_mode, "link_metadata_only", row.slug);
    assert.equal(row.evidence.content_imported, false, row.slug);
    assert.equal(row.evidence.question_count, null, row.slug);
    assert.ok(
      Object.keys(row).every((key) => metadataFields.has(key)),
      row.slug,
    );
    assert.ok(
      Object.keys(row.evidence).every((key) => evidenceFields.has(key)),
      row.slug,
    );
    assert.ok(!ids.has(row.id), `duplicate resource id: ${row.id}`);
    ids.add(row.id);
    const version = `${row.slug}:${row.retrieved_at}`;
    assert.ok(!versions.has(version), `duplicate resource version: ${version}`);
    versions.add(version);
  }
});

test("published resources have valid source URLs, applicable populations and review evidence", () => {
  for (const row of learningResources) {
    const url = new URL(row.url);
    assert.equal(url.protocol, "https:", row.slug);
    assert.equal(url.username, "", row.slug);
    assert.equal(url.password, "", row.slug);
    assert.match(row.slug, /^[a-z0-9-]{2,100}$/);
    assert.ok(row.title.length >= 1 && row.title.length <= 200, row.slug);
    assert.ok(row.provider.length >= 1 && row.provider.length <= 200, row.slug);
    assert.ok(row.summary.length >= 1 && row.summary.length <= 1500, row.slug);
    assert.ok(row.population.trim(), row.slug);
    assert.ok(Number.isFinite(Date.parse(row.retrieved_at)), row.slug);
    assert.equal(row.evidence.source_url, row.url, row.slug);
    assert.equal(row.evidence.provider, row.provider, row.slug);
    assert.equal(row.evidence.retrieved_at, row.retrieved_at, row.slug);
    assert.equal(row.evidence.publication_year, row.publication_year, row.slug);
    assert.equal(row.evidence.scope, row.population, row.slug);
    assert.ok(row.evidence.verification_method, row.slug);
    assert.equal(
      new URL(String(row.evidence.rights_url)).protocol,
      "https:",
      row.slug,
    );
    assert.ok(
      row.publication_year === null ||
        (Number.isInteger(row.publication_year) &&
          row.publication_year >= 1900 &&
          row.publication_year <= 2100),
      row.slug,
    );
    assert.ok(
      row.country_code === null || /^[A-Z]{2}$/.test(row.country_code),
      row.slug,
    );
    assert.ok(
      row.steps.every((step) => typeof step === "string" && step.trim()),
      row.slug,
    );
  }
});

test("study resources cover SAT, IELTS and TOEFL while destination guides have preparation steps", () => {
  assert.deepEqual(
    [
      ...new Set(
        learningResources
          .filter((row) => row.kind === "practice")
          .map((row) => row.subject),
      ),
    ].sort(),
    ["IELTS", "SAT", "TOEFL"],
  );
  assert.ok(destinationGuides.length > 0);
  assert.deepEqual(
    destinationGuides,
    learningResources.filter((row) => row.kind === "destination"),
  );
  for (const guide of destinationGuides) {
    assert.ok(guide.country_code, guide.slug);
    assert.ok(guide.steps.length >= 1 && guide.steps.length <= 20, guide.slug);
    assert.equal(new Set(guide.steps).size, guide.steps.length, guide.slug);
  }
});

test("latest resources select the newest verified version without deleting historical evidence", () => {
  const old = resource({ id: "old" });
  const newest = resource({ id: "new", retrieved_at: "2026-10-09T00:00:00Z" });
  const other = resource({ id: "other", slug: "another-resource" });
  for (const rows of [
    [old, newest, other],
    [newest, other, old],
  ]) {
    const before = structuredClone(rows);
    assert.deepEqual(
      latestResources(rows)
        .map((row) => row.id)
        .sort(),
      ["new", "other"],
    );
    assert.deepEqual(rows, before);
    assert.ok(rows.some((row) => row.id === "old"));
  }
});

test("unreviewed, rejected and content-import versions cannot replace checked links", () => {
  const checked = resource({ id: "checked" });
  const rows = [
    checked,
    resource({
      id: "pending",
      retrieved_at: "2026-10-09T00:00:00Z",
      verification_state: "needs_review",
    }),
    resource({
      id: "rejected",
      retrieved_at: "2026-10-10T00:00:00Z",
      verification_state: "rejected",
    }),
    resource({
      id: "copied",
      retrieved_at: "2026-10-11T00:00:00Z",
      reuse_mode: "full_content",
    }),
    resource({
      id: "pending-only",
      slug: "not-checked",
      verification_state: "needs_review",
    }),
  ];
  assert.deepEqual(latestResources(rows), [checked]);
});

test("malformed retrieval dates never hide a valid latest resource", () => {
  const checked = resource({
    id: "checked",
    retrieved_at: "2026-10-09T00:00:00Z",
  });
  const invalid = resource({ id: "invalid", retrieved_at: "not a date" });
  assert.deepEqual(latestResources([invalid, checked]), [checked]);
  assert.deepEqual(latestResources([checked, invalid]), [checked]);
  assert.deepEqual(latestResources([invalid]), []);
});

test("latest resources compare actual instants rather than timestamp text or publication years", () => {
  const olderInstant = resource({
    id: "older-instant",
    retrieved_at: "2026-10-09T01:00:00+05:00",
    publication_year: 2026,
  });
  const newerInstant = resource({
    id: "newer-instant",
    retrieved_at: "2026-10-08T21:00:00Z",
    publication_year: null,
  });
  assert.deepEqual(latestResources([olderInstant, newerInstant]), [
    newerInstant,
  ]);
  assert.equal(latestResources([newerInstant])[0].publication_year, null);
  assert.deepEqual(latestResources([]), []);
});

test("rehearsal tasks keep user context and mark only explicitly completed steps", () => {
  const guide = resource({
    kind: "destination",
    title: "US undergraduate route",
    steps: [
      "Check qualification",
      "Check language evidence",
      "Check intake deadline",
    ],
  });
  const rehearsal = draft({
    university: "  Example University  ",
    program: " Computer Science ",
    intake: " Autumn 2027 ",
    completed: ["1", "01", "99"],
  });
  const before = structuredClone({ guide, rehearsal });
  assert.deepEqual(rehearsalTasks(rehearsal, guide), [
    {
      title:
        "Example University · Computer Science · Autumn 2027: Check qualification",
      done: false,
    },
    {
      title:
        "Example University · Computer Science · Autumn 2027: Check language evidence",
      done: true,
    },
    {
      title:
        "Example University · Computer Science · Autumn 2027: Check intake deadline",
      done: false,
    },
  ]);
  assert.deepEqual({ guide, rehearsal }, before);
});

test("rehearsal tasks use the destination when context is empty and never infer completion from qualification", () => {
  const guide = resource({
    title: "UK undergraduate route",
    kind: "destination",
    steps: ["Check course entry requirements"],
  });
  assert.deepEqual(
    rehearsalTasks(
      draft({
        university: " ",
        program: "",
        intake: " ",
        qualification: "IB 45",
      }),
      guide,
    ),
    [
      {
        title: "UK undergraduate route: Check course entry requirements",
        done: false,
      },
    ],
  );
  assert.deepEqual(
    rehearsalTasks(
      draft({ university: "Example", program: "", intake: "" }),
      guide,
    ),
    [{ title: "Example: Check course entry requirements", done: false }],
  );
  assert.deepEqual(rehearsalTasks(draft(), resource({ steps: [] })), []);
});
