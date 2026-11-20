import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  awardFor,
  dailyQuests,
  journeyFor,
  levelFor,
  localCheckin,
  streakFor,
  weekFor,
  weeklySummary,
  type ActivityEvent,
} from "../lib/student-progress";

const ev = (day: string, kind: ActivityEvent["kind"] = "practice", ref = "math", xp = 20): ActivityEvent => ({ kind, ref, day, xp });

test("awards mirror the database: duplicates ignored, daily caps give 0 XP", () => {
  const day = "2026-10-20";
  const events = [ev(day, "ai", "a"), ev(day, "ai", "b"), ev(day, "ai", "c")];
  assert.equal(awardFor(events, "ai", "a", day), null);
  assert.equal(awardFor(events, "ai", "d", day), 0);
  assert.equal(awardFor(events, "practice", "math", day), 20);
  assert.equal(awardFor(events, "ai", "a", "2026-10-21"), 10);
});

test("streak counts back from today, or from yesterday when today is still open", () => {
  const today = "2026-10-20";
  const days = [0, 1, 2, 4].map((n) => addDays(today, -n));
  assert.deepEqual(streakFor(days.map((d) => ev(d)), today), { current: 3, best: 3, activeToday: true });
  const open = streakFor([1, 2].map((n) => ev(addDays(today, -n))), today);
  assert.equal(open.current, 2);
  assert.equal(open.activeToday, false);
  assert.equal(streakFor([ev(addDays(today, -3))], today).current, 0);
});

test("levels and week view", () => {
  assert.equal(levelFor(0).name, "Explorer");
  assert.deepEqual(
    [levelFor(260).level, levelFor(260).nextName, levelFor(260).pct],
    [3, "Strategist", 4],
  );
  assert.equal(levelFor(99999).pct, 100);
  const week = weekFor([ev("2026-10-19"), ev("2026-10-20", "article", "x", 10)], "2026-10-20");
  assert.equal(week[0].day, "2026-10-19", "weeks start on Monday");
  assert.deepEqual(week.slice(0, 3).map((d) => d.xp), [20, 10, 0]);
  assert.equal(week[2].future, true);
  const summary = weeklySummary([ev("2026-10-19"), ev("2026-10-12")], "2026-10-20");
  assert.deepEqual([summary.xp, summary.lastXp, summary.activeDays], [20, 20, 1]);
});

test("journey picks the first unfinished stage and quests rotate by day", () => {
  const journey = journeyFor({ prefs: {}, profilePct: 100, savedCount: 1, events: [], openTasks: 2, doneTasks: 0 });
  assert.equal(journey.stages[journey.current].id, "shortlist");
  const quests = dailyQuests({
    today: "2026-10-20",
    events: [ev("2026-10-20", "practice", "math")],
    profilePct: 40,
    savedCount: 0,
    trackNames: {},
  });
  assert.equal(quests.length, 3);
  assert.equal(quests[0].id, "profile");
  assert.equal(quests[1].done, true, "any practice set today completes the practice quest");
  const tip = localCheckin({ summary: weeklySummary([], "2026-10-20"), streak: 0, journey });
  assert.match(tip.headline, /fresh week/);
  assert.ok(tip.steps.length <= 3);
});
