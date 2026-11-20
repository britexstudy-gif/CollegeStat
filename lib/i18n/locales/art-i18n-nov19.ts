/**
 * Article translations (Nov 19): the note above a translated guide.
 * One row per key: [en, ru, uz, es, de, zh]. Spread into every locale file.
 */
const T = {
  "art.tr.note": ["Translated from English", "Переведено с английского", "Ingliz tilidan tarjima qilingan", "Traducido del inglés", "Aus dem Englischen übersetzt", "译自英文"],
  "art.tr.original": ["Show original", "Показать оригинал", "Asl matnni ko‘rsatish", "Ver original", "Original anzeigen", "查看原文"],
  "art.tr.showing": ["Showing the English original", "Показан английский оригинал", "Inglizcha asl matn ko‘rsatilmoqda", "Mostrando el original en inglés", "Englisches Original wird angezeigt", "正在显示英文原文"],
  "art.tr.back": ["Show translation", "Показать перевод", "Tarjimani ko‘rsatish", "Ver traducción", "Übersetzung anzeigen", "查看译文"],
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const artI18nEn = pick(0);
export const artI18nRu = pick(1);
export const artI18nUz = pick(2);
export const artI18nEs = pick(3);
export const artI18nDe = pick(4);
export const artI18nZh = pick(5);
