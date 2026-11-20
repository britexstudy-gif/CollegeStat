import type { BuildItem, CTest, ReadSelect, SentenceSet, SpeakingTask, WritingTask } from "./types";

/** Writing, speaking and short task sets for IELTS, TOEFL iBT (2026 format)
 * and the Duolingo English Test. All prompts are original CollegeStat
 * material written to each exam's public task descriptions. */

export const WRITING: WritingTask[] = [
  // IELTS Academic Writing Task 1 (20 minutes, 150+ words)
  {
    id: "ielts-w1-transport",
    exam: "ielts",
    kind: "task1",
    title: "Task 1 · Bar chart: how students travel",
    minutes: 20,
    minWords: 150,
    prompt: "The chart below shows how students at one university travelled to campus in 2005 and 2025.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
    chart: {
      type: "bar",
      title: "Main way of travelling to campus",
      unit: "% of students",
      categories: ["Car", "Bus", "Bicycle", "Walking", "Metro"],
      series: [
        { name: "2005", values: [34, 31, 9, 22, 4] },
        { name: "2025", values: [14, 24, 19, 18, 25] },
      ],
    },
  },
  {
    id: "ielts-w1-energy",
    exam: "ielts",
    kind: "task1",
    title: "Task 1 · Line graph: electricity sources",
    minutes: 20,
    minWords: 150,
    prompt: "The graph below shows the share of electricity generated from three sources in one country between 2000 and 2025.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
    chart: {
      type: "line",
      title: "Share of electricity generation",
      unit: "%",
      categories: ["2000", "2005", "2010", "2015", "2020", "2025"],
      series: [
        { name: "Gas", values: [62, 64, 66, 61, 55, 47] },
        { name: "Hydro", values: [30, 28, 25, 24, 23, 22] },
        { name: "Solar and wind", values: [0, 1, 2, 8, 16, 27] },
      ],
    },
  },
  {
    id: "ielts-w1-library",
    exam: "ielts",
    kind: "task1",
    title: "Task 1 · Table: library use by age",
    minutes: 20,
    minWords: 150,
    prompt: "The table below shows the average number of visits per year to a city's public libraries, by age group, in 2015 and 2025.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
    chart: {
      type: "table",
      title: "Average library visits per person per year",
      unit: "visits",
      categories: ["Under 12", "12–17", "18–30", "31–60", "Over 60"],
      series: [
        { name: "2015", values: [14, 9, 5, 4, 11] },
        { name: "2025", values: [16, 6, 8, 3, 13] },
      ],
    },
  },
  // IELTS Academic Writing Task 2 (40 minutes, 250+ words)
  {
    id: "ielts-w2-online",
    exam: "ielts",
    kind: "task2",
    title: "Task 2 · Opinion: online degrees",
    minutes: 40,
    minWords: 250,
    prompt: "Some people believe that university degrees completed entirely online are as valuable as degrees studied on campus. Others think students miss important experiences if they never attend in person.\n\nDiscuss both views and give your own opinion.\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.",
  },
  {
    id: "ielts-w2-cities",
    exam: "ielts",
    kind: "task2",
    title: "Task 2 · Problem and solution: growing cities",
    minutes: 40,
    minWords: 250,
    prompt: "In many countries, young people are moving from villages and small towns to the largest cities.\n\nWhat problems does this cause, and what measures could be taken to solve them?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.",
  },
  {
    id: "ielts-w2-languages",
    exam: "ielts",
    kind: "task2",
    title: "Task 2 · Agree or disagree: one global language",
    minutes: 40,
    minWords: 250,
    prompt: "As English becomes more widely used for business and study, some people argue that schools should spend less time teaching local languages.\n\nTo what extent do you agree or disagree?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.",
  },
  {
    id: "ielts-w2-gapyear",
    exam: "ielts",
    kind: "task2",
    title: "Task 2 · Advantages and disadvantages: a gap year",
    minutes: 40,
    minWords: 250,
    prompt: "Some students take a year off between finishing school and starting university, to work or travel.\n\nDo the advantages of this outweigh the disadvantages?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.",
  },
  // TOEFL iBT (2026): Write an Email (7 minutes) and Academic Discussion (10 minutes)
  {
    id: "toefl-email-lab",
    exam: "toefl",
    kind: "email",
    title: "Write an Email · Lab session",
    minutes: 7,
    minWords: 80,
    prompt: "You are taking a chemistry course. Last week you missed a required lab session because of a family emergency. Your professor, Dr. Hale, said in class that missed labs cannot normally be repeated.\n\nWrite an email to Dr. Hale. In your email:\n• explain why you missed the session\n• ask whether there is any way to make up the work\n• suggest a time when you could meet",
  },
  {
    id: "toefl-email-club",
    exam: "toefl",
    kind: "email",
    title: "Write an Email · Club event",
    minutes: 7,
    minWords: 80,
    prompt: "You are a member of the university photography club. The club is planning an exhibition, but the room it booked is too small for the number of photographs.\n\nWrite an email to the club president, Maya. In your email:\n• describe the problem with the room\n• suggest a solution\n• offer to help with one task",
  },
  {
    id: "toefl-email-landlord",
    exam: "toefl",
    kind: "email",
    title: "Write an Email · Heating repair",
    minutes: 7,
    minWords: 80,
    prompt: "You rent a room in a shared house near campus. The heating in your room has not worked properly for a week, and the weather is getting colder.\n\nWrite an email to your landlord, Mr. Ortiz. In your email:\n• describe the problem and how long it has lasted\n• explain how it is affecting you\n• ask when it can be repaired",
  },
  {
    id: "toefl-disc-cars",
    exam: "toefl",
    kind: "discussion",
    title: "Academic Discussion · Urban planning",
    minutes: 10,
    minWords: 100,
    prompt: "Your professor is teaching a class on urban planning. Write a post responding to the professor's question. In your response, express and support your opinion, and make a contribution to the discussion in your own words. An effective response will contain at least 100 words.",
    posts: [
      { who: "Dr. Ramos", text: "Many cities are considering closing their central streets to private cars and turning them over to pedestrians, cyclists and public transport. Some say this makes city centres healthier and more pleasant. Others say it hurts local businesses and makes life harder for people who depend on cars. Should cities close their centres to private cars? Why or why not?" },
      { who: "Aidan", text: "I think it's a great idea. When my hometown closed its main square to cars, it became full of cafés and street markets. People spend more time there, so shops actually benefit." },
      { who: "Zarina", text: "I see the benefits, but older people and people with disabilities often rely on cars. If the centre is closed, they may not be able to reach doctors or government offices. Cities need to think about them first." },
    ],
  },
  {
    id: "toefl-disc-exams",
    exam: "toefl",
    kind: "discussion",
    title: "Academic Discussion · Education",
    minutes: 10,
    minWords: 100,
    prompt: "Your professor is teaching a class on education policy. Write a post responding to the professor's question. In your response, express and support your opinion, and make a contribution to the discussion in your own words. An effective response will contain at least 100 words.",
    posts: [
      { who: "Dr. Chen", text: "Some universities have replaced final exams in many courses with projects completed over the whole term. Supporters say projects measure real skills. Critics say they are easier to copy and harder to grade fairly. Which do you think is a better way to assess students: final exams or term projects?" },
      { who: "Lena", text: "Projects, definitely. In a real job nobody asks you to answer questions in two hours without any resources. Projects show whether you can plan and finish something." },
      { who: "Kenji", text: "I prefer exams. With projects, some group members do all the work while others get the same grade. An exam shows what each person knows." },
    ],
  },
  {
    id: "toefl-disc-space",
    exam: "toefl",
    kind: "discussion",
    title: "Academic Discussion · Science funding",
    minutes: 10,
    minWords: 100,
    prompt: "Your professor is teaching a class on public policy. Write a post responding to the professor's question. In your response, express and support your opinion, and make a contribution to the discussion in your own words. An effective response will contain at least 100 words.",
    posts: [
      { who: "Dr. Okafor", text: "Governments have limited budgets for science. Some argue that money should go to research that solves urgent problems, such as disease or climate change. Others believe basic research, such as space exploration, leads to unexpected discoveries. How should governments decide which research to fund?" },
      { who: "Sofia", text: "Urgent problems should come first. People are suffering now, and we already know which diseases need cures." },
      { who: "Timur", text: "Many important inventions came from research that had no obvious purpose at first. If we only fund urgent problems, we may miss the next big discovery." },
    ],
  },
  // Duolingo English Test: Interactive Writing (5 + 3 minutes) and Writing Sample (5 minutes)
  {
    id: "det-int-hobby",
    exam: "duolingo",
    kind: "det-interactive",
    title: "Interactive Writing · A skill you learned",
    minutes: 5,
    minWords: 50,
    prompt: "Describe a skill you learned outside school. How did you learn it, and why was it useful?",
    followUp: "Some people think skills learned outside school are more useful than those taught in class. Do you agree? Why?",
  },
  {
    id: "det-int-city",
    exam: "duolingo",
    kind: "det-interactive",
    title: "Interactive Writing · Your city",
    minutes: 5,
    minWords: 50,
    prompt: "What is one change that would make your city a better place for young people? Explain your idea.",
    followUp: "Who should pay for this change: the government, businesses or residents? Explain.",
  },
  {
    id: "det-int-online",
    exam: "duolingo",
    kind: "det-interactive",
    title: "Interactive Writing · Learning online",
    minutes: 5,
    minWords: 50,
    prompt: "Do you prefer learning from videos online or from a teacher in a classroom? Give reasons.",
    followUp: "Describe a time when learning online did not work well for you. What would have helped?",
  },
  {
    id: "det-sample-decision",
    exam: "duolingo",
    kind: "det-sample",
    title: "Writing Sample · A difficult decision",
    minutes: 5,
    minWords: 50,
    prompt: "Describe a difficult decision you made. What choices did you have, and how did you decide?",
  },
  {
    id: "det-sample-person",
    exam: "duolingo",
    kind: "det-sample",
    title: "Writing Sample · Someone you admire",
    minutes: 5,
    minWords: 50,
    prompt: "Write about a person you admire who is not famous. What have you learned from them?",
  },
];

