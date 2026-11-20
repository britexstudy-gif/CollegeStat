/** Fallback mark for universities without an official logo: one or two
 * letters from the distinctive words of the name and a tint chosen from the
 * brand palette by a stable hash, so a university always gets the same mark. */

// Calm tones that sit beside the CollegeStat blue in both themes.
const monogramPalette = [
  "#2563eb", // brand blue
  "#3b557e", // slate blue
  "#4f46e5", // indigo
  "#0f766e", // teal
  "#047857", // green
  "#a16207", // ochre
  "#b4533a", // terracotta
  "#7c3aed", // violet
  "#be185d", // raspberry
] as const;

const connectives = new Set(
  "of the and for in at on a an de del della dei degli di da do dos das du des la le les el los las y e et und fur für zu im am van von voor der den het en".split(
    " ",
  ),
);
// Words every institution shares; they make initials like "SSU" or "UOT".
const generic = new Set(
  "university universities universidad universidade università universita universite université universität universitat universiteit uniwersytet univerzita egyetem college colleges institute institut instituto istituto institution school schools academy akademie academia akademiya state national federal public private technical technological technology polytechnic politecnico polytechnique international higher education campus center centre faculty science sciences arts studies universiteti instituti akademiyasi davlat oliy xalqaro texnika milliy университет университеті университети институт академия государственный национальный технический международный мемлекеттік ұлттық халықаралық".split(
    " ",
  ),
);

export function monogramLetters(name: string, shortName?: string | null): string {
  const short = shortName?.trim();
  // A real acronym (e.g. "MIT", "NUS") is the institution's own mark.
  if (short && /^[\p{Lu}\p{N}&]{2,4}$/u.test(short)) return short;
  const words = name
    .replace(/\(.*?\)/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/[\s-]+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w && !connectives.has(w.toLowerCase()));
  if (!words.length) return "·";
  const distinctive = words.filter((w) => !generic.has(w.toLowerCase()));
  const first = (w: string) => Array.from(w)[0].toLocaleUpperCase();
  // Scripts without letter case (Chinese, Japanese, Korean …) read best as one character.
  if (!/[\p{Lu}\p{Ll}]/u.test(words[0])) return Array.from(words[0])[0];
  const pick = distinctive.length ? distinctive : words;
  return pick.slice(0, 2).map(first).join("");
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function monogramColor(key: string, brandColor?: string | null): string {
  if (brandColor && /^#[0-9a-f]{6}$/i.test(brandColor)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(brandColor.slice(i, i + 2), 16));
    // Very light or near-black brand colours cannot carry a tinted letter.
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (light > 0.12 && light < 0.7) return brandColor;
  }
  return monogramPalette[hash(key) % monogramPalette.length];
}
