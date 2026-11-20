"use client";
import { getSupabase } from "@/lib/supabase/client";

export type LeaderRow = {
  rank: number;
  display_name: string;
  xp: number;
  active_days: number;
  is_me: boolean;
};
export type GroupTopic = "test" | "country" | "field" | "funding" | "other";
export type GroupStat = {
  group_slug: string;
  name: string;
  topic: GroupTopic;
  description: string;
  mine: boolean;
  members: number;
  weekly_xp: number;
  active_today: number;
  joined: boolean;
};
export type PeerRow = { university_id: string; students: number; peers: number };

/** `null` means the feature is not available on this database yet. */
type Result<T> = Promise<T | null>;

const numbers = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
  rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const k of keys) copy[k] = Number(copy[k]) || 0;
    return copy as T;
  });

export async function loadLeaderboard(): Result<{
  rows: LeaderRow[];
  joined: string | null;
}> {
  const db = getSupabase();
  if (!db) return null;
  const [board, me] = await Promise.all([
    db.rpc("weekly_leaderboard", { result_limit: 10 }),
    db.from("leaderboard_members").select("display_name").maybeSingle(),
  ]);
  if (board.error || me.error) return null;
  return {
    rows: numbers((board.data || []) as LeaderRow[], ["rank", "xp", "active_days"]),
    joined: (me.data as { display_name?: string } | null)?.display_name ?? null,
  };
}

export async function joinLeaderboard(owner: string, name: string) {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to join the leaderboard.");
  const display_name = name.trim().slice(0, 40);
  if (display_name.length < 2) throw new Error("Choose a name of 2–40 characters.");
  const { error } = await db
    .from("leaderboard_members")
    .upsert({ user_id: owner, display_name }, { onConflict: "user_id" });
  if (error) throw new Error("Could not join the leaderboard. Please retry.");
}

export async function leaveLeaderboard(owner: string) {
  const { error } =
    (await getSupabase()?.from("leaderboard_members").delete().eq("user_id", owner)) ?? {};
  if (error) throw new Error("Could not leave the leaderboard. Please retry.");
}

export async function loadGroups(): Result<GroupStat[]> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.rpc("study_group_overview");
  if (error) return null;
  return numbers((data || []) as GroupStat[], ["members", "weekly_xp", "active_today"]);
}

export async function setGroupMembership(owner: string, slug: string, join: boolean) {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to join a group.");
  const { error } = join
    ? await db.from("study_group_members").insert({ user_id: owner, group_slug: slug })
    : await db
        .from("study_group_members")
        .delete()
        .eq("user_id", owner)
        .eq("group_slug", slug);
  if (error && error.code !== "23505")
    throw new Error("Could not update the group. Please retry.");
}

/** A readable, unique slug: "sat-1500-sprint-k3f9". */
function groupSlug(name: string, suffix = Math.random().toString(36).slice(2, 6)) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return `${base || "group"}-${suffix}`;
}

export async function createGroup(
  owner: string,
  input: { name: string; topic: GroupTopic; description: string },
) {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to create a group.");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 60) throw new Error("Use a group name of 3–60 characters.");
  const description = input.description.trim().slice(0, 280);
  const slug = groupSlug(name);
  const { error } = await db
    .from("study_groups")
    .insert({ slug, name, topic: input.topic, description, created_by: owner });
  if (error)
    throw new Error(
      /5 groups/.test(error.message) ? "You can create up to 5 groups." : "Could not create the group. Please retry.",
    );
  await setGroupMembership(owner, slug, true);
  return slug;
}

export async function deleteGroup(slug: string) {
  const { error } = (await getSupabase()?.from("study_groups").delete().eq("slug", slug)) ?? {};
  if (error) throw new Error("Could not delete the group. Please retry.");
}

export async function loadPeers(field?: string, country?: string): Result<PeerRow[]> {
  const db = getSupabase();
  if (!db || (!field && !country)) return null;
  const { data, error } = await db.rpc("peer_insights", {
    p_field: field || null,
    p_country: country || null,
  });
  if (error) return null;
  return numbers((data || []) as PeerRow[], ["students", "peers"]);
}
