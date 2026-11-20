import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGUE_COLUMNS, STUDENT_COLUMNS } from "../server/data-v2/schema";
import {
  DataV2Error, englishMinimum, exploreUniversitiesV2, getUniversityDetail, latestTuition, nextDeadline, pickLogo, toRpcFilters,
  type V2Client, type V2Query,
} from "../server/data-v2/queries";
import type { CostRow, DeadlineRow, MediaRow } from "../server/data-v2/types";
import { academicYearOf, currencyOf, datesIn, deadlinesFromValue, englishOf, platformOf, roundOf, satActPolicyOf, tuitionFromText } from "../scripts/ingest/normalise";
import { csvCell, uuidV5 } from "../scripts/ingest/lib";
import { validateRows } from "../scripts/ingest/validate";
import { freshV2Database } from "../scripts/ingest/load-check";

const SQL = readFileSync(new URL("../supabase/proposals/20261115_data_v2.sql", import.meta.url), "utf8");

/** Column names of `create table v2.<name> (...)` in declaration order. */
function sqlColumns(table: string): string[] {
  const start = SQL.indexOf(`create table v2.${table} (`);
  assert.ok(start >= 0, `v2.${table} is in the proposal`);
  let depth = 0, i = SQL.indexOf("(", start), body = "";
  for (; i < SQL.length; i++) {
    const c = SQL[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth === 0) break;
    body += c;
  }
  return body.slice(1).split("\n").map((l) => l.trim()).filter((l) => /^[a-z_0-9]+ [a-z]/.test(l) && !/^(unique|check|primary key|constraint)\b/.test(l)).map((l) => l.split(" ")[0]);
}

test("server/data-v2/schema.ts columns match the SQL proposal", () => {
  for (const [table, columns] of Object.entries({ ...CATALOGUE_COLUMNS, ...STUDENT_COLUMNS })) {
    assert.deepEqual(sqlColumns(table), [...columns], table);
  }
});

test("normalisers read the research shapes", () => {
  assert.equal(roundOf("Restrictive Early Action"), "restrictive_early_action");
  assert.equal(roundOf("Early Decision II"), "early_decision_2");
  assert.equal(roundOf("UCAS equal-consideration deadline"), "regular");
  assert.deepEqual(datesIn("November 1", 2027), [{ date: "2026-11-01", inferred: true }]);
  assert.deepEqual(datesIn("15 January 2027 and 2027-03-01", 2027).map((d) => d.date), ["2027-01-15", "2027-03-01"]);
  const rows = deadlinesFromValue({ cycle: "2027/28", early: "1 November 2026", regular: "Final diploma due 9 September 2027; documents due 31 October 2027." }, 2027);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].due_date, "2026-11-01");
  assert.equal(rows[1].due_date, null, "two dates in one value stay text");
  assert.equal(currencyOf("HKD/year for non-local students").code, "HKD");
  assert.equal(currencyOf("AED per credit hour").period, "credit");
  assert.equal(academicYearOf("2026-27"), "2026/27");
  assert.equal(academicYearOf(2023), "2023/24");
  assert.equal(platformOf("Common Application with Harvard supplement"), "common_app");
  assert.equal(platformOf("Direct online application via METU International Students Office"), "direct");
  assert.equal(platformOf("Kyrgyz Ministry of Education portal"), "national_portal");
  assert.equal(satActPolicyOf("Test-optional for 2027"), "optional");
  assert.deepEqual(englishOf("IELTS", { overall_minimum: 7, band_minimum: 6.5 })?.minimum, 7);
  assert.equal(englishOf("IELTS", "Not required (optional)")?.status, "optional");
  assert.equal(englishOf("TOEFL", "TOEFL iBT 90 minimum")?.minimum, 90);
  assert.equal(englishOf("IELTS", 12), null, "out of range");
  assert.deepEqual(tuitionFromText("USD 6,400–12,592 per year"), { amount: null, range_min: 6400, range_max: 12592, currency: "USD", period: "year" });
  assert.equal(tuitionFromText("Per-semester tuition: KRW 2,029,000 for humanities")?.period, "semester");
  assert.equal(tuitionFromText("No tuition fees currently charged; semester contribution applies.")?.amount, 0);
  assert.equal(tuitionFromText("Tuition amount not listed in reviewed source"), null);
});

