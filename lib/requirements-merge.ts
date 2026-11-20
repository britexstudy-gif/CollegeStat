/** Merging requirement rows from more than one published file. */
type Row = Record<string, unknown>;

const key = (r: Row) => `${r.university_id}|${String(r.kind).toUpperCase()}`;

/** Incoming rows minus any whose university already has that test kind (at university level)
 * in the existing rows, and minus repeats within the incoming rows. */
export function dedupeRequirements<T extends Row>(existing: Row[], incoming: T[]): T[] {
  const have = new Set(existing.filter((r) => r.program_id == null).map(key));
  const seen = new Set<string>();
  return incoming.filter((r) => {
    const k = key(r);
    if (have.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Same idea for any published rows: incoming rows whose key is already present, or repeated, are dropped. */
export function dedupeBy<T extends Row>(existing: Row[], incoming: T[], key: (r: T & Row) => string): T[] {
  const have = new Set(existing.map((r) => key(r as T & Row)));
  const seen = new Set<string>();
  return incoming.filter((r) => {
    const k = key(r);
    if (have.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
