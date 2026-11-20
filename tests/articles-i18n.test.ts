import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { localizedArticle, translationTable } from "../lib/articles-i18n";

const en = { slug: "sat-central-asia", title: "SAT", summary: "Register", body: "## In short\n\n- One" };

test("translations fall back to English field by field", () => {
  const table = translationTable({
    "../data/review/articles-i18n/ru/sat-central-asia.json": { slug: "sat-central-asia", title: "SAT по-русски", body: "## Коротко\n\n- Один" },
    "../data/review/articles-i18n/en/sat-central-asia.json": { title: "ignored" },
  });
  const ru = localizedArticle(en, "ru", table);
  assert.equal(ru.title, "SAT по-русски");
  assert.equal(ru.summary, "Register");
  assert.equal(ru.body, "## Коротко\n\n- Один");
  assert.equal(ru.translated, true);
  assert.deepEqual(localizedArticle(en, "de", table), { ...en, translated: false });
  assert.deepEqual(localizedArticle(en, "en", table), { ...en, translated: false });
});

test("every Russian guide keeps the English links and outline", () => {
  const dir = new URL("../data/review/articles-i18n/ru/", import.meta.url);
  const shape = (body: string) => ({
    heads: body.split("\n").filter((l) => l.startsWith("#")).map((l) => l.split(" ")[0]),
    links: body.match(/\]\(\S+?\)/g) ?? [],
  });
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const tr = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const src = JSON.parse(readFileSync(new URL("../data/review/articles-nov14/" + file, import.meta.url), "utf8"));
    assert.equal(tr.slug, src.slug, file);
    assert.ok(tr.title && tr.summary, file);
    assert.deepEqual(shape(tr.body), shape(src.body), file);
  }
});
