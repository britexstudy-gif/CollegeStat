/** Text helpers shared by the search index builder, the query parser and the
 * engine: lowercase folding, Cyrillic → Latin transliteration, a loose
 * phonetic key (so "оксфорд", "Oksford" and "Oxford" meet) and a bounded
 * edit distance for typos. Pure and dependency-free so they run in the
 * Worker, the browser and Node alike. */

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Uzbek, Kazakh, Kyrgyz and Tajik Cyrillic letters
  ў: "o", қ: "q", ғ: "g", ҳ: "h", ә: "a", ө: "o", ү: "u", ұ: "u", і: "i", ң: "ng", һ: "h", ҷ: "j", ӣ: "i", ӯ: "u",
};

/** Lowercase, strip accents and apostrophes (Uzbek o‘ g‘ sh), keep letters and digits. */
export function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘ʼʻ`'´]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}.,$€£+]+/gu, " ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Latin spelling of a folded string; Latin input passes through. */
export function translit(value: string): string {
  let out = "";
  for (const ch of value) out += CYRILLIC[ch] ?? ch;
  return out;
}

export const hasCyrillic = (value: string) => /[Ѐ-ӿ]/.test(value);

/** Words of a string, folded and transliterated, without punctuation. */
export function words(value: string): string[] {
  return translit(fold(value))
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** A loose sound-alike key for one Latin word. Both the index and the query
 * pass through it, so spelling variants across languages collapse:
 * oxford/oksford, massachusetts/massachusets, cambridge/kembridzh. */
export function phonetic(word: string): string {
  let w = word.toLowerCase();
  if (/^\d+$/.test(w)) return w;
  w = w
    .replace(/shch/g, "sh")
    .replace(/sch/g, "sh")
    .replace(/dzh|dg|zh/g, "j")
    .replace(/kh/g, "h")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/gh/g, "g")
    .replace(/ck/g, "k")
    .replace(/x/g, "ks")
    .replace(/q/g, "k")
    .replace(/c(?!h)/g, "k")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
  if (w.length > 4) w = w.replace(/(ii|ai|oi|ui)$/, "i").replace(/e$/, "");
  return w;
}

/** Edit distance with adjacent transpositions, giving up above `max`. */
export function distance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[n];
}

/** How many typos a word of this length may carry. */
export const typoBudget = (length: number) => (length <= 3 ? 0 : length <= 5 ? 1 : 2);
