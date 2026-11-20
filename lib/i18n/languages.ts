/** Interface languages. `english` is the name sent to the AI so replies match the interface. */
export const LANGUAGES = [
  { code: "en", name: "English", english: "English" },
  { code: "uz", name: "Oʻzbekcha", english: "Uzbek" },
  { code: "ru", name: "Русский", english: "Russian" },
  { code: "es", name: "Español", english: "Spanish" },
  { code: "de", name: "Deutsch", english: "German" },
  { code: "zh", name: "中文", english: "Simplified Chinese" },
] as const;
export type Lang = (typeof LANGUAGES)[number]["code"];
export const LANG_CODES = LANGUAGES.map((l) => l.code) as [Lang, ...Lang[]];
export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "cs-lang";

export const isLang = (value: unknown): value is Lang =>
  typeof value === "string" && (LANG_CODES as readonly string[]).includes(value);

export const languageName = (code: unknown) =>
  LANGUAGES.find((l) => l.code === code)?.english ?? "English";

/** Picks the interface language: saved cookie first, then the browser's
 * Accept-Language list, then English. */
export function resolveLang(cookie: string | undefined | null, acceptLanguage: string | undefined | null): Lang {
  if (isLang(cookie)) return cookie;
  // Header is client-controlled: bound the work, and honour "q=0" (= not acceptable).
  for (const part of (acceptLanguage || "").slice(0, 512).split(",").slice(0, 20)) {
    const [tag, ...params] = part.split(";");
    if (params.some((p) => /^\s*q\s*=\s*0(\.0*)?\s*$/i.test(p))) continue;
    const code = tag.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}
