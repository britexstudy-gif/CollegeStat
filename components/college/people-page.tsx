"use client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useCollege } from "./provider";
import { Leaderboard, StudentsLikeMe, StudyGroups } from "./student-people";
import { useProgress } from "@/lib/progress-store";
import { utcDay, weeklySummary } from "@/lib/student-progress";
import type { IntakePreferences } from "@/lib/student-intake";
import "./student-home.css";
import "./student-hub.css";

const KEY = "collegestat-community:";

/** Optional community: study groups (clubs) and the weekly leaderboard stay
 * off until the student turns them on. */
export function PeoplePage() {
  const college = useCollege();
  const owner = college.user?.id ?? null;
  const prefs = (college.profile?.preferences || {}) as IntakePreferences;
  const { events } = useProgress(owner);
  const weekly = weeklySummary(events, utcDay()).xp;
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    let value = false;
    try {
      value = localStorage.getItem(KEY + owner) === "on";
    } catch {}
    queueMicrotask(() => alive && setOn(value));
    return () => {
      alive = false;
    };
  }, [owner]);
  const toggle = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(KEY + owner, next ? "on" : "off");
    } catch {}
  };
  if (!owner) return null;
  return (
    <div className="sh-home hub people-page">
      <header className="people-head">
        <span>
          <Users size={20} aria-hidden="true" />
        </span>
        <div>
          <h1>People</h1>
          <p>Optional. Study with others who share your goals. You only show what you choose to share.</p>
        </div>
        {on && (
          <label className="people-switch">
            <input type="checkbox" checked onChange={() => toggle(false)} />
            Community on
          </label>
        )}
      </header>
      {on === null ? null : on ? (
        <div className="people-grid">
          <StudyGroups owner={owner} prefs={prefs} />
          <div className="people-side">
            <Leaderboard
              key={college.profile?.display_name || ""}
              owner={owner}
              displayName={college.profile?.display_name || ""}
              weeklyXp={weekly}
            />
            <StudentsLikeMe prefs={prefs} />
          </div>
        </div>
      ) : (
        <section className="people-optin">
          <h2>Community is turned off</h2>
          <p>
            Turn it on to create or join study groups made by students, appear on the weekly effort
            leaderboard with a name you choose, and see which universities similar students save. Nothing is shared
            until you join something, and you can turn it off at any time.
          </p>
          <button type="button" className="hub-btn hub-btn-primary" onClick={() => toggle(true)}>
            Turn on community
          </button>
        </section>
      )}
    </div>
  );
}