export const SPEAKING: SpeakingTask[] = [
  { id: "ielts-s1-home", exam: "ielts", kind: "ielts-1", title: "Part 1 · Home town and study", items: ["Where is your home town?", "What do you like most about living there?", "Are you studying or working at the moment?", "What subject would you most like to study at university, and why?"], prepSeconds: 0, speakSeconds: 40 },
  { id: "ielts-s2-place", exam: "ielts", kind: "ielts-2", title: "Part 2 · A place you enjoy visiting", items: ["Describe a place in your country that you enjoy visiting."], bullets: ["where it is", "how often you go there", "what you do there", "and explain why you enjoy visiting this place"], prepSeconds: 60, speakSeconds: 120 },
  { id: "ielts-s3-tourism", exam: "ielts", kind: "ielts-3", title: "Part 3 · Tourism and local places", items: ["Why do some people prefer to travel abroad rather than visit places in their own country?", "What are the advantages and disadvantages of tourism for local communities?", "How might the way people travel change in the next twenty years?"], prepSeconds: 0, speakSeconds: 60 },
  { id: "ielts-s1-routine", exam: "ielts", kind: "ielts-1", title: "Part 1 · Daily routine and weekends", items: ["What time do you usually get up?", "Has your daily routine changed in the last few years?", "What do you usually do at weekends?", "Do you prefer to spend free time alone or with others?"], prepSeconds: 0, speakSeconds: 40 },
  { id: "ielts-s2-teacher", exam: "ielts", kind: "ielts-2", title: "Part 2 · A teacher who influenced you", items: ["Describe a teacher who influenced you."], bullets: ["who this teacher was", "what subject they taught", "what they did that was different", "and explain how they influenced you"], prepSeconds: 60, speakSeconds: 120 },
  { id: "ielts-s3-education", exam: "ielts", kind: "ielts-3", title: "Part 3 · Teachers and learning", items: ["What qualities make a good teacher?", "Will technology ever replace teachers in schools?", "Should teachers be paid according to their students' results?"], prepSeconds: 0, speakSeconds: 60 },
  { id: "toefl-repeat-campus", exam: "toefl", kind: "repeat", title: "Listen and Repeat · Campus tour", items: ["Welcome to the student centre.", "The bookstore is on the ground floor.", "Please sign in at the front desk before entering.", "The computer lab stays open until midnight during exams.", "If you lose your student card, report it to security immediately.", "Group study rooms can be reserved up to a week in advance through the library website.", "Students who need help with their schedule should make an appointment with an academic adviser."], prepSeconds: 0, speakSeconds: 12 },
  { id: "toefl-repeat-lab", exam: "toefl", kind: "repeat", title: "Listen and Repeat · Science lab", items: ["Put on your safety glasses.", "Label every sample clearly.", "Wash your hands before leaving the lab.", "Record your measurements in the notebook provided.", "Never leave a heated liquid without someone watching it.", "Return the equipment to the correct shelf when the experiment is complete.", "Any broken glass should be placed in the yellow container next to the sink, not in the regular bin."], prepSeconds: 0, speakSeconds: 12 },
  { id: "toefl-interview-study", exam: "toefl", kind: "interview", title: "Take an Interview · Study habits", items: ["Thank you for taking part in our survey about study habits. First, where do you usually study, and why?", "Do you prefer studying alone or with other people? Explain.", "Some students listen to music while they study. Do you think this helps or hurts concentration?", "If the university could change one thing to help students study better, what should it be?"], prepSeconds: 0, speakSeconds: 45 },
  { id: "toefl-interview-city", exam: "toefl", kind: "interview", title: "Take an Interview · Transport", items: ["We're researching how students travel. How do you usually get to class?", "What do you like or dislike about public transport where you live?", "Should universities give students free bus passes? Why or why not?", "How do you think transport in cities will change in the future?"], prepSeconds: 0, speakSeconds: 45 },
  { id: "det-speak-sample", exam: "duolingo", kind: "det-sample", title: "Speaking Sample · Advice", items: ["A friend is nervous about moving abroad to study. What advice would you give them, and why?"], prepSeconds: 30, speakSeconds: 180 },
  { id: "det-read-then-speak", exam: "duolingo", kind: "det-read", title: "Read, Then Speak · A celebration", items: ["Talk about a celebration that is important in your family."], bullets: ["what the celebration is", "who takes part", "what people do", "why it matters to you"], prepSeconds: 20, speakSeconds: 90 },
];

