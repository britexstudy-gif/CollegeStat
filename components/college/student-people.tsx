"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  Crown,
  Globe2,
  GraduationCap,
  Link as LinkIcon,
  LogOut,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { Skeleton } from "@/components/ui/skeleton";
import { UniversityLogo } from "./primitives";
import { PeopleArt, TrophyArt } from "./hub-illustrations";
import { countryName, type University } from "@/lib/domain";
import { universitiesByIds } from "@/lib/supabase/catalogue";
import {
  createGroup,
  deleteGroup,
  joinLeaderboard,
  leaveLeaderboard,
  loadGroups,
  loadLeaderboard,
  loadPeers,
  setGroupMembership,
  type GroupStat,
  type GroupTopic,
  type LeaderRow,
} from "@/lib/people-service";
import type { IntakePreferences } from "@/lib/student-intake";

type Load<T> = { status: "loading" } | { status: "off" } | { status: "ready"; data: T };

/** Universities that students with the same goals have saved (k ≥ 3). */
export function StudentsLikeMe({ prefs }: { prefs: IntakePreferences }) {
  const field = prefs.field?.trim() || "";
  const country = prefs.countries?.[0] || "";
  const [state, setState] = useState<
    Load<{ rows: { u: University; students: number }[]; peers: number }>
  >({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void (async () => {
      const rows = await loadPeers(field, country).catch(() => null);
      if (!alive) return;
      if (!rows) return setState({ status: "off" });
      const list = rows.length
        ? await universitiesByIds(rows.map((r) => r.university_id), controller.signal).catch(() => [])
        : [];
      if (!alive) return;
      const byId = new Map(list.map((u) => [u.id, u]));
      setState({
        status: "ready",
        data: {
          peers: rows[0]?.peers ?? 0,
          rows: rows.flatMap((r) => {
            const u = byId.get(r.university_id);
            return u ? [{ u, students: r.students }] : [];
          }),
        },
      });
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [field, country]);
  const who = [field && `studying ${field}`, country && `heading to ${countryName(country)}`]
    .filter(Boolean)
    .join(", ");
  return (
    <section className="hub-tile hub-peers" aria-labelledby="hub-peers-title">
      <header className="hub-tile-head">
        <h2 id="hub-peers-title">
          <Users size={17} aria-hidden="true" /> Students like you
        </h2>
        <PeopleArt />
      </header>
      <p className="hub-tile-sub">
        {who ? `Anonymous picks from students ${who}.` : "Add your subject and destination to meet students like you."}
      </p>
      {state.status === "loading" ? (
        <div className="hub-stack">
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      ) : state.status === "ready" && state.data.rows.length ? (
        <ol className="hub-peer-list">
          {state.data.rows.slice(0, 4).map(({ u, students }) => (
            <li key={u.id}>
              <Link href={"/dashboard/university/" + u.slug}>
                <UniversityLogo university={u} size="sm" />
                <span>
                  <strong>{u.name}</strong>
                  <small>{countryName(u.country_code)}</small>
                </span>
                <em>
                  {students} saved
                </em>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="hub-note">
          <strong>Not enough students like you yet</strong>
          <span>
            To protect everyone’s privacy, a university appears here only once at least
            three similar students have saved it.
          </span>
        </div>
      )}
    </section>
  );
}

/** Opt-in weekly XP leaderboard. */
export function Leaderboard({
  owner,
  displayName,
  weeklyXp,
}: {
  owner: string;
  displayName: string;
  weeklyXp: number;
}) {
  const [state, setState] = useState<Load<{ rows: LeaderRow[]; joined: string | null }>>({
    status: "loading",
  });
  const [name, setName] = useState(displayName.split(" ")[0] || "");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadLeaderboard()
      .catch(() => null)
      .then((data) => alive && setState(data ? { status: "ready", data } : { status: "off" }));
    return () => {
      alive = false;
    };
  }, [reload, weeklyXp]);
  const act = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setReload((n) => n + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="hub-tile hub-board" aria-labelledby="hub-board-title">
      <header className="hub-tile-head">
        <h2 id="hub-board-title">
          <Crown size={17} aria-hidden="true" /> Weekly leaderboard
        </h2>
        <TrophyArt />
      </header>
      {state.status === "loading" ? (
        <div className="hub-stack">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 rounded-xl" />
          ))}
        </div>
      ) : state.status === "off" ? (
        <div className="hub-note">
          <strong>You: {weeklyXp} XP this week</strong>
          <span>The shared leaderboard switches on with the next workspace update. Your XP is already counting.</span>
        </div>
      ) : !state.data.joined ? (
        <form
          className="hub-board-join"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => joinLeaderboard(owner, name), "You’re on this week’s leaderboard");
          }}
        >
          <p className="hub-tile-sub">
            Compete on effort, not grades. Only the name you choose and your weekly XP are shown.
          </p>
          <div className="hub-inline">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={40}
              required
              aria-label="Name shown on the leaderboard"
              placeholder="Name to show"
            />
            <button className="hub-btn hub-btn-primary" disabled={busy}>
              Join
            </button>
          </div>
          {!!state.data.rows.length && (
            <small className="hub-muted">{state.data.rows.length} students competing this week</small>
          )}
        </form>
      ) : (
        <>
          <ol className="hub-board-list">
            {state.data.rows.map((row) => (
              <li key={row.rank + row.display_name} className={row.is_me ? "is-me" : undefined}>
                <span className={"hub-rank r" + Math.min(row.rank, 4)}>{row.rank}</span>
                <strong>{row.is_me ? `${row.display_name} (you)` : row.display_name}</strong>
                <small>{row.active_days}d</small>
                <em>{row.xp} XP</em>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="hub-link hub-link-quiet"
            disabled={busy}
            onClick={() => void act(() => leaveLeaderboard(owner), "You left the leaderboard")}
          >
            <LogOut size={13} aria-hidden="true" /> Leave leaderboard
          </button>
        </>
      )}
    </section>
  );
}

const GROUP_ICON = { test: BookOpen, country: Globe2, field: GraduationCap, funding: Wallet, other: Users };
const TOPICS: { id: GroupTopic; label: string }[] = [
  { id: "test", label: "Test prep" },
  { id: "country", label: "Destination" },
  { id: "field", label: "Subject" },
  { id: "funding", label: "Scholarships" },
  { id: "other", label: "Other" },
];

/** Groups students create themselves: browse, join, or start your own. */
export function StudyGroups({ owner }: { owner: string; prefs?: IntakePreferences }) {
  const [state, setState] = useState<Load<GroupStat[]>>({ status: "loading" });
  const [busy, setBusy] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<GroupTopic | "all">("all");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", topic: "test" as GroupTopic, description: "" });
  const [highlight, setHighlight] = useState("");
  useEffect(() => {
    let alive = true;
    const wanted = new URLSearchParams(window.location.search).get("group") || "";
    void loadGroups()
      .catch(() => null)
      .then((data) => {
        if (!alive) return;
        setState(data ? { status: "ready", data } : { status: "off" });
        setHighlight(wanted);
      });
    return () => {
      alive = false;
    };
  }, [owner, reload]);
  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      setReload((n) => n + 1);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Please retry.");
      return false;
    } finally {
      setBusy("");
    }
  };
  const groups = state.status === "ready" ? state.data : [];
  const q = query.trim().toLowerCase();
  const shown = groups
    .filter((g) => (topic === "all" || g.topic === topic) && (!q || (g.name + " " + g.description).toLowerCase().includes(q)))
    .sort((a, b) => Number(b.group_slug === highlight) - Number(a.group_slug === highlight) || Number(b.joined) - Number(a.joined));
  const copyInvite = async (slug: string) => {
    const url = `${window.location.origin}/dashboard/people?group=${encodeURIComponent(slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.message(url);
    }
  };

  return (
    <section className="hub-tile hub-groups" aria-labelledby="hub-groups-title">
      <header className="hub-tile-head">
        <h2 id="hub-groups-title">
          <Users size={17} aria-hidden="true" /> Study groups
        </h2>
        {state.status === "ready" && (
          <button type="button" className="hub-btn hub-btn-primary" onClick={() => setCreating((v) => !v)}>
            <Plus size={14} aria-hidden="true" /> {creating ? "Cancel" : "Create group"}
          </button>
        )}
      </header>

      {state.status === "loading" ? (
        <div className="hub-stack">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : state.status === "off" ? (
        <div className="hub-note">
          <strong>Groups are almost ready</strong>
          <span>Student-created groups switch on with the next database update.</span>
        </div>
      ) : (
        <>
          {creating && (
            <form
              className="hub-group-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act("create", () => createGroup(owner, form), `Created ${form.name.trim()}`)) {
                  setCreating(false);
                  setForm({ name: "", topic: "test", description: "" });
                }
              }}
            >
              <label>
                <span>Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  minLength={3}
                  maxLength={60}
                  required
                  placeholder="e.g. SAT 1500 sprint · Dec 2026"
                />
              </label>
              <label>
                <span>Topic</span>
                <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value as GroupTopic })}>
                  {TOPICS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="is-wide">
                <span>What is it for? (optional)</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  maxLength={280}
                  rows={2}
                  placeholder="Daily practice and weekly mock check-ins."
                />
              </label>
              <p className="is-wide hub-muted">
                Group names are visible to all students. Members only see counts and weekly effort, never who joined.
              </p>
              <button className="hub-btn hub-btn-primary is-wide" disabled={busy === "create"}>
                Create and join
              </button>
            </form>
          )}

          {groups.length > 0 && (
            <div className="hub-group-filters">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search groups"
                aria-label="Search groups"
              />
              <select value={topic} onChange={(e) => setTopic(e.target.value as GroupTopic | "all")} aria-label="Topic">
                <option value="all">All topics</option>
                {TOPICS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!groups.length ? (
            <div className="hub-note">
              <strong>No groups yet</strong>
              <span>Be the first: create a group for your test, subject or destination and invite friends.</span>
            </div>
          ) : (
            <ul className="hub-group-list">
              {shown.map((group) => {
                const Icon = GROUP_ICON[group.topic] || Users;
                return (
                  <li key={group.group_slug} className={(group.joined ? "is-in " : "") + (group.group_slug === highlight ? "is-highlight" : "")}>
                    <span className={"hub-group-icon t-" + group.topic}>
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="hub-group-copy">
                      <strong>
                        {group.name}
                        {group.mine && <em>Yours</em>}
                      </strong>
                      <small>
                        {group.members} {group.members === 1 ? "member" : "members"} · {group.weekly_xp} XP this week
                        {group.active_today ? ` · ${group.active_today} active today` : ""}
                        {group.description ? ` · ${group.description}` : ""}
                      </small>
                    </span>
                    <span className="hub-group-actions">
                      {group.joined && (
                        <button type="button" className="hub-icon-btn" aria-label={"Copy invite link for " + group.name} title="Copy invite link" onClick={() => void copyInvite(group.group_slug)}>
                          <LinkIcon size={14} aria-hidden="true" />
                        </button>
                      )}
                      {group.mine && (
                        <button
                          type="button"
                          className="hub-icon-btn"
                          aria-label={"Delete " + group.name}
                          title="Delete group"
                          disabled={busy === group.group_slug}
                          onClick={() =>
                            window.confirm(`Delete “${group.name}” for everyone?`) &&
                            void act(group.group_slug, () => deleteGroup(group.group_slug), "Group deleted")
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        className={"hub-btn " + (group.joined ? "hub-btn-soft" : "hub-btn-outline")}
                        disabled={busy === group.group_slug}
                        aria-pressed={group.joined}
                        onClick={() =>
                          void act(
                            group.group_slug,
                            () => setGroupMembership(owner, group.group_slug, !group.joined),
                            group.joined ? `Left ${group.name}` : `Joined ${group.name}`,
                          )
                        }
                      >
                        {group.joined ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                        {group.joined ? "Joined" : "Join"}
                      </button>
                    </span>
                  </li>
                );
              })}
              {!shown.length && <li className="hub-muted">No groups match your search.</li>}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