test("ingest helpers: stable ids, COPY-safe CSV, validation", () => {
  assert.equal(uuidV5("x"), uuidV5("x"));
  assert.match(uuidV5("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(""), '""');
  assert.equal(csvCell('a, "b"'), '"a, ""b"""');
  assert.equal(csvCell(["x", 'y"z']), '"{""x"",""y\\""z""}"');
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
  const { ok, rejects } = validateRows("application_requirements", [
    { id: uuidV5("a"), university_id: uuidV5("u"), source_id: uuidV5("s"), kind: "IELTS", status: "required", label: "IELTS", minimum: 6.5 },
    { id: uuidV5("b"), university_id: uuidV5("u"), source_id: uuidV5("s"), kind: "IELTS", status: "required", label: "IELTS", minimum: 65 },
    { id: uuidV5("c"), university_id: uuidV5("u"), source_id: null, kind: "TOEFL", status: "required", label: "TOEFL" },
  ]);
  assert.equal(ok.length, 1);
  assert.deepEqual(rejects.map((r) => r.reasons.length > 0), [true, true]);
});

// ── Read layer against a fake client ──

function fakeClient(tables: Record<string, Record<string, unknown>[]>, rpc?: unknown): V2Client & { calls: unknown[] } {
  const calls: unknown[] = [];
  const query = (rows: Record<string, unknown>[]): V2Query => {
    let current = rows;
    const q: V2Query = {
      eq: (c, v) => ((current = current.filter((r) => r[c] === v)), q),
      in: (c, vs) => ((current = current.filter((r) => vs.includes(r[c]))), q),
      order: () => q,
      limit: (n) => ((current = current.slice(0, n)), q),
      then: (resolve, reject) => Promise.resolve({ data: current, error: null }).then(resolve, reject),
    };
    return q;
  };
  return {
    calls,
    schema: () => ({ from: (table: string) => ({ select: () => query(tables[table] ?? []) }) }),
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: rpc ?? null, error: null });
    },
  };
}

test("read layer: filters, explorer RPC, detail and helpers", async () => {
  assert.deepEqual(toRpcFilters({ countries: ["gb", "DE", "gb"], ielts_max: 6.5, tuition_max: 20000, platform: "ucas", program: " computer ", targets: true }), {
    countries: "GB,DE", platform: "ucas", program: "computer", targets: "true", ielts_max: 6.5, tuition_max: 20000,
  });
  assert.throws(() => toRpcFilters({ ielts_max: 10 }), DataV2Error);
  assert.throws(() => toRpcFilters({ countries: ["GBR"] }), DataV2Error);

  const client = fakeClient(
    {
      universities: [{ id: "u1", slug: "oxford" }],
      deadlines: [{ university_id: "u1", due_date: "2026-10-15" }],
      costs: [],
      admissions: [],
    },
    { ids: ["u1"], total: 1, medianTuition: "52404", medianAdmission: null, countries: 1 },
  );
  const result = await exploreUniversitiesV2(client, { countries: ["GB"] }, 2);
  assert.deepEqual(result, { ids: ["u1"], total: 1, medianTuition: 52404, medianAdmission: null, countries: 1 });
  assert.deepEqual(client.calls[0], { fn: "explore_universities_v2", args: { filters: { countries: "GB" }, page_number: 2 } });
  const detail = await getUniversityDetail(client, "oxford");
  assert.equal(detail?.deadlines.length, 1);
  assert.equal(await getUniversityDetail(client, "missing"), null);

  const d = (due_date: string | null) => ({ due_date }) as DeadlineRow;
  assert.equal(nextDeadline([d("2026-01-01"), d(null), d("2027-01-15"), d("2026-12-01")], "2026-11-16")?.due_date, "2026-12-01");
  const c = (academic_year: string, student_category: string) => ({ category: "tuition", programme_id: null, academic_year, student_category }) as CostRow;
  assert.equal(latestTuition([c("2023/24", "out_of_state"), c("2026/27", "out_of_state"), c("2026/27", "international")])?.student_category, "international");
  assert.equal(englishMinimum([{ kind: "IELTS", minimum: 7 }, { kind: "IELTS", minimum: 6.5 }] as never, "IELTS"), 6.5);
  assert.equal(pickLogo([{ kind: "logo", surface: "dark" }, { kind: "logo", surface: "light" }] as MediaRow[])?.surface, "light");
});

