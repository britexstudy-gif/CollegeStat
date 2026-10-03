import type { University } from "./domain";
export type ApplicationPlatformID =
  | "common-app"
  | "ucas"
  | "uni-assist"
  | "studielink"
  | "university-admissions"
  | "studyinfo"
  | "campus-france"
  | "university";
export type ApplicationRoute = {
  platform: ApplicationPlatformID;
  kind: "institution" | "country-guide";
  name: string;
  url: string;
  scope: string;
  steps: string[];
  source: string;
  checked: string;
};
const checked = "2026-09-29";
// Country guidance is deliberately conditional: membership, degree, citizenship
// and programme determine whether a platform is the right route for a student.
type StoredRoute = Omit<ApplicationRoute, "kind">;
const countryRoutes: Record<string, StoredRoute> = {
  US: {
    platform: "common-app",
    name: "Common App",
    url: "https://www.commonapp.org/apply/first-year-students/",
    scope:
      "First-year applicants to participating colleges; some universities use their own application.",
    steps: [
      "Check that your university and intended entry year are listed in Common App.",
      "Create an account, add your colleges, and complete the shared application.",
      "Complete each college’s questions and arrange transcripts and recommendations.",
      "Check each deadline, testing policy, fee or waiver, then submit and monitor the university portal.",
    ],
    source: "https://www.commonapp.org/apply/first-year-students/",
    checked,
  },
  GB: {
    platform: "ucas",
    name: "UCAS",
    url: "https://www.ucas.com/faqs/how-do-i-apply",
    scope:
      "Undergraduate study. Postgraduate applications generally follow each university’s own route.",
    steps: [
      "Register in the UCAS Hub and choose your entry year and undergraduate study.",
      "Find your course and check its qualifications, tests, and deadline.",
      "Complete your application, education details, personal statement questions, and reference.",
      "Submit by the applicable deadline and track decisions in your account.",
    ],
    source: "https://www.ucas.com/faqs/how-do-i-apply",
    checked,
  },
  DE: {
    platform: "uni-assist",
    name: "My assist / university portal",
    url: "https://www.uni-assist.de/en/how-to-apply/apply-online/",
    scope:
      "International qualifications at participating universities. Confirm whether you need a full application, a VPD, or direct application.",
    steps: [
      "Read your university’s instructions to confirm whether uni-assist handles your application.",
      "Choose your course and upload the requested qualifications, translations, and language evidence.",
      "Submit through My assist within the university’s application period.",
      "If a VPD is required, use it to complete the separate application to the university.",
    ],
    source: "https://www.uni-assist.de/en/how-to-apply/apply-online/",
    checked,
  },
  NL: {
    platform: "studielink",
    name: "Studielink + university portal",
    url: "https://www.studyinnl.org/plan-your-stay/how-to-apply",
    scope:
      "Most programmes use Studielink; follow the institution’s instructions for exceptions and selection procedures.",
    steps: [
      "Choose a programme and review its admission and selection requirements.",
      "Check whether the institution asks you to register through Studielink.",
      "Complete any additional university application and document requests.",
      "Check your programme’s deadline and follow the institution’s enrolment instructions.",
    ],
    source: "https://www.studyinnl.org/plan-your-stay/how-to-apply",
    checked,
  },
  SE: {
    platform: "university-admissions",
    name: "Universityadmissions.se",
    url: "https://www.universityadmissions.se/en/apply-to-bachelors/",
    scope:
      "International course and programme applications. Select the correct bachelor’s or master’s instructions.",
    steps: [
      "Create an account and find your courses or programmes.",
      "Rank your choices in your preferred order.",
      "Submit education and language documents, and evidence of citizenship where requested.",
      "Pay an application fee if required and follow the deadlines in your selected admissions round.",
    ],
    source: "https://www.universityadmissions.se/en/apply-to-bachelors/",
    checked,
  },
  FI: {
    platform: "studyinfo",
    name: "Studyinfo",
    url: "https://studyinfo.fi/",
    scope: "Joint or separate applications, depending on the programme.",
    steps: [
      "Find your programme in Studyinfo and check whether it uses a joint or separate application.",
      "Review eligibility, required documents, language evidence, and possible entrance assessments.",
      "Submit during the programme’s application period and follow scholarship instructions.",
      "Track results and confirm your study place by the stated deadline.",
    ],
    source: "https://www.studyinfinland.fi/admissions",
    checked,
  },
  FR: {
    platform: "campus-france",
    name: "Campus France / Études en France",
    url: "https://www.campusfrance.org/en/application-higher-education-france",
    scope:
      "The route depends on citizenship, country of residence, and study level. Not every applicant uses Études en France.",
    steps: [
      "Use Campus France to identify the procedure for your residence, qualifications, and degree level.",
      "Check whether Études en France, a national platform, or direct university application applies.",
      "Prepare the documents and language evidence specified by the programme.",
      "Follow the deadlines of the applicable procedure and the institution.",
    ],
    source:
      "https://www.campusfrance.org/en/application-higher-education-france",
    checked,
  },
};
const institutions: Record<string, StoredRoute> = {
  "mit.edu": {
    platform: "university",
    name: "MIT application",
    url: "https://mitadmissions.org/apply/firstyear/deadlines-requirements/",
    scope: "First-year undergraduate applicants. MIT uses its own application.",
    steps: [
      "Start from MIT’s first-year application instructions.",
      "Complete the application sections, including your essays and activities.",
      "Arrange academic records, recommendations, and required tests.",
      "Use the deadline for your chosen application round and monitor your checklist.",
    ],
    source: "https://mitadmissions.org/apply/firstyear/deadlines-requirements/",
    checked,
  },
  "tum.de": {
    platform: "university",
    name: "TUMonline",
    url: "https://www.tum.de/en/studies/application/application-info-portal/online-application",
    scope:
      "Course-specific applications; applicants with certain international qualifications also need uni-assist documentation.",
    steps: [
      "Find your degree and its application period in TUM’s course directory.",
      "Create your TUMonline account and select the programme and semester.",
      "Upload the programme’s requested documents and check whether a uni-assist VPD is required.",
      "Submit in TUMonline and monitor document checks and the admission decision.",
    ],
    source:
      "https://www.tum.de/en/studies/application/application-info-portal/online-application",
    checked,
  },
  "wiut.uz": {
    platform: "university",
    name: "WIUT Admission System",
    url: "https://admission.wiut.uz/Manual/OverView",
    scope:
      "Choose foundation, direct entry/transfer, or postgraduate instructions for your qualification.",
    steps: [
      "Read the overview and identify the correct entry route.",
      "Register in the WIUT Admission System with your own contact details.",
      "Complete the application and provide the academic and language evidence requested for your route.",
      "Follow any assessment instructions and track your application in the admission system.",
    ],
    source: "https://admission.wiut.uz/Manual/OverView",
    checked,
  },
  "uni-ruse.bg": {
    platform: "university",
    name: "University of Ruse international admissions",
    url: "https://www.uni-ruse.bg/en/directorates/FSD/admissionRequirements",
    scope:
      "International applicants. EU/EEA applicants have a separate route described by the university.",
    steps: [
      "Choose your degree and check the instructions for your citizenship category.",
      "Review the International Students Directorate’s application document list.",
      "Send the requested documents through the route specified by the directorate.",
      "Follow the university’s admission and enrolment instructions for the relevant academic year.",
    ],
    source: "https://www.uni-ruse.bg/en/directorates/FSD/admissionRequirements",
    checked,
  },
  "uibe.edu.cn": {
    platform: "university",
    name: "UIBE International Student Application",
    url: "https://isa.uibe.edu.cn",
    scope:
      "International applicants. The linked 2026 undergraduate brochure is a past-cycle reference; check the next intake before applying.",
    steps: [
      "Choose your degree and teaching language with UIBE’s School of International Education.",
      "Read the brochure for your actual intake; the 2026 undergraduate deadline has passed.",
      "Prepare the qualification, language, and assessment documents requested for your programme.",
      "Apply using the UIBE international student portal and track document requests.",
    ],
    source:
      "https://sie.uibe.edu.cn/en/docs/2026-04/82af2e9c36a843ab90171a1ac6d576a4.pdf",
    checked,
  },
};
export function applicationRoute(u: University): ApplicationRoute | undefined {
  let host = "";
  try {
    host = new URL(u.website || "").hostname.replace(/^www\./, "");
  } catch {}
  const key = Object.keys(institutions).find(
    (d) => host === d || host.endsWith("." + d),
  );
  if (key) return { ...institutions[key], kind: "institution" };
  const country = countryRoutes[u.country_code];
  return country ? { ...country, kind: "country-guide" } : undefined;
}
export function applicationLinks(u: University) {
  const web = u.official_web?.links;
  return [
    { name: "Admissions", url: u.admissions_url || web?.admissions?.url },
    {
      name: "Entry requirements",
      url: u.application_brief?.requirements_source || web?.requirements?.url,
    },
    { name: "Program directory", url: web?.programs?.url },
    { name: "Application portal", url: u.application_url },
    {
      name: "Funding & scholarships",
      url: u.financial_aid_url || web?.scholarships?.url,
    },
    { name: "University website", url: u.website },
  ].filter(
    (l): l is { name: string; url: string } =>
      !!l.url && /^https?:\/\//.test(l.url),
  );
}
