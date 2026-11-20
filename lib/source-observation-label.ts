import type {
  Admission,
  Cost,
  DataPoint,
  Deadline,
  Department,
  FinancialAid,
  Media,
  Professor,
  Program,
  ProgramOffer,
  RankingEntry,
  Requirement,
  Research,
  Sourced,
} from "./domain";

type SourceObservation =
  | Sourced
  | Admission
  | Cost
  | DataPoint
  | Deadline
  | Department
  | FinancialAid
  | Media
  | Professor
  | Program
  | ProgramOffer
  | RankingEntry
  | Requirement
  | Research;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function sourceObservationLabel(record: SourceObservation): string {
  if ("metric" in record) return text(record.metric) || "Metric";
  if ("category" in record) return text(record.category) || "Cost";
  if ("acceptance_rate" in record) return "Admissions";
  if ("edition_id" in record) return "Ranking";
  if ("programs" in record) return text(record.programs?.name) || "Program";
  if ("degree_level" in record) return text(record.name) || "Program";
  if ("due_at" in record) return text(record.title) || "Deadline";
  if ("label" in record) return text(record.label) || "Requirement";
  if ("alt" in record) {
    const mediaLabels = {
      campus: "Campus media",
      logo: "University mark",
      faculty: "Faculty media",
    };
    return text(record.alt) || mediaLabels[record.kind] || "Media";
  }
  if ("name" in record) return text(record.name) || "Source observation";
  if ("title" in record) return text(record.title) || "Source observation";
  return "Source observation";
}
