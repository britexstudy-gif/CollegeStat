/** Admission rates are percentages, never proportions or missing-data placeholders. */
export function percentageRange(
  lower: number,
  upper: number,
): [number, number] {
  const bounded = (value: number, fallback: number) =>
    Number.isFinite(value)
      ? Math.round(Math.max(0, Math.min(100, value)) * 10) / 10
      : fallback;
  const a = bounded(lower, 0),
    b = bounded(upper, 100);
  return a <= b ? [a, b] : [b, a];
}
