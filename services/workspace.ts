import { getSupabase } from "@/lib/supabase/client";
export type SavedUniversity = {
  id: string;
  university_id: string;
  status: string;
  deadline: string | null;
};
export type ResearchList = { id: string; name: string };
export type ListItem = {
  id: string;
  list_id: string;
  university_id: string;
  position: number;
};
export type Note = { id: string; university_id: string; body: string };
export type ChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  due_at: string | null;
};
export type SavedSearch = {
  id: string;
  name: string;
  filters: Record<string, string | number>;
};
export type SavedComparison = {
  id: string;
  name: string;
  university_ids: string[];
};
export type History = { id: string; university_id: string; viewed_at: string };
export type Workspace = {
  saved: SavedUniversity[];
  lists: ResearchList[];
  items: ListItem[];
  notes: Note[];
  checklist: ChecklistItem[];
  searches: SavedSearch[];
  comparisons: SavedComparison[];
  history: History[];
};
export const emptyWorkspace: Workspace = {
  saved: [],
  lists: [],
  items: [],
  notes: [],
  checklist: [],
  searches: [],
  comparisons: [],
  history: [],
};
export async function loadWorkspace(userId: string): Promise<Workspace> {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to access your workspace");
  const tables = [
    "saved_universities",
    "user_lists",
    "user_list_items",
    "user_notes",
    "user_checklist",
    "saved_searches",
    "comparison_lists",
    "research_history",
  ];
  const results = await Promise.all(
    tables.map((t) => db.from(t).select("*").eq("user_id", userId).limit(200)),
  );
  if (results.some((r) => r.error))
    throw new Error("Workspace could not be loaded. Please retry.");
  return Object.fromEntries(
    Object.keys(emptyWorkspace).map((k, i) => [k, results[i].data]),
  ) as Workspace;
}
export async function exportAccount(userId: string) {
  const db = getSupabase();
  if (!db) throw new Error("Sign in first");
  const tables = [
    "profiles",
    "saved_universities",
    "saved_scholarships",
    "comparison_lists",
    "shared_comparisons",
    "saved_searches",
    "user_lists",
    "user_list_items",
    "user_notes",
    "user_checklist",
    "fit_scores",
    "research_history",
    "notifications",
  ];
  const result: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
  };
  for (const table of tables) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq(table === "profiles" ? "id" : "user_id", userId);
    if (error) throw new Error("Account export failed");
    result[table] = data;
  }
  downloadJSON("collegestat-personal-data.json", result);
}
export function downloadJSON(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