// ── The proposal itself on an in-memory Postgres ──

test("proposal applies; RLS is owner-only; explore_universities_v2 filters", async () => {
  const db = await freshV2Database();
  const src = uuidV5("src"), gb = uuidV5("gb"), de = uuidV5("de");
  await db.exec(`
    insert into v2.sources (id, url, retrieved_at) values ('${src}', 'https://example.org/x', '2026-11-15');
    insert into v2.universities (id, slug, name, country_code, is_target, target_rank) values
      ('${gb}', 'gb-uni', 'Gee Bee University', 'GB', true, 1), ('${de}', 'de-uni', 'Dee Ee Hochschule', 'DE', false, null);
    insert into v2.costs (id, university_id, academic_year, category, currency, amount, amount_usd, source_id) values
      ('${uuidV5("c1")}', '${gb}', '2026/27', 'tuition', 'GBP', 30000, 39600, '${src}'),
      ('${uuidV5("c2")}', '${de}', '2026/27', 'tuition', 'EUR', 3000, 3300, '${src}');
    insert into v2.application_requirements (id, university_id, intake_year, kind, label, minimum, source_id) values
      ('${uuidV5("r1")}', '${gb}', 2027, 'IELTS', 'IELTS', 7, '${src}'), ('${uuidV5("r2")}', '${de}', 2027, 'IELTS', 'IELTS', 6, '${src}');
    insert into v2.admissions (id, university_id, intake_year, platform, source_id) values ('${uuidV5("a1")}', '${gb}', 2027, 'ucas', '${src}');
    insert into v2.programmes (id, university_id, name, field) values ('${uuidV5("p1")}', '${de}', 'Informatik', 'Computer Science');
    insert into auth.users (id) values ('${uuidV5("alice")}'), ('${uuidV5("bob")}');
    insert into v2.my_colleges (user_id, university_id) values ('${uuidV5("alice")}', '${gb}');
  `);
  const explore = async (f: object) =>
    (await db.query<{ r: { ids: string[]; total: number } }>("select public.explore_universities_v2($1::jsonb, 1) r", [JSON.stringify(f)])).rows[0].r;
  assert.equal((await explore({})).total, 2);
  assert.deepEqual((await explore({ countries: "gb, de", ielts_max: 6.5 })).ids, [de]);
  assert.deepEqual((await explore({ tuition_max: 10000 })).ids, [de]);
  assert.deepEqual((await explore({ platform: "ucas" })).ids, [gb]);
  assert.deepEqual((await explore({ program: "computer" })).ids, [de]);
  assert.deepEqual((await explore({ targets: "true" })).ids, [gb]);
  assert.deepEqual((await explore({ sort: "tuition" })).ids, [de, gb]);
  await assert.rejects(explore({ nope: 1 }), /Unknown filter/);
  await assert.rejects(explore({ ielts_max: 12 }), /outside bounds/);

  // RLS as the API roles see it.
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uuidV5("bob")}', false);`);
  assert.equal((await db.query("select * from v2.my_colleges")).rows.length, 0, "bob cannot see alice's list");
  await assert.rejects(db.exec(`insert into v2.my_colleges (user_id, university_id) values ('${uuidV5("alice")}', '${de}')`));
  assert.equal((await db.query("select * from v2.universities")).rows.length, 2, "catalogue is public");
  await assert.rejects(db.exec(`insert into v2.sources (id, url, retrieved_at) values ('${uuidV5("s2")}', 'https://x.org', '2026-01-01')`));
  await db.exec(`select set_config('request.jwt.claim.sub', '${uuidV5("alice")}', false);`);
  assert.equal((await db.query("select * from v2.my_colleges")).rows.length, 1);
  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select * from v2.my_colleges"));
  await db.close();
});
