import type { Question } from "@/lib/certificates";

/** Digital SAT practice built like the real test: each section has Module 1
 * (a broad mix) and a second module that is either harder or easier,
 * depending on how Module 1 went. Built once from the bank's mock-only
 * questions (never shown in practice), so 2 tests × 2 sections × 3 modules
 * use every reserved question exactly once. */

export type SatSection = "reading_writing" | "math";
export type SatModuleSet = { m1: Question[]; hard: Question[]; easy: Question[] };
export type SatTest = { id: string; n: number; section: SatSection; minutes: number; perModule: number; modules: SatModuleSet };

const PER = { reading_writing: 27, math: 22 } as const;
const MINUTES = { reading_writing: 32, math: 35 } as const;
/** Module 1 correct answers needed for the harder Module 2 (about 55%). */
export const ROUTE_CUT = { reading_writing: 15, math: 12 } as const;

type Diff = "easy" | "medium" | "hard";
// Difficulty mix per module, per test. Easier route still keeps a couple of hard items.
const MIX: Record<SatSection, Record<keyof SatModuleSet, Record<Diff, number>>> = {
  reading_writing: { m1: { easy: 9, medium: 9, hard: 9 }, hard: { easy: 3, medium: 11, hard: 13 }, easy: { easy: 16, medium: 9, hard: 2 } },
  math: { m1: { easy: 7, medium: 8, hard: 7 }, hard: { easy: 2, medium: 9, hard: 11 }, easy: { easy: 15, medium: 7, hard: 0 } },
};
const RW_ORDER = ["Craft and Structure", "Information and Ideas", "Standard English Conventions", "Expression of Ideas"];
const RANK: Record<Diff, number> = { easy: 0, medium: 1, hard: 2 };
const FALLBACK: Record<Diff, Diff[]> = { easy: ["easy", "medium", "hard"], medium: ["medium", "easy", "hard"], hard: ["hard", "medium", "easy"] };

/** Bluebook order: R&W grouped by domain (as on test day), Math roughly easy → hard. */
function order(section: SatSection, list: Question[]) {
  const d = (q: Question) => RANK[(q.difficulty || "medium") as Diff];
  return [...list].sort((a, b) =>
    section === "reading_writing"
      ? RW_ORDER.indexOf(a.domain || "") - RW_ORDER.indexOf(b.domain || "") || d(a) - d(b)
      : d(a) - d(b) || (a.type === "grid_in" ? 1 : 0) - (b.type === "grid_in" ? 1 : 0),
  );
}

function build(section: SatSection, pool: Question[]): SatTest[] {
  // Spread each (domain, type) group evenly through its difficulty list, so
  // every module gets a fair share of domains and of grid-in questions.
  const left: Record<Diff, Question[]> = { easy: [], medium: [], hard: [] };
  const byKey = new Map<string, Question[]>();
  for (const q of pool) {
    const k = (q.difficulty || "medium") + "|" + (q.domain || "") + "|" + (q.type || "");
    byKey.set(k, [...(byKey.get(k) || []), q]);
  }
  for (const diff of ["easy", "medium", "hard"] as Diff[]) {
    left[diff] = [...byKey.entries()]
      .filter(([k]) => k.startsWith(diff + "|"))
      .flatMap(([, list]) => list.map((q, i) => ({ q, at: (i + 0.5) / list.length })))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.q);
  }
  const take = (diff: Diff) => {
    for (const d of FALLBACK[diff]) if (left[d].length) return left[d].shift()!;
    return null;
  };
  const keys = Object.keys(MIX[section]) as (keyof SatModuleSet)[];
  const sets: SatModuleSet[] = [1, 2].map(() => ({ m1: [], hard: [], easy: [] }));
  const slots = sets.flatMap((set) =>
    keys.map((m) => ({ list: set[m], diffs: (Object.entries(MIX[section][m]) as [Diff, number][]).flatMap(([d, c]) => Array<Diff>(c).fill(d)) })),
  );
  // Round-robin over all six modules, one question at a time.
  for (let i = 0; slots.some((s) => i < s.diffs.length); i++)
    for (const s of slots) {
      if (i >= s.diffs.length) continue;
      const q = take(s.diffs[i]);
      if (q) s.list.push(q);
    }
  return sets.map((set, i) => {
    for (const m of keys) set[m] = order(section, set[m]).slice(0, PER[section]);
    return { id: `sat-adaptive-${i + 1}-${section === "math" ? "math" : "rw"}`, n: i + 1, section, minutes: MINUTES[section] * 2, perModule: MINUTES[section] * 60, modules: set };
  });
}

let cache: SatTest[] | null = null;
export function satTests(bank: Question[]): SatTest[] {
  if (cache) return cache;
  const reserved = bank.filter((q) => q.mock_only);
  cache = [...build("reading_writing", reserved.filter((q) => q.section === "reading_writing")), ...build("math", reserved.filter((q) => q.section === "math"))].sort(
    (a, b) => a.n - b.n || (a.section === "reading_writing" ? -1 : 1),
  );
  return cache;
}

/** A section estimate on the 200–800 scale. The real SAT uses item-response
 * scoring per form; this only mirrors its shape: the easier Module 2 caps the
 * section near the middle of the scale, the harder one opens the top. */
export function estimateSection(route: "hard" | "easy", correct: number, total: number) {
  if (!total) return 200;
  const p = Math.max(0, Math.min(1, correct / total));
  const raw = route === "hard" ? 340 + 460 * Math.pow(p, 1.15) : 200 + 420 * Math.pow(p, 1.05);
  return Math.max(200, Math.min(800, Math.round(raw / 10) * 10));
}