/** TOEFL "Complete the Words" (3 minutes) and DET "Read and Complete" (3 minutes). */
export const CTESTS: CTest[] = [
  { id: "toefl-ctw-bees", exam: "toefl", title: "Complete the Words · Honeybees", minutes: 3, text: "Honeybees live in large colonies that can contain tens of thousands of insects. Each col[ony] has a single qu[een], whose main ro[le] is to lay eg[gs]. Worker bees perf[orm] all the oth[er] tasks, such as coll[ecting] nectar, clea[ning] the hive and prot[ecting] it from intr[uders]. Remarkably, a worker's job changes as it grows older." },
  { id: "toefl-ctw-maps", exam: "toefl", title: "Complete the Words · Early maps", minutes: 3, text: "People have drawn maps for thousands of years. The earl[iest] examples were often scra[tched] into clay or dra[wn] on animal sk[ins]. These maps were not alw[ays] accurate, but they hel[ped] travellers rem[ember] important routes and lo[cate] sources of wa[ter]. Over time, maps also beca[me] symbols of political power." },
  { id: "toefl-ctw-sleep", exam: "toefl", title: "Complete the Words · Sleep and memory", minutes: 3, text: "Scientists have long suspected that sleep helps us learn. Dur[ing] deep sleep, the br[ain] appears to rep[lay] experiences from the da[y], which may str[engthen] new memories. In one exp[eriment], students who sl[ept] after studying reme[mbered] more words than tho[se] who stayed awake. Researchers are now exploring how naps affect learning." },
  { id: "toefl-ctw-markets", exam: "toefl", title: "Complete the Words · Bazaars", minutes: 3, text: "For centuries, bazaars were the heart of Central Asian cities. They were pla[ces] where farmers so[ld] fruit, craftsmen disp[layed] their wo[rk] and traders exch[anged] news. Many bazaars were cov[ered] to prot[ect] shoppers from the su[n], and some still op[erate] in the same location today." },
  { id: "det-rc-volcano", exam: "duolingo", title: "Read and Complete · Volcanoes", minutes: 3, text: "Volcanoes form where molten rock reaches the surface of the Earth. Some erup[t] violently, thro[wing] ash high in[to] the sky, while oth[ers] release lava slo[wly]. Although erupt[ions] can be dang[erous], volcanic so[il] is often very fer[tile], which is why many farmers live near them." },
  { id: "det-rc-coffee", exam: "duolingo", title: "Read and Complete · Coffee", minutes: 3, text: "Coffee is one of the most traded farm products in the world. The pla[nt] grows best in war[m] regions with plen[ty] of rain. After the berr[ies] are picked, the see[ds] are dried and roas[ted], which gives coffee its fam[iliar] flavour and col[our]." },
  { id: "det-rc-volunteer", exam: "duolingo", title: "Read and Complete · Volunteering", minutes: 3, text: "Volunteering can benefit both communities and volunteers. Peo[ple] who help oth[ers] often rep[ort] feeling happier and more conn[ected]. Students can also gain usef[ul] skills, such as team[work] and plan[ning], that impress universities and empl[oyers]." },
];

