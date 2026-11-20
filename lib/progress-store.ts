"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import {
  awardFor,
  DAILY_GOAL,
  isActivityKind,
  utcDay,
  xpOn,
  type ActivityEvent,
  type ActivityKind,
} from "@/lib/student-progress";

/** XP history lives in the browser first so progress feels instant, and is
 * mirrored to `student_activity` (where XP is assigned server-side). When the
 * table is not available yet, the local copy keeps streaks working. */
const EVENT = "collegestat-progress";
const key = (owner: string) => "collegestat-progress:" + owner;
const KEEP_DAYS = 180;

const LABELS: Record<ActivityKind, string> = {
  practice: "Practice set done",
  article: "Article read",
  task: "Task completed",
  shortlist: "University saved",
  ai: "Asked your AI coach",
  writing: "Writing saved",
  profile: "Profile updated",
  checkin: "Weekly check-in",
};

function parse(raw: string | null): ActivityEvent[] {
  try {
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value)
      ? value.filter(
          (e): e is ActivityEvent =>
            !!e &&
            isActivityKind(e.kind) &&
            typeof e.ref === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(e.day) &&
            Number.isInteger(e.xp),
        )
      : [];
  } catch {
    return [];
  }
}

function readLocal(owner: string) {
  try {
    return parse(localStorage.getItem(key(owner)));
  } catch {
    return [];
  }
}

function writeLocal(owner: string, events: ActivityEvent[]) {
  const cutoff = utcDay(new Date(Date.now() - KEEP_DAYS * 86400000));
  const kept = events.filter((e) => e.day >= cutoff).slice(-1500);
  try {
    localStorage.setItem(key(owner), JSON.stringify(kept));
  } catch {
    /* storage full or blocked: progress still shows for this session */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: owner }));
  return kept;
}

async function currentOwner() {
  const session = await getSupabase()?.auth.getSession();
  return session?.data.session?.user.id ?? null;
}

/** Log a step. Duplicate steps on the same day are ignored. */
export async function recordActivity(
  kind: ActivityKind,
  ref: string = kind,
  options: { silent?: boolean } = {},
) {
  const owner = await currentOwner().catch(() => null);
  if (!owner) return;
  const safeRef = ref.slice(0, 120) || kind;
  const day = utcDay();
  const events = readLocal(owner);
  const xp = awardFor(events, kind, safeRef, day);
  if (xp === null) return;
  const before = xpOn(events, day);
  events.push({ kind, ref: safeRef, day, xp });
  writeLocal(owner, events);
  if (xp > 0 && !options.silent) {
    if (before < DAILY_GOAL && before + xp >= DAILY_GOAL)
      toast.success("Daily goal reached 🔥", {
        description: `+${xp} XP · ${LABELS[kind]}. Your streak is safe today.`,
      });
    else toast(`+${xp} XP`, { description: LABELS[kind] });
  }
  if (remoteMissing()) return;
  void getSupabase()
    ?.from("student_activity")
    .insert({ user_id: owner, kind, ref: safeRef })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** When the project has no `student_activity` table yet (migration not applied),
 * PostgREST answers 404 on every call. Remember that for the session so the
 * dashboard asks once instead of on every mount; progress stays on this device. */
const MISSING_KEY = "collegestat-activity-remote-missing";
let missing = false;
function remoteMissing() {
  if (missing) return true;
  try {
    missing = sessionStorage.getItem(MISSING_KEY) === "1";
  } catch {}
  return missing;
}
function markRemoteMissing() {
  missing = true;
  try {
    sessionStorage.setItem(MISSING_KEY, "1");
  } catch {}
}
const inflight = new Map<string, Promise<ActivityEvent[] | null>>();

function loadRemote(owner: string) {
  if (remoteMissing()) return Promise.resolve(null);
  const running = inflight.get(owner);
  if (running) return running;
  const job = fetchRemote(owner).finally(() => inflight.delete(owner));
  inflight.set(owner, job);
  return job;
}

async function fetchRemote(owner: string) {
  const db = getSupabase();
  if (!db) return null;
  const since = utcDay(new Date(Date.now() - KEEP_DAYS * 86400000));
  const { data, error } = await db
    .from("student_activity")
    .select("kind,ref,day,xp")
    .eq("user_id", owner)
    .gte("day", since)
    .order("created_at", { ascending: true })
    .limit(1500);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|does not exist/i.test(error.message || "")) markRemoteMissing();
    return null;
  }
  return parse(JSON.stringify(data));
}

/** Activity history for the signed-in student, kept in sync across tabs. */
export function useProgress(owner: string | null | undefined) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [synced, setSynced] = useState<"local" | "remote">("local");
  const refresh = useCallback(() => {
    if (owner) setEvents(readLocal(owner));
  }, [owner]);
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    // Initial read from storage, after mount so SSR markup matches.
    queueMicrotask(() => alive && setEvents(readLocal(owner)));
    void loadRemote(owner).then((remote) => {
      if (!alive || !remote) return;
      const merged = new Map<string, ActivityEvent>();
      for (const e of readLocal(owner)) merged.set(`${e.kind}|${e.ref}|${e.day}`, e);
      for (const e of remote) merged.set(`${e.kind}|${e.ref}|${e.day}`, e);
      const list = [...merged.values()].sort((a, b) =>
        a.day.localeCompare(b.day),
      );
      setEvents(writeLocal(owner, list));
      setSynced("remote");
    });
    const onChange = (event: Event) => {
      if ((event as CustomEvent).detail === owner) refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === key(owner)) refresh();
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [owner, refresh]);
  return { events, synced };
}
