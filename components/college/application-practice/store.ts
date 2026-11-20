/** Practice progress lives on this device only (localStorage). Nothing is
 * written to the account or the database. */
import type { Values } from "./forms";

export type StoredUniversity = { id: string; name: string; slug: string; country_code: string; city: string | null; website: string | null };
export type PracticeState = { universities: StoredUniversity[]; values: Record<string, Values>; active: string; section: Record<string, string> };

const KEY = "collegestat-application-practice:v1";
export const emptyState = (): PracticeState => ({ universities: [], values: {}, active: "", section: {} });

export function loadState(): PracticeState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return emptyState();
    return {
      universities: Array.isArray(raw.universities) ? raw.universities.filter((u: StoredUniversity) => u && typeof u.id === "string" && typeof u.name === "string") : [],
      values: raw.values && typeof raw.values === "object" ? raw.values : {},
      active: typeof raw.active === "string" ? raw.active : "",
      section: raw.section && typeof raw.section === "object" ? raw.section : {},
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: PracticeState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** The writing desk keeps drafts per account on this device, keyed by
 * document id ("common_app", "why_us@<university id>"). */
export async function readWritingDraft(doc: string): Promise<string> {
  try {
    const { getSupabase } = await import("@/lib/supabase/client");
    const session = await getSupabase()?.auth.getSession();
    const owner = session?.data.session?.user.id;
    if (!owner) return "";
    const drafts = JSON.parse(localStorage.getItem("collegestat-writing:" + owner) || "{}");
    const body = drafts?.[doc]?.body;
    return typeof body === "string" ? body : "";
  } catch {
    return "";
  }
}
