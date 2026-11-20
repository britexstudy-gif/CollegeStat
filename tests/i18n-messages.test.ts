import { test } from "node:test";
import assert from "node:assert/strict";
import { fillVars, translate, translateFrom } from "../lib/i18n/messages";
import { resolveLang, type Lang } from "../lib/i18n/languages";
import { en } from "../lib/i18n/locales/en";
import { ru } from "../lib/i18n/locales/ru";
import { uz } from "../lib/i18n/locales/uz";
import { es } from "../lib/i18n/locales/es";
import { de } from "../lib/i18n/locales/de";
import { zh } from "../lib/i18n/locales/zh";

test("missing messages fall back to English, then to the key", () => {
  type Key = "hello" | "only_en" | "nowhere";
  const dicts: Partial<Record<Lang, Partial<Record<Key, string>>>> = {
    en: { hello: "Hello", only_en: "English only" },
    ru: { hello: "Привет" },
  };
  assert.equal(translateFrom(dicts, "ru", "hello"), "Привет");
  assert.equal(translateFrom(dicts, "ru", "only_en"), "English only");
  assert.equal(translateFrom(dicts, "de", "hello"), "Hello");
  assert.equal(translateFrom(dicts, "ru", "nowhere"), "nowhere");
});

test("placeholders are filled; unknown ones stay visible", () => {
  assert.equal(fillVars("{n} of {max}", { n: 3, max: 5 }), "3 of 5");
  assert.equal(fillVars("{n} of {max}", { n: 0 }), "0 of {max}");
  assert.equal(fillVars("no vars {n}"), "no vars {n}");
  assert.equal(translate("de", "wd.timer.minutes", { n: 25 }), "25 Minuten");
  assert.equal(translate("en", "obp.title.named", { name: "Aziza" }), "Aziza, your personalised plan");
});

test("every language has the same keys, placeholders and emphasis tags as English", () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  const tags = (s: string) => ["<em>", "</em>", "<b>", "</b>"].map((t) => s.split(t).length - 1).join(",");
  for (const [lang, dict] of Object.entries({ ru, uz, es, de, zh }) as [string, Record<string, string>][]) {
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(en).sort(), lang + " keys");
    for (const [key, source] of Object.entries(en)) {
      assert.ok(dict[key].trim(), `${lang} ${key} is empty`);
      assert.equal(placeholders(dict[key]), placeholders(source), `${lang} ${key} placeholders`);
      assert.equal(tags(dict[key]), tags(source), `${lang} ${key} tags`);
    }
  }
});

test("Uzbek stays in Latin script", () => {
  for (const [key, text] of Object.entries(uz)) assert.ok(!/[Ѐ-ӿ]/.test(text), "Cyrillic in uz " + key);
});

test("language comes from the cookie, then the browser, then English", () => {
  assert.equal(resolveLang("ru", "de-DE,de;q=0.9"), "ru");
  assert.equal(resolveLang("xx", "fr-FR, de;q=0.8"), "de");
  assert.equal(resolveLang(undefined, "zh-CN"), "zh");
  assert.equal(resolveLang(null, "fr, it"), "en");
});
