/** Keep published score intervals intact; never turn a band into a fabricated midpoint. */
export function scoreRange(label: string): { low: number; high: number } | null {
  const match = label.trim().match(/^(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?$/);
  if (!match) return null;
  const low = Number(match[1]), high = Number(match[2] ?? match[1]);
  return low >= 0 && high <= 100 && low <= high ? { low, high } : null;
}
