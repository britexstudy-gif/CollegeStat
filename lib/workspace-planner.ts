import type { ChecklistItem } from "@/services/workspace";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function validPlanDate(value: string | null): value is string {
  if (!value || !datePattern.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function dueLabel(value: string, today: string) {
  if (!validPlanDate(value) || !validPlanDate(today)) return "Date to confirm";
  const days = Math.round((Date.parse(value) - Date.parse(today)) / 86400000);
  if (days < 0)
    return `${Math.abs(days)} ${days === -1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `In ${days} days`;
}
export function prioritizeTasks(tasks: ChecklistItem[]) {
  return tasks
    .filter((task) => !task.done)
    .sort((a, b) => {
      const first = validPlanDate(a.due_at) ? a.due_at : "9999-12-31";
      const second = validPlanDate(b.due_at) ? b.due_at : "9999-12-31";
      return (
        first.localeCompare(second) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id)
      );
    });
}
