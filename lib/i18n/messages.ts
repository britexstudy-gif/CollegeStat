import { DEFAULT_LANG, type Lang } from "./languages";
import { en } from "./locales/en";
import { uz } from "./locales/uz";
import { ru } from "./locales/ru";
import { es } from "./locales/es";
import { de } from "./locales/de";
import { zh } from "./locales/zh";

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export type MessageVars = Record<string, string | number>;

const DICTIONARIES: Record<Lang, Partial<Messages>> = { en, uz, ru, es, de, zh };

/** Fills `{name}` placeholders; unknown names stay visible so gaps are noticed. */
export function fillVars(text: string, vars?: MessageVars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
}

/** Lookup over the given dictionaries: chosen language, then English, then the key. */
export function translateFrom<K extends string>(
  dictionaries: Partial<Record<Lang, Partial<Record<K, string>>>>,
  lang: Lang,
  key: K,
  vars?: MessageVars,
): string {
  return fillVars(dictionaries[lang]?.[key] ?? dictionaries[DEFAULT_LANG]?.[key] ?? key, vars);
}

/** Looks a message up in the chosen language, falling back to English, and
 * fills `{name}` placeholders. */
export function translate(lang: Lang, key: MessageKey, vars?: MessageVars): string {
  return translateFrom(DICTIONARIES, lang, key, vars);
}
