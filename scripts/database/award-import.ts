import { globalCatalogue } from "../../server/global-catalogue";
import { currentScholarships } from "../../server/scholarship-catalogue";
import applicationDates from "../../data/published/application-dates-current.json";
import requirements from "../../data/published/requirements-current.json";
import reviewedPolicies from "../../data/published/reviewed-requirements-oct05.json";
import reviewedApplications from "../../data/published/reviewed-application-rounds-oct05.json";
const literal = (v: unknown) =>
  v == null
    ? "null"
    : typeof v === "boolean" || typeof v === "number"
      ? String(v)
      : "'" +
        (typeof v === "object" ? JSON.stringify(v) : String(v)).replaceAll(
          "'",
          "''",
        ) +
        "'";
export function awardImportSQL() {
  const evidence = [
    "-- Reviewed October 2026 awards, application dates and entry requirements. Run after 01 and 02.",
    "-- Awards/dates preserve existing rows. Reviewed requirements replace older snapshots only.",
    "begin;",
  ];
  function insert(
    table: string,
    row: Record<string, unknown>,
    reviewedAt?: "retrieved_at" | "verified_at",
  ) {
    const keys = Object.keys(row);
    const fields = keys.filter((key) => key !== "id");
    // Only the explicitly reviewed requirement batch can supersede a seed. A
    // newer administrator edit and an unchanged row survive repeat imports.
    const conflict = reviewedAt
      ? `on conflict(id) do update set ${fields.map((key) => key + "=excluded." + key).join(",")} where coalesce(public.${table}.${reviewedAt},'-infinity'::timestamptz)<=excluded.${reviewedAt} and (${fields.map((key) => "public." + table + "." + key).join(",")}) is distinct from (${fields.map((key) => "excluded." + key).join(",")})${table === "requirements" ? " and public.requirements.university_id=excluded.university_id and public.requirements.verification_status='verified'" : ""}`
      : "on conflict do nothing";
    evidence.push(
      `insert into public.${table} (${keys.join(",")}) values (${keys.map((k) => literal(row[k])).join(",")}) ${conflict};`,
    );
  }
  for (const award of currentScholarships) {
    insert("data_sources", {
      ...award.data_sources!,
      source_type: "scholarship",
      trust_level: "high",
    });
    const university_scholarships = award.university_scholarships;
    const record = Object.fromEntries(
      Object.entries(award).filter(
        ([key]) =>
          !["university_scholarships", "data_sources", "source_url"].includes(
            key,
          ),
      ),
    );
    insert("scholarships", record);
    for (const link of university_scholarships)
      insert("university_scholarships", {
        university_id: link.university_id,
        scholarship_id: award.id,
      });
  }
  for (const program of reviewedApplications.programs) insert("programs", program);
  for (const deadline of applicationDates) {
    insert("data_sources", {
      id: deadline.source_id,
      name: deadline.title + " · official dates",
      organization: globalCatalogue.find((u) => u.id === deadline.university_id)
        ?.name,
      url: deadline.source_url,
      source_type: "official",
      retrieved_at: deadline.verified_at,
      trust_level: "high",
    });
    insert("deadlines", {
      ...deadline,
      due_at: deadline.due_at.length === 10 ? null : deadline.due_at,
      due_date: deadline.due_at.length === 10 ? deadline.due_at : null,
    });
  }
  // Programme-scoped requirements retain their FK and explicit scope.
  for (const program of reviewedPolicies.programs) insert("programs", program);
  for (const requirement of requirements) {
    insert(
      "data_sources",
      { ...requirement.data_sources, trust_level: "high" },
      "retrieved_at",
    );
    const record = Object.fromEntries(
      Object.entries(requirement).filter(([key]) => key !== "data_sources"),
    );
    insert("requirements", record, "verified_at");
    // Content changes intentionally invalidate verification. Reaffirm only
    // exact content from this reviewed batch; leave different staff drafts alone.
    const content = Object.keys(record).filter(
      (key) => !["id", "verification_status", "verified_at"].includes(key),
    );
    evidence.push(
      `update public.requirements set verification_status='verified',verified_at=${literal(requirement.verified_at)} where id=${literal(requirement.id)} and verification_status='needs_review' and verified_at is null and (${content.join(",")}) is not distinct from (${content.map((key) => literal(record[key])).join(",")});`,
    );
  }
  evidence.push("commit;");
  return evidence.join("\n");
}
