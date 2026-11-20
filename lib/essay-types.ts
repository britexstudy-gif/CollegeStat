/** Essay types students meet in real applications, with the limits and
 * prompts each portal uses. Prompts and limits change; every type links to
 * its official page so students can confirm before submitting. */

export type EssayLimit = { unit: "words" | "chars"; min: number; max: number };
export type EssaySection = { label: string; hint?: string; limit?: EssayLimit };
export type EssayType = {
  id: string;
  name: string;
  group: "Undergraduate" | "Graduate" | "Scholarships & letters";
  blurb: string;
  limit: EssayLimit;
  prompts?: string[];
  /** Separate answer boxes (UCAS questions, activity entries). */
  sections?: EssaySection[];
  /** Sections share one total limit (UCAS) instead of each having its own. */
  sharedLimit?: boolean;
  brainstorm: string[];
  checks: string[];
  source?: { label: string; url: string };
};

const words = (min: number, max: number): EssayLimit => ({ unit: "words", min, max });
const chars = (min: number, max: number): EssayLimit => ({ unit: "chars", min, max });

export const essayTypes: EssayType[] = [
  {
    id: "common_app",
    name: "Common App essay",
    group: "Undergraduate",
    blurb: "The main US essay, sent to every Common App college.",
    limit: words(250, 650),
    prompts: [
      "Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.",
      "The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?",
      "Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?",
      "Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?",
      "Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.",
      "Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?",
      "Share an essay on any topic of your choice. It can be one you’ve already written, one that responds to a different prompt, or one of your own design.",
    ],
    brainstorm: [
      "List three moments when you changed your mind about something important.",
      "What do you do when nobody is grading you?",
      "Which small object, place or habit says the most about you? Why?",
      "What would a close friend say you care about too much?",
    ],
    checks: [
      "Opens inside a specific moment, not a quote or definition",
      "Shows reflection: what you think now that you didn’t before",
      "Sounds like you when read aloud",
      "Between 250 and 650 words",
    ],
    source: { label: "Common App essay prompts", url: "https://www.commonapp.org/apply/essay-prompts" },
  },
  {
    id: "ucas",
    name: "UCAS personal statement",
    group: "Undergraduate",
    blurb: "UK applications: three questions, one shared 4,000-character limit.",
    limit: chars(1050, 4000),
    sharedLimit: true,
    sections: [
      { label: "Why do you want to study this course or subject?", hint: "Your motivation, with a concrete example.", limit: chars(350, 4000) },
      { label: "How have your qualifications and studies helped you to prepare for this course or subject?", hint: "Link school subjects and projects to the course.", limit: chars(350, 4000) },
      { label: "What else have you done to prepare outside of education, and why are these experiences useful?", hint: "Reading, work, volunteering, competitions, responsibilities.", limit: chars(350, 4000) },
    ],
    brainstorm: [
      "Which lesson, book or problem first made you want this subject?",
      "Which piece of school work best shows the skills this course needs?",
      "What have you done on your own time that relates to the subject?",
      "What do you want to explore at university that school didn’t cover?",
    ],
    checks: [
      "Each answer has at least 350 characters",
      "Total stays within 4,000 characters including spaces",
      "Most of the statement is about the subject, not general achievements",
      "No university is named (the same statement goes to all five choices)",
    ],
    source: { label: "UCAS personal statement guide", url: "https://www.ucas.com/applying/applying-to-university/writing-your-personal-statement" },
  },
  {
    id: "why_us",
    name: "“Why this university?”",
    group: "Undergraduate",
    blurb: "A supplement that proves you know the university and fit it.",
    limit: words(100, 350),
    prompts: [
      "Why do you want to attend this university? (Replace with the exact prompt from the university.)",
      "Why are you interested in this major or programme at this university?",
      "What do you hope to contribute to our campus community, and how will studying here help you get there?",
    ],
    brainstorm: [
      "Name two courses, professors, labs or programmes you would actually use.",
      "What can you do there that you can’t do elsewhere?",
      "How would you contribute to campus, not just benefit from it?",
    ],
    checks: [
      "Mentions at least two specific, verified details from the official site",
      "Connects each detail to your own goals or experience",
      "Couldn’t be pasted into another university’s essay",
      "Within the university’s word limit",
    ],
  },
  {
    id: "activities",
    name: "Activity descriptions",
    group: "Undergraduate",
    blurb: "Common App activities: 150 characters each, up to 10.",
    limit: chars(0, 1500),
    sections: Array.from({ length: 10 }, (_, i) => ({
      label: `Activity ${i + 1}`,
      hint: i === 0 ? "Start with a strong verb. Add numbers: hours, people, results." : undefined,
      limit: chars(0, 150),
    })),
    brainstorm: [
      "What did you build, lead, organise or improve?",
      "Which numbers show impact: people reached, money raised, hours per week?",
      "Order activities by importance to you, not by date.",
    ],
    checks: [
      "Every description is 150 characters or fewer",
      "Starts with an action verb, skips “I”",
      "Includes at least one concrete result or number",
      "Most important activities come first",
    ],
    source: { label: "Common App activities section", url: "https://www.commonapp.org/" },
  },
  {
    id: "short_answer",
    name: "Short answer",
    group: "Undergraduate",
    blurb: "50–250 word supplements: favourite book, intellectual interest, a quote.",
    limit: words(50, 250),
    prompts: [
      "Describe an intellectual interest and how you have pursued it.",
      "What is a book, film or idea that changed how you think?",
      "Tell us about something you do for fun.",
    ],
    brainstorm: ["What would you talk about for an hour without notes?", "Which detail would surprise the reader?"],
    checks: ["Answers the exact question in the first sentence", "One idea, developed with a specific example", "Within the word limit"],
  },
  {
    id: "community",
    name: "Community / diversity essay",
    group: "Undergraduate",
    blurb: "Describe a community you belong to and your role in it.",
    limit: words(200, 400),
    prompts: ["Describe one of the communities you belong to and your place within it. How have you contributed, and how has it shaped you?"],
    brainstorm: ["Which groups do you belong to: family, team, online, cultural, school?", "What have you given back to one of them?"],
    checks: ["Defines the community clearly", "Shows your actions, not just belonging", "Explains what you’d bring to campus"],
  },
  {
    id: "statement",
    name: "Personal statement (general)",
    group: "Undergraduate",
    blurb: "A general statement for portals with their own prompt.",
    limit: words(400, 650),
    prompts: ["What experience shaped what you want to study? Connect one specific example to the questions you want to explore next."],
    brainstorm: ["When did you first notice this subject outside class?", "What question about it do you still want answered?"],
    checks: [
      "A specific experience in your own words",
      "What you learned or changed",
      "A clear connection to your intended subject",
      "Programme details checked against its official page",
    ],
  },
  {
    id: "sop",
    name: "Statement of purpose",
    group: "Graduate",
    blurb: "Master’s and PhD: your research interests, preparation and goals.",
    limit: words(600, 1000),
    prompts: ["Describe your academic background, research interests and goals, and why this programme is the right next step."],
    brainstorm: [
      "Which research question do you want to work on, in one sentence?",
      "Which project or thesis best prepared you, and what did you do yourself?",
      "Which two faculty members or labs match your interests?",
      "Where do you want to be five years after the degree?",
    ],
    checks: [
      "States a focused research interest early",
      "Gives evidence of preparation with your own role",
      "Names specific faculty, labs or courses (verified)",
      "Ends with clear career or research goals",
    ],
  },
  {
    id: "research",
    name: "Research proposal",
    group: "Graduate",
    blurb: "PhD and research master’s: a short, structured plan.",
    limit: words(800, 2000),
    sections: [
      { label: "Working title" },
      { label: "Background and gap", hint: "What is known, and what is missing?" },
      { label: "Research questions" },
      { label: "Methods and data" },
      { label: "Timeline and expected contribution" },
    ],
    brainstorm: ["What problem would you study for three years?", "Which recent papers frame the gap?"],
    checks: ["Clear, answerable research questions", "Methods fit the questions", "Realistic timeline", "References use a consistent style"],
  },
  {
    id: "scholarship",
    name: "Scholarship essay",
    group: "Scholarships & letters",
    blurb: "Show impact, need or leadership in the funder’s own terms.",
    limit: words(250, 600),
    prompts: [
      "Describe your leadership experience and how you will use this scholarship to make an impact.",
      "Explain your goals and how this award would help you achieve them.",
      "Why should we choose you? Tell us who you are, what you have done with what you had, and what you will do next.",
    ],
    brainstorm: ["What does this funder value? Read its mission statement.", "Which story proves you share it?", "What will you do with the degree?"],
    checks: ["Matches the funder’s stated criteria", "Concrete plans for after graduation", "Within the limit and the official deadline"],
  },
  {
    id: "motivation",
    name: "Motivation letter",
    group: "Scholarships & letters",
    blurb: "European programmes: why this course, why you, why now.",
    limit: words(300, 600),
    prompts: ["Explain why this course fits your preparation and goals. Use two specific course features, supported by its official page."],
    brainstorm: ["Which modules or teachers drew you to the course?", "Which project shows you are ready for it?"],
    checks: [
      "Correct course and institution names",
      "Evidence of your preparation",
      "Your reason for choosing this programme",
      "Its current format and word limit checked",
    ],
  },
  {
    id: "recommendation",
    name: "Recommendation request",
    group: "Scholarships & letters",
    blurb: "A polite, complete email asking a teacher for a reference.",
    limit: words(80, 250),
    prompts: ["Ask a teacher who knows your work. Include your deadline, the submission route and material that helps them write independently."],
    brainstorm: ["Which teacher saw your best work?", "What can you give them: a summary, deadlines, your goals?"],
    checks: [
      "Enough notice before the confirmed deadline",
      "The correct submission route",
      "Your goals and relevant work attached",
      "The recommender writes and submits their own letter",
    ],
  },
];

export const essayType = (id: string) => essayTypes.find((t) => t.id === id) || essayTypes[0];

/** Words or characters, the way portals count them. */
export const countText = (text: string, unit: EssayLimit["unit"]) =>
  unit === "chars" ? text.length : text.trim() ? text.trim().split(/\s+/).length : 0;

/** Sectioned drafts are stored as one body with "### label" headings. */
export function joinSections(type: EssayType, parts: string[]) {
  return (type.sections || []).map((s, i) => `### ${s.label}\n${(parts[i] || "").trim()}`).join("\n\n");
}
export function splitSections(type: EssayType, body: string) {
  const sections = type.sections || [];
  if (!body.includes("### ")) return sections.map((_, i) => (i === 0 ? body : ""));
  const blocks = body.split(/^### /m).filter(Boolean);
  return sections.map((s) => {
    const block = blocks.find((b) => b.startsWith(s.label));
    return block ? block.slice(s.label.length).trim() : "";
  });
}
