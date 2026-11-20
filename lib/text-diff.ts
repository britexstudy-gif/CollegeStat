/** Word-level diff (LCS) between two drafts, for version history. */
export type DiffPart = { type: "same" | "add" | "del"; text: string };

export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter((x) => x !== ""),
    b = after.split(/(\s+)/).filter((x) => x !== "");
  // Bound the work for very long drafts.
  if (a.length * b.length > 4_000_000) return [{ type: "del", text: before }, { type: "add", text: after }];
  const dp: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return out;
}
