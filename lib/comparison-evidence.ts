import { currency, type University } from "./domain";
import { latestReportedCosts } from "./profile-navigation";
export type ComparisonEvidence = { id: string; group: string; label: string; text: string; detail: string; url?: string };

/** Keep publisher snapshots, survey cohorts and current application dates in separate rows. */
export function comparisonEvidence(u: University): ComparisonEvidence[] {
  const result: ComparisonEvidence[] = [];
  const add = (id: string, group: string, label: string, text: string, detail: string, url?: string) =>
    result.push({ id, group, label, text, detail, url });
  const snapshot = u.publisher_students;
  if (snapshot) {
    const context = `THE ${snapshot.edition} edition · census year not specified`;
    if (snapshot.students != null) add("publisher-students", "Students", "Students · publisher snapshot", snapshot.students.toLocaleString(), context, snapshot.source_url);
    if (snapshot.student_staff_ratio != null) add("publisher-staff", "Students", "Students per staff member · publisher snapshot", snapshot.student_staff_ratio + ":1", context, snapshot.source_url);
    if (snapshot.international_percent != null) add("publisher-international", "Students", "International share · publisher snapshot", snapshot.international_percent + "%", context, snapshot.source_url);
    if (snapshot.female_male_ratio) add("publisher-gender", "Students", "Female : male · publisher categories", snapshot.female_male_ratio, context, snapshot.source_url);
  }
  for (const cost of latestReportedCosts(u.costs)) {
    const key = [cost.category, cost.student_category, cost.currency, cost.period, cost.program_id || "institution"].join("|");
    add("reported-cost|" + key, "Costs", `${cost.category.replaceAll("_", " ")} · ${cost.student_category.replaceAll("_", " ")} · ${cost.currency}`,
      currency(cost.amount, cost.currency), `${cost.year || "Year not stated"} · per ${cost.period}${cost.program_id ? " · programme-specific" : ""}`, cost.source_url || cost.data_sources?.url);
  }
  for (const [metric, label] of Object.entries({ applicants: "Applicants", admitted: "Admitted applicants", sat_reading_25: "SAT reading · 25th percentile", sat_reading_75: "SAT reading · 75th percentile", sat_math_25: "SAT math · 25th percentile", sat_math_75: "SAT math · 75th percentile", act_25: "ACT · 25th percentile", act_75: "ACT · 75th percentile" })) {
    const record = (u.imported_records || []).filter(r => r.metric === metric && r.verification_status === "verified" && r.publication_status === "published")
      .sort((a, b) => (b.reporting_year || 0) - (a.reporting_year || 0))[0];
    if (record) add("survey|" + metric, "Admissions", label, record.value.toLocaleString(),
      [record.period || record.reporting_year, record.cohort, metric.includes("_25") || metric.includes("_75") ? "Historical score distribution, not an entry requirement" : "Reported applicant population"].filter(Boolean).join(" · "), record.source_url);
  }
  for (const d of u.deadlines.filter(d => d.verification_status === "verified")) {
    // Scope is part of the row identity: scholarship-specific admission is not a general deadline.
    add("deadline|" + d.title + "|" + d.student_category, "Admissions", d.title,
      d.due_at.length === 10 ? d.due_at : new Date(d.due_at).toISOString().slice(0, 16).replace("T", " ") + " UTC",
      `${d.cycle} · ${d.student_category} · ${d.timezone}${d.notes ? " · " + d.notes : ""}`, d.source_url || d.application_url);
  }
  const awards = u.university_scholarships.flatMap(l => l.scholarships && l.scholarships.published && l.scholarships.verification_status === "verified" ? [l.scholarships] : []);
  if (awards.length) add("linked-awards", "Financial aid", "Linked scholarship awards", awards.map(a => a.name).join(" · "), "Eligibility and deadlines differ by award; includes closed cycles", "/scholarships?university=" + u.id);
  if (u.university_programs.length) add("official-programs", "Programs & research", "Linked official programs", String(u.university_programs.length), "Official catalogue links; availability must be confirmed for your intake", "/university/" + u.slug + "?tab=Academics");
  const research = u.research_identity;
  if (research) {
    add("research-citations", "Programs & research", "Indexed research citations", research.cited_by_count.toLocaleString(), "OpenAlex · all years · checked " + research.retrieved_at, research.source_url);
    if (research.recent_works_count != null) add("recent-research", "Programs & research", "Recent indexed research works", research.recent_works_count.toLocaleString(), `${research.papers_from_date || "Start not stated"}–${research.papers_to_date || "End not stated"} · checked ${research.papers_checked_at || research.retrieved_at}`, research.papers_source_url || research.source_url);
  }
  return result;
}
