export const guides = [
  {
    id: "compare",
    category: "University Research",
    title: "Look beyond the rankings.",
    subtitle: "A practical guide to comparing universities",
    time: 6,
    icon: "compare",
    body: [
      "Start with the things that will shape your everyday experience: your program, the total cost, teaching style, and where you will live. A university’s overall rank cannot tell you how well its specific program fits your interests.",
      "Build a shortlist with ambitious, realistic, and more accessible options. Compare the same academic year and applicant category wherever possible. Domestic and international tuition may differ substantially.",
      "Read the methodology behind a ranking. A score that emphasizes research may tell you little about undergraduate teaching or financial aid. Keep a note of the original source and when you checked it.",
      "Before deciding, speak to current students, attend virtual open days, and read the program’s official curriculum. Use CollegeStat to organize the research, then verify every application requirement with the university.",
    ],
  },
  {
    id: "sat",
    category: "SAT",
    title: "What does your SAT score really mean?",
    subtitle: "Understand score ranges and admissions context",
    time: 5,
    icon: "chart",
    body: [
      "A published score range describes a group of enrolled or admitted students; it is not a guarantee of admission. Look for the cohort year and whether the statistic represents admitted students, enrolled students, or only students who submitted scores.",
      "Check the current testing policy on each university’s official admissions website. Policies can differ by program, applicant group, and entry year.",
      "Compare your score with the reported middle 50% range, while considering grades, coursework, essays, and other requirements. Build a balanced shortlist rather than predicting outcomes from a single number.",
    ],
  },
  {
    id: "funding",
    category: "Scholarships",
    title: "Your guide to studying abroad, funded.",
    subtitle: "Finding scholarships as an international student",
    time: 8,
    icon: "fund",
    body: [
      "Separate merit scholarships from need-based aid. Merit awards typically assess achievement, while need-based aid assesses family finances. Some scholarships are restricted to a country, degree level, or subject.",
      "Read what the award actually covers: tuition, housing, insurance, travel, or a monthly stipend. Full tuition does not always mean all living costs are covered.",
      "Keep a calendar of application and nomination deadlines. Some awards need a school nomination or a separate application before the university’s admission deadline.",
      "Use official scholarship pages, collect the required documents early, and check renewal conditions. Never assume a sample deadline is the current application deadline.",
    ],
  },
  {
    id: "ielts",
    category: "IELTS",
    title: "Make an English-test plan.",
    subtitle: "IELTS, TOEFL, and program requirements",
    time: 4,
    icon: "book",
    body: [
      "Check which English language tests your program accepts, its overall minimum, and any minimum section scores. Requirements can vary within the same university.",
      "Work backward from the date your results must arrive. Leave time for preparation, available test dates, score delivery, and a possible retake.",
      "Some applicants qualify for a language-test waiver. Read the official policy and request written confirmation rather than assuming your previous instruction language is sufficient.",
    ],
  },
  {
    id: "essays",
    category: "Essays",
    title: "Write an essay that sounds like you.",
    subtitle: "From a useful outline to a thoughtful final draft",
    time: 7,
    icon: "book",
    body: [
      "Start with a concrete experience and what you learned from it. Strong application writing helps a reader understand how you think, what you value, and how you respond to a challenge.",
      "Answer the actual prompt. Use specific examples, keep within the word limit, and leave time to revise for clarity.",
      "Ask a trusted reader whether the essay sounds like you. Feedback should help you communicate your own experiences; the final writing and claims should remain your own.",
    ],
  },
  {
    id: "applications",
    category: "Applications",
    title: "Build your application checklist.",
    subtitle: "A calmer approach to documents and deadlines",
    time: 5,
    icon: "book",
    body: [
      "For each university, record its application portal, program deadline, document requirements, and application fee. Distinguish priority, scholarship, and final admission deadlines.",
      "Request transcripts and recommendations early. Confirm whether translations, certified copies, or specific submission methods are needed.",
      "Review everything before submitting and save the confirmation. Track missing documents in the official applicant portal after submission.",
    ],
  },
];

export const guideSources: Record<string, { title: string; url: string }[]> = {
  compare: [
    {
      title: "QS World University Rankings: official data",
      url: "https://www.qs.com/insights/qs-world-university-rankings-2027-results-table-excel",
    },
    {
      title: "THE 2026 methodology",
      url: "https://www.timeshighereducation.com/world-university-rankings/world-university-rankings-2026-methodology",
    },
  ],
  sat: [
    {
      title: "College Board: understanding SAT scores",
      url: "https://satsuite.collegeboard.org/sat/scores/understanding-scores",
    },
  ],
  funding: [
    {
      title: "EducationUSA: finance your studies",
      url: "https://educationusa.state.gov/your-5-steps-us-study/finance-your-studies",
    },
  ],
  ielts: [
    {
      title: "IELTS: choosing and booking a test",
      url: "https://ielts.org/take-a-test",
    },
  ],
  essays: [
    {
      title: "Common App: first-year application guide",
      url: "https://www.commonapp.org/apply/first-year-students",
    },
  ],
  applications: [
    {
      title: "Common App: first-year application guide",
      url: "https://www.commonapp.org/apply/first-year-students",
    },
  ],
};
export const guideChecklists: Record<string, string[]> = {
  compare: [
    "Choose three priorities for your degree",
    "Select universities to compare",
    "Record the reporting year and student category",
    "Read the course curriculum",
    "Visit an open day or speak to students",
  ],
  sat: [
    "Check each program’s current testing policy",
    "Find the cohort behind its score range",
    "Record section scores separately",
    "Schedule preparation and result delivery",
  ],
  funding: [
    "List tuition and living costs separately",
    "Check nationality and degree eligibility",
    "Record award and admissions deadlines",
    "Review renewal conditions and uncovered costs",
  ],
  ielts: [
    "Confirm accepted tests with the program",
    "Record overall and section requirements",
    "Check waiver eligibility",
    "Allow time for results and a possible retake",
  ],
  essays: [
    "Copy the actual prompt and word limit",
    "Choose a specific personal example",
    "Draft in your own voice",
    "Ask a reader for clarity feedback",
    "Proofread the final submission",
  ],
  applications: [
    "Choose the official application portal",
    "Record the program and funding deadlines",
    "Request transcripts and references",
    "Confirm translations and submission rules",
    "Save confirmation and track missing documents",
  ],
};
