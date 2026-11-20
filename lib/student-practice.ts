/** Original mini exercises, not official SAT/IELTS material or a score predictor. */
export type PracticeQuestion = {
  id: string;
  prompt: string;
  passage?: string;
  options: string[];
  answer: number;
  explanation: string;
};
export const practiceSets: Record<
  string,
  { name: string; skill: string; questions: PracticeQuestion[] }
> = {
  math: {
    name: "SAT-style math",
    skill: "Algebra & problem solving",
    questions: [
      {
        id: "m1",
        prompt: "If 3x + 7 = 22, what is x?",
        options: ["3", "5", "7", "15"],
        answer: 1,
        explanation: "Subtract 7 from both sides: 3x = 15. Divide by 3: x = 5.",
      },
      {
        id: "m2",
        prompt:
          "A jacket costs $80. Its price is reduced by 25%. What is the sale price?",
        options: ["$20", "$55", "$60", "$75"],
        answer: 2,
        explanation:
          "25% of $80 is $20. Subtract that discount from $80 to get $60.",
      },
      {
        id: "m3",
        prompt: "The line y = 2x + b passes through (3, 11). What is b?",
        options: ["2", "3", "5", "8"],
        answer: 2,
        explanation: "Substitute x = 3 and y = 11: 11 = 6 + b, so b = 5.",
      },
      {
        id: "m4",
        prompt:
          "A bag contains 4 blue and 6 red tokens. One token is chosen at random. What is the probability it is blue?",
        options: ["1/4", "2/5", "3/5", "2/3"],
        answer: 1,
        explanation:
          "There are 10 tokens in total. The probability is 4/10, which simplifies to 2/5.",
      },
    ],
  },
  reading: {
    name: "SAT-style reading",
    skill: "Evidence & inference",
    questions: [
      {
        id: "r1",
        passage:
          "A town replaced several car parks with gardens. A year later, surveys showed more residents walking through the center. Researchers cautioned that a new bus route had opened during the same period.",
        prompt: "Which conclusion is best supported?",
        options: [
          "The gardens alone caused the change.",
          "The bus route had no effect.",
          "More residents walked, but the cause is not established.",
          "Car parks should always be removed.",
        ],
        answer: 2,
        explanation:
          "The passage reports increased walking and a second possible influence. It does not establish that the gardens caused the increase.",
      },
      {
        id: "r2",
        passage:
          "Lena expected the experiment to fail. When the first results arrived, however, she began preparing a second trial to check whether the effect could be reproduced.",
        prompt: "What does Lena’s response suggest?",
        options: [
          "She now considers the result worth investigating.",
          "She has proved her original prediction.",
          "She no longer values reproducibility.",
          "She refuses to examine the evidence.",
        ],
        answer: 0,
        explanation:
          "Preparing another trial shows interest in verifying the unexpected effect; it is not a claim of proof.",
      },
      {
        id: "r3",
        passage:
          "The historian describes the archive as fragmentary: some decades are well documented, while others have only a few surviving letters.",
        prompt: "As used here, ‘fragmentary’ most nearly means:",
        options: ["Precise", "Incomplete", "Misleading", "Recent"],
        answer: 1,
        explanation:
          "The uneven survival of records makes the archive incomplete, rather than necessarily inaccurate.",
      },
      {
        id: "r4",
        passage:
          "The team tested the sensor indoors before using it outdoors. This sequence allowed them to establish a baseline without changes in wind or temperature.",
        prompt: "What is the main purpose of the second sentence?",
        options: [
          "To contradict the testing sequence",
          "To describe a competing sensor",
          "To explain the reason for the first test",
          "To predict the final result",
        ],
        answer: 2,
        explanation:
          "The second sentence explains why the team started indoors: controlling environmental variation.",
      },
    ],
  },
  ielts: {
    name: "IELTS-style reading",
    skill: "True, false & not given",
    questions: [
      {
        id: "i1",
        passage:
          "The library opens at 9 a.m. on weekdays and 10 a.m. on Saturdays. It is closed on Sundays.",
        prompt:
          "Statement: The library opens earlier on weekdays than on Saturdays.",
        options: ["True", "False", "Not given"],
        answer: 0,
        explanation:
          "9 a.m. is earlier than 10 a.m., so the statement agrees with the passage.",
      },
      {
        id: "i2",
        passage:
          "The library opens at 9 a.m. on weekdays and 10 a.m. on Saturdays. It is closed on Sundays.",
        prompt: "Statement: Visitors can use the library on Sunday afternoons.",
        options: ["True", "False", "Not given"],
        answer: 1,
        explanation:
          "The passage explicitly says the library is closed on Sundays.",
      },
      {
        id: "i3",
        passage:
          "The new exhibition includes photographs taken in three coastal towns. Entry is free for students who present a valid student card.",
        prompt: "Statement: The photographs were all taken in summer.",
        options: ["True", "False", "Not given"],
        answer: 2,
        explanation:
          "The passage names locations, but gives no season. Absence of information means ‘not given’.",
      },
      {
        id: "i4",
        passage:
          "In a six-month pilot, commuters borrowed bicycles from four stations. The council will examine usage records before deciding whether to extend the service.",
        prompt:
          "Statement: The council has already decided to extend the service.",
        options: ["True", "False", "Not given"],
        answer: 1,
        explanation:
          "The decision will follow the council’s examination of the records; it has not already been made.",
      },
    ],
  },
};

export function practiceResult(
  questions: PracticeQuestion[],
  answers: Record<string, number>,
) {
  const answered = questions.filter(
    (q) =>
      Number.isInteger(answers[q.id]) &&
      answers[q.id] >= 0 &&
      answers[q.id] < q.options.length,
  );
  return {
    answered: answered.length,
    correct: answered.filter((q) => answers[q.id] === q.answer).length,
    total: questions.length,
  };
}
