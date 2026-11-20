import test from "node:test";
import assert from "node:assert/strict";
import { rankingsView } from "../server/rankings-view";

const view = (q: string) => rankingsView(new URLSearchParams(q));

test("the default view is the QS table with scores, 50 rows a page", async () => {
  const data = await view("");
  assert.equal(data.view, "qs");
  assert.equal(data.rows.length, 50);
  assert.equal(data.rows[0].rank, "1");
  assert.ok(data.hasScore);
  assert.ok(data.pages > 1);
});

test("an unknown or unimported publisher falls back to QS", async () => {
  assert.equal((await view("provider=usnews")).view, "qs");
  assert.equal((await view("provider=nope")).view, "qs");
});

test("the Central Asia shortcut keeps only its five countries", async () => {
  const data = await view("provider=webometrics&region=central-asia");
  assert.ok(data.total > 0);
  assert.ok(data.rows.every((r) => ["KZ", "UZ", "KG", "TJ", "TM"].includes(r.cc)));
});

test("search and country filters narrow the table; page numbers clamp", async () => {
  const kz = await view("provider=the&country=KZ");
  assert.ok(kz.rows.every((r) => r.cc === "KZ"));
  assert.equal((await view("q=massachusetts")).rows[0].name.includes("Massachusetts"), true);
  assert.equal((await view("page=9999")).page, (await view("page=9999")).pages);
});

test("the national view lists countries, then ranks one country by position within it", async () => {
  const picker = await view("provider=national");
  assert.equal(picker.rows.length, 0);
  assert.ok(picker.countries.some((c) => c.code === "KZ"));
  const kz = await view("provider=national&country=KZ");
  assert.ok(kz.nationalBy.includes("qs"));
  assert.equal(kz.rows[0].rank, "1");
  assert.ok(kz.rows.every((r) => r.cc === "KZ"));
  const us = await view("provider=national&country=US&by=herd");
  assert.equal(us.by, "herd");
  assert.equal(us.scoreLabel, "rd");
});

test("rows with a profile carry what the logo and the profile link need", async () => {
  const row = (await view("")).rows.find((r) => r.uni)!;
  assert.ok(row.uni!.slug && row.uni!.id);
});