/** DET "Fill in the Blanks": one sentence, one partly given word. */
export const FILL_BLANKS: CTest[] = [
  { id: "det-fib-1", exam: "duolingo", title: "Fill in the Blanks · Set 1", minutes: 3, text: "The museum is clo[sed] on Mondays. ¶ She was too tir[ed] to finish her homework. ¶ Please remem[ber] to bring your passport. ¶ The weather forec[ast] predicts heavy rain tomorrow. ¶ He apolo[gized] for arriving late. ¶ Our neighbours are very frie[ndly]. ¶ The train was del[ayed] by thirty minutes. ¶ I need to impr[ove] my pronunciation." },
  { id: "det-fib-2", exam: "duolingo", title: "Fill in the Blanks · Set 2", minutes: 3, text: "The scientist pub[lished] her results in a journal. ¶ Can you expl[ain] the rules again? ¶ This medicine may cause side eff[ects]. ¶ The two countries signed an agre[ement]. ¶ Prices have incr[eased] sharply this year. ¶ He is resp[onsible] for the team's budget. ¶ The library has a huge coll[ection] of maps. ¶ We must red[uce] waste at home." },
];

/** TOEFL "Build a Sentence": arrange the tiles to reply. One extra tile does not fit. */
export const BUILD: BuildItem[] = [
  { id: "bs-1", message: "Did you finish the reading for tomorrow's seminar?", start: "Not yet,", words: ["but", "I", "plan", "to", "finish", "it", "tonight"], end: ".", extra: "planning" },
  { id: "bs-2", message: "Where should we meet before the presentation?", words: ["How", "about", "the", "café", "next", "to", "the", "library"], end: "?", extra: "at" },
  { id: "bs-3", message: "Why weren't you at the lecture this morning?", start: "I", words: ["had", "a", "doctor's", "appointment", "that", "I", "couldn't", "move"], end: ".", extra: "been" },
  { id: "bs-4", message: "Is the professor's office hour still on Thursday?", start: "No,", words: ["she", "moved", "it", "to", "Friday", "afternoon"], end: ".", extra: "moving" },
  { id: "bs-5", message: "Could you tell me what the assignment is about?", start: "We", words: ["have", "to", "compare", "two", "articles", "on", "climate", "policy"], end: ".", extra: "comparing" },
  { id: "bs-6", message: "Do you know when the library closes tonight?", start: "I think", words: ["it", "stays", "open", "until", "eleven", "during", "exams"], end: ".", extra: "staying" },
  { id: "bs-7", message: "Have you decided which club to join?", start: "Yes,", words: ["I'm", "going", "to", "join", "the", "debate", "society"], end: ".", extra: "joined" },
  { id: "bs-8", message: "What did you think of the guest speaker?", words: ["Her", "talk", "was", "more", "interesting", "than", "I", "expected"], end: ".", extra: "most" },
  { id: "bs-9", message: "Can I borrow your notes from last week?", start: "Sure,", words: ["I'll", "send", "them", "to", "you", "after", "class"], end: ".", extra: "sending" },
  { id: "bs-10", message: "Why is the lab closed today?", start: "Apparently", words: ["they", "are", "replacing", "some", "of", "the", "equipment"], end: ".", extra: "replace" },
];

