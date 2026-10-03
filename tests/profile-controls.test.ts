import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalComparisonIDs,
  comparisonRowVisible,
  csvCell,
  moveComparisonID,
} from "../lib/comparison";
import { universitySocialLinks } from "../lib/social-links";
import { applicationChecklist } from "../lib/admission-guidance";
import {
  degreeLabel,
  discoverPrograms,
  programLetter,
  programListings,
} from "../lib/program-discovery";
import { filterLabel } from "../lib/filter-labels";
import { officialLogo } from "../lib/official-logos";
import { regionalRankLabel } from "../lib/regional-rankings";
import { globalCatalogue } from "../server/global-catalogue";
import { universityRanks } from "../lib/ranking-highlights";
import redirects from "../data/published/identity-redirects.json";
import reconciliation from "../data/published/ranking-identity-reconciliation.json";

const mit = globalCatalogue.find((u) => u.slug === "mit")!;
const harvard = globalCatalogue.find((u) => u.name === "Harvard University")!;
test("comparison URLs reconcile old IDs, reject invalid input and deduplicate before the five-university limit", () => {
  const [old, redirect] = Object.entries(redirects)[0];
  const ids = canonicalComparisonIDs([
    old,
    redirect.id.toUpperCase(),
    "garbage",
    ...globalCatalogue.slice(0, 10).map((u) => u.id),
  ]);
  assert.equal(ids[0], redirect.id);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual(canonicalComparisonIDs(["", "<script>", "mit"]), []);
});
test("comparison columns move without mutating the original selection or crossing a boundary", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(moveComparisonID(ids, "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveComparisonID(ids, "b", 1), ["a", "c", "b"]);
  assert.deepEqual(moveComparisonID(ids, "a", -1), ids);
  assert.deepEqual(moveComparisonID(ids, "missing", 1), ids);
  assert.deepEqual(ids, ["a", "b", "c"]);
});
test("difference and missing-value filters retain partial evidence and equal figures from different contexts", () => {
  const options = { onlyDifferences: true, hideEmpty: true };
  assert.equal(comparisonRowVisible([null, null], options), false);
  assert.equal(
    comparisonRowVisible(
      ["50|2024|international", "50|2024|international"],
      options,
    ),
    false,
  );
  assert.equal(
    comparisonRowVisible(
      ["50|2024|international", "50|2025|domestic"],
      options,
    ),
    true,
  );
  assert.equal(comparisonRowVisible([null, "#1|QS2027"], options), true);
  assert.equal(
    comparisonRowVisible([null, null], {
      onlyDifferences: false,
      hideEmpty: false,
    }),
    true,
  );
});
test("comparison export quotes values and neutralizes spreadsheet formula cells", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("\t=IMPORTXML(1)"), '"\'\t=IMPORTXML(1)"');
  assert.equal(csvCell("@SUM(1)"), '"\'@SUM(1)"');
  assert.equal(csvCell(100), '"100"');
});
test("social accounts use the real host, reject lookalikes/credentials/scripts, and do not invent missing accounts", () => {
  const source_url = "https://example.edu";
  const rows = universitySocialLinks({
    social_links: [
      {
        label: "Instagram",
        url: "https://instagram.com.evil.test/university",
        source_url,
      },
      { label: "Instagram", url: "javascript:alert(1)", source_url },
      {
        label: "Facebook",
        url: "https://user:pass@facebook.com/university",
        source_url,
      },
      { label: "X", url: "https://www.youtube.com/@university", source_url },
      { label: "YouTube", url: "https://youtube.com/@duplicate", source_url },
      { label: "X", url: "https://x.com/university", source_url },
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.name),
    ["YouTube", "X"],
  );
  assert.equal(universitySocialLinks({ social_links: [] }).length, 0);
});
test("requirements planners distinguish prior-degree and school evidence without inferring numerical thresholds", () => {
  assert.match(
    applicationChecklist("undergraduate")[0].text,
    /school qualification/,
  );
  assert.match(applicationChecklist("postgraduate")[0].text, /prior degree/);
  assert.match(
    applicationChecklist("postgraduate")[3].text,
    /research proposal/,
  );
  assert.ok(
    applicationChecklist("undergraduate").every((r) => !/\d/.test(r.text)),
  );
});
test("sourced application summaries bind to the right official domains, retain scope and identify past cycles", () => {
  assert.match(
    mit.application_brief!.requirements_source,
    /mitadmissions\.org/,
  );
  assert.equal(mit.admission_summary?.year, 2025);
  for (const domain of ["utoronto.ca", "uni-ruse.bg", "wiut.uz", "ethz.ch"]) {
    const u = globalCatalogue.find(
      (u) => new URL(u.website!).hostname.replace(/^www\./, "") === domain,
    )!;
    assert.ok(u.application_brief?.scope);
    assert.ok(u.application_brief!.requirements_source.includes(domain));
    assert.equal(u.application_brief!.checked_at, "2026-10-01");
  }
  const wiut = globalCatalogue.find((u) => u.slug === "wiut")!;
  assert.match(
    wiut.application_brief!.requirements.join(" "),
    /cycle has closed/,
  );
});
test("program degree and origin filters preserve source distinctions, alphabetic grouping and qualification-specific records", () => {
  assert.equal(
    degreeLabel("Post-master's certificate"),
    "Certificate / diploma",
  );
  assert.equal(degreeLabel("Bachelor"), "Bachelor’s");
  assert.equal(programLetter("Électrical engineering"), "E");
  assert.equal(programLetter("2026 foundation"), "#");
  const tum = globalCatalogue.find((u) => u.slug === "tum")!;
  const rows = programListings(tum);
  const bachelor = discoverPrograms(rows, {
    query: "Aerospace",
    degree: "Bachelor’s",
    origin: "official",
    letter: "A",
  });
  assert.equal(bachelor.length, 1);
  assert.match(bachelor[0].url!, /bachelor/);
  const masters = discoverPrograms(rows, {
    query: "AI",
    degree: "Master’s",
    origin: "official",
    letter: "A",
  });
  assert.ok(masters.some((r) => r.name === "AI in Biomedicine"));
  const reported = programListings(mit);
  assert.ok(
    discoverPrograms(reported, {
      query: "",
      degree: "",
      origin: "reported",
      letter: "",
    }).every((r) => r.origin === "reported" && r.year),
  );
  assert.ok(rows.every((r) => !("available" in r)));
});
test("filter chips describe the user's choices without exposing schema abbreviations", () => {
  assert.equal(filterLabel("q", "pro"), "Search: “pro”");
  assert.equal(filterLabel("country", "DE"), "Germany");
  assert.equal(
    filterLabel("admission_min", 40),
    "Acceptance rate: at least 40%",
  );
  assert.equal(filterLabel("cost_max", 20000), "Annual tuition: up to $20,000");
});
test("official logo matching uses institution domains, including subdomains, with no lookalike matches", () => {
  assert.equal(
    officialLogo("https://english.uibe.edu.cn")?.local,
    "/logos/uibe.png",
  );
  assert.equal(officialLogo("https://harvard.edu.evil.test"), undefined);
  assert.equal(officialLogo(null), undefined);
  assert.equal(harvard.logo_url, "/logos/harvard-wordmark.svg");
});
test("registry reconciliation restores ranked universities and stable source-linked comparison profiles", () => {
  assert.ok(reconciliation.added_ror_ids.length > 600);
  assert.ok(reconciliation.restored.length > 1100);
  const nus = globalCatalogue.find(
    (u) => u.name === "National University of Singapore",
  )!;
  const ucl = globalCatalogue.find(
    (u) => u.name === "University College London",
  )!;
  assert.ok(nus.reference_url?.startsWith("https://ror.org/"));
  assert.equal(universityRanks(nus).find((r) => r.provider === "qs")?.rank, 10);
  assert.equal(universityRanks(ucl).find((r) => r.provider === "qs")?.rank, 8);
  assert.equal(
    universityRanks(ucl).find((r) => r.provider === "qs")?.tied,
    true,
  );
  assert.equal(
    new Set(globalCatalogue.map((u) => u.id)).size,
    globalCatalogue.length,
  );
});
test("regional ranking labels retain publisher ties and bands rather than inventing exact places", () => {
  assert.equal(regionalRankLabel("=25"), "=25");
  assert.equal(regionalRankLabel("501–600"), "501–600");
  assert.equal(regionalRankLabel("25"), "#25");
});
