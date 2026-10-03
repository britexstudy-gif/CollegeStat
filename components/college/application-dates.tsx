import type { University } from "@/lib/domain";
import { deadlineLabel, deadlineDate } from "@/lib/application-dates";
import { CalendarDays, ArrowUpRight } from "lucide-react";
export function ApplicationDates({ university }: { university: University }) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = [...university.deadlines].sort((a,b) => a.due_at.localeCompare(b.due_at));
  if (!dates.length) return null;
  return <section className="application-dates"><header><CalendarDays size={21}/><div><h2>Application dates</h2><p className="caption">Choose the date for your degree, applicant category and funding route.</p></div></header>
    <div className="application-date-grid">{dates.map(d => <article key={d.id}>
      <span className={"date-status " + (deadlineDate(d) < today ? "closed" : "upcoming")}>{deadlineDate(d) < today ? "Past deadline" : "Upcoming deadline"}</span>
      <h3>{d.title}</h3><time dateTime={d.due_date || d.due_at}>{deadlineLabel(d)}</time>
      <p>{d.cycle} · {d.student_category}</p>{d.notes && <p className="caption">{d.notes}</p>}
      <a className="text-link" href={d.source_url || d.application_url} target="_blank" rel="noreferrer">Official dates <ArrowUpRight size={14}/></a>
    </article>)}</div></section>;
}
