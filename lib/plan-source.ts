/** Which plan tasks the AI added. `user_checklist` has no "source" column, so the ids of tasks
 * created from a confirmed AI card are remembered in this browser, per account. */
const key = (owner: string) => "collegestat-ai-tasks:" + owner;

export function aiTaskIds(owner: string | undefined): Set<string> {
  if (!owner) return new Set();
  try {
    const list = JSON.parse(localStorage.getItem(key(owner)) || "[]");
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function markAiTasks(owner: string, ids: string[]) {
  try {
    const all = [...aiTaskIds(owner), ...ids].slice(-400);
    localStorage.setItem(key(owner), JSON.stringify(all));
  } catch {
    /* storage blocked: the task is still saved, only the "AI" label is lost */
  }
}
