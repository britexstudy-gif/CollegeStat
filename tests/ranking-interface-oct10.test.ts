import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rankingTable } from "../server/ranking-table";
import { resolveRegionalScope } from "../lib/regional-rankings";
import {
  rankingSystems,
  rankingSystemHref,
} from "../lib/ranking-systems";
import { PublisherMark } from "../components/college/publisher-mark";

test("regional edition query defaults to a published edition", async () => {
  const fallback = resolveRegionalScope("invalid", [
    { scope: "Asia", year: 2026 },
    { scope: "Europe", year: 2026 },
  ]);
  assert.equal(fallback, "Europe");
  const table = await rankingTable(new URLSearchParams("scope=regional&edition=invalid"));
  assert.equal(table.scopeLabel, "Europe");
});

test("Leiden sort labels name publications and never invent an overall rank", async () => {
  const leiden = await rankingTable(new URLSearchParams("provider=leiden"));
  assert.ok(
    leiden.rows.every((row) => /[0-9]/.test(row.rank)),
    "Leiden rows show publication counts",
  );
  assert.ok(
    !leiden.rows.some((row) => String(row.rank).startsWith("#")),
    "Leiden rank labels are counts, not invented # ranks",
  );
});

test("ranking system directory routes installed systems in-app", () => {
  for (const system of rankingSystems.filter((s) => s.imported)) {
    assert.ok(
      rankingSystemHref(system).startsWith("/rankings?"),
      system.slug + " stays in-app",
    );
  }
  for (const system of rankingSystems.filter((s) => !s.imported)) {
    assert.match(rankingSystemHref(system), /^https:\/\//);
  }
  const herd = rankingSystems.find((s) => s.slug === "herd")!;
  const nirf = rankingSystems.find((s) => s.slug === "nirf")!;
  assert.ok(rankingSystemHref(herd).includes("scope=national"));
  assert.ok(rankingSystemHref(nirf).includes("scope=national"));
});

test("publisher marks preserve classes, eager priority and text fallback", () => {
  const lazy = renderToStaticMarkup(
    createElement(PublisherMark, { provider: "qs" }),
  );
  assert.ok(lazy.includes("publisher-mark"));
  assert.ok(lazy.includes("publisher-identification"));
  assert.ok(lazy.includes("publisher-qs"));
  // Marks load eagerly on purpose: a lazy or blocked image would leave an empty plate.
  assert.ok(lazy.includes('loading="eager"'));
  const eager = renderToStaticMarkup(
    createElement(PublisherMark, {
      provider: "qs",
      priority: true,
    }),
  );
  assert.ok(eager.includes('loading="eager"'));
  assert.ok(
    eager.includes('fetchpriority="high"') ||
      eager.includes('fetchPriority="high"'),
  );
  const fallback = renderToStaticMarkup(
    createElement(PublisherMark, {
      provider: "scimago",
    }),
  );
  assert.ok(fallback.includes("publisher-text-mark"));
  assert.ok(fallback.includes("publisher-scimago"));
});
