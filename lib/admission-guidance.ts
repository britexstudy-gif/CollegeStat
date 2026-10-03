export type ApplicationLevel = "undergraduate" | "postgraduate";
export function applicationChecklist(level: ApplicationLevel) {
  return [
    {
      title: "Academic qualification",
      text:
        level === "postgraduate"
          ? "Confirm the accepted prior degree, required subject background and minimum result for your programme."
          : "Confirm that your school qualification is accepted and check the required subjects and grades for your course.",
    },
    {
      title: "Language evidence",
      text: "Check the teaching language, accepted tests, minimum scores, validity periods and exemptions.",
    },
    {
      title: "Academic documents",
      text:
        level === "postgraduate"
          ? "Check whether you need degree certificates, university transcripts, translations and a CV."
          : "Check whether you need school transcripts, predicted results, final certificates and translations.",
    },
    {
      title: "Extra assessments",
      text:
        level === "postgraduate"
          ? "Check whether your programme requests references, a statement, portfolio, interview or research proposal."
          : "Check whether your course requests references, essays, an entrance test, portfolio or interview.",
    },
    {
      title: "Applicant category",
      text: "Confirm the instructions for your qualifications, residency and entry route, including transfer or foundation study.",
    },
    {
      title: "Dates & submission",
      text: "Confirm the intake, deadline and time zone, application portal, fee or waiver, and how documents must be sent.",
    },
  ];
}
