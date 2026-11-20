/** Shapes for the official-format practice sets. Every passage, prompt and
 * question in lib/test-prep is original CollegeStat material written to the
 * public format specifications of each exam; none is copied from an exam board
 * or a third party. */

/** IELTS-style question groups (reading and listening). */
export type GroupKind =
  | "tfng" // TRUE / FALSE / NOT GIVEN
  | "ynng" // YES / NO / NOT GIVEN
  | "mcq" // one letter from the item's own options
  | "gap" // type a word or number
  | "match"; // pick a key from the group's option list

export type IeltsItem = {
  n: number;
  /** Statement, question stem, or the text around a gap ("___" marks the gap). */
  prompt: string;
  /** For mcq: options A–D. */
  options?: string[];
  /** Accepted answers. tfng: "TRUE" | "FALSE" | "NOT GIVEN"; mcq: "A".."D"; match: the option key; gap: words. */
  answer: string[];
  expl: string;
};

export type IeltsGroup = {
  kind: GroupKind;
  /** "Questions 1–6" is built from the items; this is the instruction line. */
  instructions: string;
  /** Word limit for gap tasks, e.g. "ONE WORD ONLY". */
  limit?: string;
  title?: string;
  /** Option list for matching tasks (key + text). */
  options?: { key: string; text: string }[];
  items: IeltsItem[];
};

export type IeltsPassage = {
  title: string;
  /** Labelled paragraphs (A, B, C…) when a task refers to them. */
  paragraphs: { label?: string; text: string }[];
  groups: IeltsGroup[];
};

export type IeltsReadingTest = { id: string; title: string; passages: IeltsPassage[] };

export type IeltsListeningPart = {
  context: string;
  /** Read aloud by the browser voice; shown after the test. */
  transcript: { who?: string; voice?: "a" | "b"; text: string }[];
  groups: IeltsGroup[];
};
export type IeltsListeningTest = { id: string; title: string; parts: IeltsListeningPart[] };

/** A chart for IELTS Writing Task 1, drawn as SVG. */
export type TaskChart = {
  type: "bar" | "line" | "table";
  title: string;
  unit: string;
  categories: string[];
  series: { name: string; values: number[] }[];
};

export type WritingTask = {
  id: string;
  exam: "ielts" | "toefl" | "duolingo";
  kind: "task1" | "task2" | "email" | "discussion" | "det-photo" | "det-interactive" | "det-sample";
  title: string;
  minutes: number;
  minWords: number;
  /** Shown above the box. Blank lines separate paragraphs. */
  prompt: string;
  chart?: TaskChart;
  /** Academic discussion: the professor's question, then two student posts. */
  posts?: { who: string; text: string }[];
  /** DET photo tasks: an illustration described in words (no photo rights needed). */
  scene?: string;
  /** Interactive writing: a follow-up shown after the first answer. */
  followUp?: string;
};

export type SpeakingTask = {
  id: string;
  exam: "ielts" | "toefl" | "duolingo";
  kind: "ielts-1" | "ielts-2" | "ielts-3" | "repeat" | "interview" | "det-sample" | "det-read";
  title: string;
  /** Questions read aloud one by one (or sentences to repeat). */
  items: string[];
  /** Cue-card bullet points for IELTS Part 2. */
  bullets?: string[];
  prepSeconds: number;
  speakSeconds: number;
};

/** "Complete the Words" (TOEFL) and "Read and Complete" (DET): a paragraph where
 * some words lose their second half. Written as "pref[ix]": "pref" is shown, "ix" is typed. */
export type CTest = { id: string; exam: "toefl" | "duolingo"; title: string; minutes: number; text: string };

/** TOEFL "Build a Sentence": put the word tiles in order to answer the message. */
export type BuildItem = { id: string; message: string; start?: string; words: string[]; end?: string; extra?: string };

/** DET "Read and Select": which are real English words? */
export type ReadSelect = { id: string; real: string[]; fake: string[] };

/** DET "Listen and Type" / TOEFL "Listen and Repeat" sentence sets. */
export type SentenceSet = { id: string; title: string; sentences: string[] };
