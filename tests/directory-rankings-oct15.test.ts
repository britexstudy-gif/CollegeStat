import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../data/published/reviewed-webometrics-oct15.json";
import unirank from "../data/published/reviewed-unirank-oct15.json";
import directory from "../data/published/global-directory.json";
import { directoryRankingTable } from "../lib/directory-rankings";
import { directoryRanksForUniversity } from "../lib/directory-ranking-positions";
import { directoryRankingCountryName } from "../lib/directory-rankings-shared";
import profileIndex from "../data/published/reviewed-webometrics-profile-index-oct15.json";
import { profileRankingPositions } from "../lib/profile-ranking-positions";
import {
  rankingSystems,
  rankingSystemHref,
  rankingSystemOrder,
} from "../lib/ranking-systems";
import type { University } from "../lib/domain";

test("public Webometrics positions have an attributed versioned source and exact catalog identities", () => {
  assert.equal(snapshot.status, "reviewed_published");
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.license, "CC BY 4.0");
  assert.equal(
    snapshot.source_url,
    "https://doi.org/10.6084/m9.figshare.33062150.v3",
  );
  assert.equal(snapshot.records.length, 2250);
  assert.equal(snapshot.counts.excluded_source_records, 14);
  assert.match(snapshot.coverage, /top-15-per-country/);
  const byId = new Map(directory.map((row) => [row.id, row]));
  const linked = snapshot.records.filter((row) => row.university_id);
  assert.equal(linked.length, 1776);
  assert.equal(
    new Set(linked.map((row) => row.university_id)).size,
    linked.length,
  );
  for (const row of linked) {
    const university = byId.get(row.university_id!)!;
    assert.ok(university);
    assert.equal(row.country_code, university.country_code);
    assert.equal(row.slug, university.slug);
    assert.deepEqual(
      (profileIndex.records as Record<string, unknown>)[row.university_id!],
      [
        row.country_code,
        row.ror,
        row.world_rank,
        row.country_rank,
        row.world_tied,
        row.page,
      ],
    );
    if (row.identity_method === "exact_ror_and_country")
      assert.equal(row.ror, university.ror);
    else {
      assert.equal(row.identity_method, "exact_domain_and_country");
      assert.ok(
        row.domains.some((domain: string) =>
          university.domains.includes(domain),
        ),
      );
      assert.ok(!row.ror || !university.ror || row.ror === university.ror);
    }
  }
});

test("country labels cover ISO territories without assigning countries to publisher-specific groups", () => {
  assert.equal(directoryRankingCountryName("AS"), "American Samoa");
  assert.equal(directoryRankingCountryName("BM"), "Bermuda");
  assert.equal(directoryRankingCountryName("VG"), "British Virgin Islands");
  assert.equal(directoryRankingCountryName("VU"), "Vanuatu");
  assert.equal(directoryRankingCountryName("TY"), "Publisher region (TY)");
  assert.equal(
    directoryRankingCountryName("EU"),
    "European Union (publisher region)",
  );
  const table = directoryRankingTable("webometrics", new URLSearchParams());
  assert.ok(table.countries.every((country) => country.name !== country.code));
  const bermuda = directoryRankingTable(
    "webometrics",
    new URLSearchParams("q=Bermuda"),
  );
  assert.ok(bermuda.rows.some((row) => row.country_code === "BM"));
});

test("country filtering and pagination preserve real positions and published gaps", () => {
  const first = directoryRankingTable("webometrics", new URLSearchParams());
  assert.equal(first.rows[0].name, "Harvard University");
  assert.equal(first.rows[0].world_rank, 1);
  assert.equal(first.complete, false);
  const uz = directoryRankingTable(
    "webometrics",
    new URLSearchParams("country=UZ"),
  );
  assert.equal(uz.total, 15);
  assert.equal(uz.rows[0].world_rank, 2570);
  assert.equal(uz.rows[0].country_rank, 1);
  assert.equal(uz.rows[12].world_rank, 5504);
  assert.equal(uz.rows[12].country_rank, 13);
  assert.equal(
    directoryRankingTable("webometrics", new URLSearchParams("page=Infinity"))
      .page,
    1,
  );
  assert.equal(
    directoryRankingTable("webometrics", new URLSearchParams("page=999999"))
      .page,
    first.pages,
  );
  assert.equal(
    directoryRankingTable(
      "webometrics",
      new URLSearchParams("q=an-unpublished-institution"),
    ).total,
    0,
  );
});

test("profiles receive world and country positions only for the reviewed ID and country", () => {
  const harvard = snapshot.records.find(
    (row) => row.name === "Harvard University",
  )!;
  const university = {
    id: harvard.university_id!,
    name: harvard.name,
    website: "https://harvard.edu",
    country_code: "US",
    identifiers: { ror: harvard.ror! },
  } as unknown as University;
  const positions = profileRankingPositions(university).filter(
    (row) => row.provider === "webometrics",
  );
  assert.deepEqual(
    positions.map((row) => [row.scope, row.label]),
    [
      ["World", "#1"],
      ["United States", "#1"],
    ],
  );
  assert.ok(
    positions.every(
      (row) =>
        row.sourceNote === "July 2026 · corrected v3" &&
        row.url.endsWith("#page=5"),
    ),
  );
  assert.equal(
    directoryRanksForUniversity({ ...university, id: "different-id" }).length,
    0,
  );
  assert.equal(
    directoryRanksForUniversity({ ...university, country_code: "CA" }).length,
    0,
  );
  assert.equal(
    directoryRanksForUniversity({
      ...university,
      identifiers: { ror: "https://ror.org/different" },
    }).length,
    0,
  );
});

test("uniRank values are limited university reports and do not fabricate an unreported world rank", () => {
  assert.equal(unirank.records.length, 3);
  const table = directoryRankingTable(
    "unirank",
    new URLSearchParams("country=ID"),
  );
  assert.equal(table.total, 1);
  assert.equal(table.complete, false);
  assert.equal(table.rows[0].world_rank, null);
  assert.equal(table.rows[0].country_rank, 26);
  assert.equal(table.rows[0].source_kind, "university_report");
  assert.match(
    table.rows[0].source_url,
    /^https:\/\/www\.um-surabaya\.ac\.id\//,
  );
  const tut = directoryRankingTable("unirank", new URLSearchParams("q=Tshwane"))
    .rows[0];
  assert.equal(tut.world_rank, 1202);
  assert.equal(tut.country_rank, 9);
  const positions = profileRankingPositions({
    id: table.rows[0].university_id!,
    name: table.rows[0].name,
    country_code: "ID",
    website: "https://um-surabaya.ac.id",
  } as University).filter((row) => row.provider === "unirank");
  assert.equal(positions.length, 1);
  assert.equal(positions[0].scope, "Indonesia");
  assert.equal(positions[0].label, "#26");
  assert.match(positions[0].sourceNote || "", /university reported/);
});

test("uniRank and Webometrics route to local results before specialist research measures", () => {
  for (const slug of ["webometrics", "unirank"] as const) {
    const system = rankingSystems.find((row) => row.slug === slug)!;
    assert.equal(system.imported, true);
    assert.equal(system.availability, "partial");
    assert.equal(rankingSystemHref(system), `/rankings?provider=${slug}`);
    assert.ok(rankingSystemOrder(slug) < rankingSystemOrder("leiden"));
    assert.ok(rankingSystemOrder(slug) < rankingSystemOrder("herd"));
  }
});