/** DET "Read and Select": real English words among invented ones. */
export const READ_SELECT: ReadSelect[] = [
  { id: "rs-1", real: ["harvest", "gentle", "obtain", "rumour", "candid", "venture", "fragile", "sincere"], fake: ["plinter", "chovel", "brastic", "dornish", "felm", "quandrel", "spuddle"] },
  { id: "rs-2", real: ["anchor", "ripple", "notion", "sturdy", "vivid", "thrive", "humble", "linger"], fake: ["grenable", "mistow", "trubble", "clastic", "porvent", "snibbet", "foundle"] },
  { id: "rs-3", real: ["meadow", "eager", "ponder", "scarce", "tangle", "verdict", "candle", "absorb"], fake: ["blundery", "chastle", "frimble", "nostric", "plavid", "wendical", "trosk"] },
];

/** DET "Listen and Type". */
export const LISTEN_TYPE: SentenceSet[] = [
  { id: "lt-1", title: "Listen and Type · Set 1", sentences: ["The bus leaves at half past seven.", "Please turn off your phone during the test.", "My sister works at a hospital in the city.", "We should book the tickets before they sell out.", "The meeting has been moved to next Wednesday.", "Most of the students passed the final exam."] },
  { id: "lt-2", title: "Listen and Type · Set 2", sentences: ["I usually walk to school when it is sunny.", "The library has thousands of old newspapers.", "Could you send me the report by Friday?", "He forgot his umbrella on the train.", "The new bridge will open next spring.", "Fresh vegetables are cheaper at the market."] },
];
