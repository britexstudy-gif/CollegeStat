import { University, tuition } from "./domain";
// Similarity is descriptive overlap, never an admission prediction.
export function similarity(a: University, b: University) {
  const reasons: string[] = [];
  let score = 0;
  if (a.id === b.id) return { score: 0, reasons };
  if (a.country_code === b.country_code) {
    score += 30;
    reasons.push("Same country");
  }
  if (a.university_type && a.university_type === b.university_type) {
    score += 15;
    reasons.push("Same institution type");
  }
  const fields = new Set(
    a.university_programs.map((p) => p.programs.subject.toLowerCase()),
  );
  const shared = [
    ...new Set(
      b.university_programs
        .map((p) => p.programs.subject.toLowerCase())
        .filter((f) => fields.has(f)),
    ),
  ];
  if (shared.length) {
    score += 35;
    reasons.push("Shared fields: " + shared.join(", "));
  }
  const ac = tuition(a),
    bc = tuition(b);
  if (
    ac &&
    bc &&
    ac.currency === bc.currency &&
    ac.year === bc.year &&
    Math.abs(ac.amount - bc.amount) <= Math.max(ac.amount, bc.amount) * 0.2
  ) {
    score += 20;
    reasons.push("Reported tuition within 20% · same year and currency");
  }
  return { score, reasons };
}
