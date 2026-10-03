"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { plannerWeek } from "@/lib/workspace-planner";
export function PlannerWeek({
  today,
  dates,
  selected,
  onSelect,
}: {
  today: string;
  dates: string[];
  selected: string;
  onSelect: (day: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const days = plannerWeek(today, offset);
  const label = days.length
    ? new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(days[3]))
    : "This week";
  return (
    <section className="planner-week" aria-label="Application week">
      <div className="planner-week-heading">
        <h2>
          <CalendarDays size={17} />
          {label}
        </h2>
        <div>
          <button
            aria-label="Previous week"
            onClick={() => setOffset((v) => v - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            onClick={() => {
              setOffset(0);
              onSelect(today);
            }}
          >
            Today
          </button>
          <button
            aria-label="Next week"
            onClick={() => setOffset((v) => v + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="planner-week-days">
        {days.map((day) => {
          const n = dates.filter((d) => d === day).length;
          return (
            <button
              key={day}
              aria-pressed={selected === day}
              className={day === today ? "is-today" : ""}
              onClick={() => onSelect(selected === day ? "" : day)}
              aria-label={`${day}, ${n} scheduled ${n === 1 ? "item" : "items"}`}
            >
              <span>
                {new Intl.DateTimeFormat("en", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(day))}
              </span>
              <strong>{Number(day.slice(-2))}</strong>
              <small>{n ? `${n} ${n === 1 ? "item" : "items"}` : "—"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
