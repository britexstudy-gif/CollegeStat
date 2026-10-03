import { test } from "node:test";
import assert from "node:assert/strict";
import { authAvailability } from "../lib/auth-availability";
import {
  validPlanDate,
  dueLabel,
  prioritizeTasks,
} from "../lib/workspace-planner";
import { percentageRange } from "../lib/percentage-range";
import { rankingTable } from "../server/ranking-table";
import { universityRanks, rankLabel } from "../lib/ranking-highlights";
import {
  regionalRanksForUniversity,
  regionalRankLabel,
} from "../lib/regional-rankings";
import { globalCatalogue } from "../server/global-catalogue";

test("provider actions require backend attestation and Telegram’s exact OIDC identity", () => {
  const settings = {
    external: { email: true, google: "true", apple: false },
    disable_signup: false,
  };
  assert.deepEqual(authAvailability(settings), {
    email: true,
    google: false,
    apple: false,
    telegram: false,
    signup: true,
  });
  const telegram = {
    identifier: "custom:telegram",
    enabled: true,
    provider_type: "oidc",
    issuer: "https://oauth.telegram.org",
  };
  assert.equal(authAvailability(settings, [telegram]).telegram, true);
  for (const unsafe of [
    { ...telegram, enabled: "true" },
    { ...telegram, issuer: "https://oauth.telegram.org.evil.test" },
    { ...telegram, provider_type: "oauth2" },
    { ...telegram, identifier: "telegram" },
  ])
    assert.equal(authAvailability(settings, [unsafe]).telegram, false);
  assert.deepEqual(authAvailability(null), {
    email: false,
    google: false,
    apple: false,
    telegram: false,
    signup: false,
  });
});

test("application planner prioritizes open deadlines and preserves user data", () => {
  const tasks = [
    { id: "a", title: "Undated", done: false, due_at: null },
    { id: "b", title: "Next week", done: false, due_at: "2026-10-10" },
    { id: "c", title: "Overdue", done: false, due_at: "2026-10-01" },
    { id: "d", title: "Completed", done: true, due_at: "2026-09-01" },
    { id: "e", title: "Invalid", done: false, due_at: "2026-02-30" },
  ];
  const original = structuredClone(tasks);
  assert.deepEqual(
    prioritizeTasks(tasks).map((t) => t.id),
    ["c", "b", "e", "a"],
  );
  assert.deepEqual(tasks, original);
  assert.equal(validPlanDate("2026-02-30"), false);
  assert.equal(validPlanDate("2028-02-29"), true);
  assert.equal(validPlanDate("2026-10-03T00:00:00Z"), false);
  assert.equal(dueLabel("2026-10-01", "2026-10-03"), "2 days overdue");
  assert.equal(dueLabel("2026-10-03", "2026-10-03"), "Due today");
  assert.equal(dueLabel("2026-10-04", "2026-10-03"), "Due tomorrow");
  assert.equal(dueLabel("2026-02-30", "2026-10-03"), "Date to confirm");
});

test("percentage range accepts exact zero and bounds invalid or inverted input", () => {
  assert.deepEqual(percentageRange(0, 0), [0, 0]);
  assert.deepEqual(percentageRange(-10, 120), [0, 100]);
  assert.deepEqual(percentageRange(90, 10), [10, 90]);
  assert.deepEqual(percentageRange(NaN, Infinity), [0, 100]);
  assert.deepEqual(percentageRange(4.556, 74.91), [4.6, 74.9]);
});

test("ranking API identities keep the same edition and position as their displayed row", () => {
  const table = rankingTable(
    new URLSearchParams("provider=qs&q=Stanford University"),
  );
  const stanford = table.rows.find((r) => r.university?.slug === "stanford")!;
  assert.equal(stanford.rank, "=2");
  const badge = universityRanks(stanford.university!).find(
    (r) => r.provider === "qs",
  )!;
  assert.equal(badge.year, table.year);
  assert.equal(rankLabel(badge), stanford.rank);
  const hku = globalCatalogue.find(
    (u) => u.name === "The University of Hong Kong",
  )!;
  assert.ok(regionalRanksForUniversity(hku).some((r) => r.scope === "Asia"));
  assert.equal(regionalRankLabel("=3"), "=3");
  assert.equal(regionalRankLabel("501–550"), "501–550");
  assert.deepEqual(
    regionalRanksForUniversity({ website: "https://hku.hk.evil.test" }),
    [],
  );
});

test("reviewed requirements preserve conditional scope, alternatives and earlier score scales", () => {
  const mit = globalCatalogue.find((u) => u.slug === "mit")!;
  assert.equal(
    new Set(mit.requirements.map((r) => r.id)).size,
    mit.requirements.length,
  );
  assert.equal(mit.requirements.find((r) => r.kind === "TOEFL")!.minimum, 5);
  assert.ok(
    mit.requirements
      .find((r) => r.kind === "TOEFL")!
      .student_category.includes("21 January 2026"),
  );
  const stanford = globalCatalogue.find((u) => u.slug === "stanford")!;
  assert.equal(
    stanford.requirements.find((r) => r.label === "SAT or ACT")!.required,
    true,
  );
  assert.equal(
    stanford.requirements.find((r) => r.label === "English proficiency exams")!
      .required,
    false,
  );
  assert.ok(
    !stanford.requirements.some(
      (r) => r.kind === "IELTS" || r.kind === "TOEFL",
    ),
  );
  const imperial = globalCatalogue.find(
    (u) => u.name === "Imperial College London",
  )!;
  assert.deepEqual(
    imperial.requirements
      .filter((r) => r.kind === "IELTS")
      .map((r) => r.minimum),
    [6.5, 7],
  );
  const tum = globalCatalogue.find((u) => u.slug === "tum")!;
  assert.ok(
    tum.requirements.find((r) => r.kind === "TOEFL")!.label.includes("earlier"),
  );
  assert.ok(
    tum.requirements
      .find((r) => r.kind === "TOEFL")!
      .notes!.includes("no numeric conversion"),
  );
  const harvard = globalCatalogue.find((u) => u.name === "Harvard University")!;
  assert.ok(
    !harvard.application_brief!.requirements.join(" ").includes("Coalition"),
  );
});
